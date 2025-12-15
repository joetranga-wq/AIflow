#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { validateProject, hasValidationErrors } from "../core/validator.ts";
import { evaluateExpression } from "../core/conditionEngineV2.ts";
import { runToolsForAgent } from "../core/toolsRuntime.mts";
import { resolveRunConfig } from "../shared/runConfig.ts";

const runConfig = resolveRunConfig(process.env);
const MOCK_LLM = runConfig.mode === "sim";

// Bridge for backward-compat: downstream code may still check AIFLOW_MOCK_LLM
if (MOCK_LLM) {
  process.env.AIFLOW_MOCK_LLM = "1";
}

// If set: disables actual sleeping (still records intended backoffAppliedMs)
const DISABLE_SLEEP_BACKOFF = process.env.AIFLOW_DISABLE_SLEEP_BACKOFF === "1";

// Cap sleep to avoid very long pauses (still deterministic)
const BACKOFF_CAP_MS = Number(process.env.AIFLOW_BACKOFF_CAP_MS ?? "60000"); // 60s default

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ✅ NEW: deterministic timestamps for sim mode
function nowMsDeterministic(isSim: boolean): number {
  return isSim ? 0 : Date.now();
}

// -----------------------------
// Simulation helpers (deterministic, seed-based, no network)
// -----------------------------
function hashToInt(input: string): number {
  const h = createHash("sha256").update(input).digest("hex").slice(0, 8);
  return parseInt(h, 16);
}

function stablePick<T>(arr: T[], n: number): T {
  return arr[n % arr.length];
}

function classifyTicketType(ticketText: string): "technical" | "billing" | "general" {
  const t = String(ticketText ?? "").toLowerCase();

  // Controlled, minimal heuristics (no scope creep)
  if (t.includes("500") || t.includes("error") || t.includes("fout") || t.includes("inloggen")) {
    return "technical";
  }
  if (t.includes("factuur") || t.includes("betaling") || t.includes("invoice") || t.includes("refund")) {
    return "billing";
  }
  return "general";
}

function simulateParsedOutput(params: {
  agentId: string;
  agentName?: string;
  role?: string;
  outputFormat?: string;
  contextSnapshot: Record<string, any>;
  seed: number;
}): any {
  const { agentId, agentName, role, outputFormat, contextSnapshot, seed } = params;

  const base = `${seed}::${agentId}::${JSON.stringify(contextSnapshot)}`;
  const x = hashToInt(base);

  const fmt = String(outputFormat ?? "text").toLowerCase();

  if (fmt === "json") {
    const looksLikeClassifier =
      String(role ?? "").toLowerCase().includes("classifier") ||
      String(agentName ?? "").toLowerCase().includes("triage");

    if (looksLikeClassifier) {
      const tt = classifyTicketType(contextSnapshot.ticket_text);
      return {
        simulated: true,
        ticket_type: tt,
        signature: `sim-${seed}-${agentId}-${x}`,
      };
    }

    return {
      simulated: true,
      agentId,
      agentName: agentName ?? agentId,
      role: role ?? "Agent",
      decision: stablePick(["A", "B", "C", "D"], x),
      signature: `sim-${seed}-${agentId}-${x}`,
    };
  }

  return `SIMULATED_OUTPUT(${agentId}) seed=${seed} sig=${x}`;
}

/**
 * Parse output naar JSON als het kan.
 * - support direct JSON
 * - support prose + ```json ... ``` fenced blocks (neemt de LAATSTE json block)
 */
export function tryParseJson(text: string): any {
  if (!text) return text;
  const raw = String(text);

  // 1) direct JSON
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // 2) extract LAST fenced ```json ... ```
  const fenceRegex = /```json\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null = null;
  let lastJsonBlock: string | null = null;

  while ((match = fenceRegex.exec(raw)) !== null) {
    lastJsonBlock = match[1];
  }

  if (lastJsonBlock) {
    const cleaned = lastJsonBlock.trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // fallthrough
    }
  }

  // 3) backwards-compat: strip generic fences
  const cleanedGeneric = raw
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleanedGeneric);
  } catch {
    return raw;
  }
}

// ✅ Safe snapshot helper (truthful inputContext, voorkomt mutation-leaks)
function cloneJsonSafe<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    if (obj && typeof obj === "object") return { ...(obj as any) };
    return obj;
  }
}

// -----------------------------
// Retry / Error classification (v2 + backoff support)
// -----------------------------
type ErrorClass = "transient" | "hard" | "unknown";
type ErrorCode = "timeout" | "rate_limit" | "network";
type RetryOnItem = ErrorClass | ErrorCode;

function resolveRetryPolicy(agent: any): { maxAttempts: number; retryOn: Array<RetryOnItem> } {
  const envMax = Number(process.env.AIFLOW_LLM_MAX_ATTEMPTS ?? "2");
  const agentMaxRaw = agent?.retryPolicy?.maxAttempts;

  const agentMax = Number(agentMaxRaw);
  const maxAttempts = Math.max(
    1,
    Number.isFinite(agentMax) ? agentMax : Number.isFinite(envMax) ? envMax : 2
  );

  const retryOnRaw = agent?.retryPolicy?.retryOn;

  const allowed: Array<RetryOnItem> = [
    "transient",
    "hard",
    "unknown",
    "timeout",
    "rate_limit",
    "network",
  ];

  const retryOn: Array<RetryOnItem> = Array.isArray(retryOnRaw)
    ? retryOnRaw.filter((x: any) => allowed.includes(x))
    : ["transient"];

  return { maxAttempts, retryOn };
}

export function classifyLLMErrorV2(err: any): { errorClass: ErrorClass; errorCode?: ErrorCode } {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();
  const status = String(err?.status ?? err?.response?.status ?? "");

  // hard
  if (status === "400" || status === "401" || status === "403") {
    return { errorClass: "hard" };
  }

  // transient: rate limits
  if (status === "429" || msg.includes("429") || msg.includes("resource_exhausted")) {
    if (
      msg.includes("requests per day") ||
      msg.includes("quota exceeded for metric") ||
      msg.includes("generaterequestsperday") ||
      msg.includes("generativelanguage.googleapis.com/generate_content_free_tier_requests")
    ) {
      return { errorClass: "hard", errorCode: "rate_limit" };
    }
    return { errorClass: "transient", errorCode: "rate_limit" };
  }

  // timeout
  if (msg.includes("timeout")) return { errorClass: "transient", errorCode: "timeout" };
  if (code.includes("etimedout")) return { errorClass: "transient", errorCode: "timeout" };

  // network/unavailable
  if (status === "503" || msg.includes("503") || msg.includes("unavailable")) {
    return { errorClass: "transient", errorCode: "network" };
  }
  if (msg.includes("fetch failed")) return { errorClass: "transient", errorCode: "network" };
  if (code.includes("econnreset")) return { errorClass: "transient", errorCode: "network" };

  return { errorClass: "unknown" };
}

export function shouldRetryFromPolicyV2(params: {
  errorClass: ErrorClass;
  errorCode?: ErrorCode;
  attempt: number;
  maxAttempts: number;
  retryOn: Array<RetryOnItem>;
}): { shouldRetry: boolean; retryReason: string } {
  const { errorClass, errorCode, attempt, maxAttempts, retryOn } = params;

  const hasMoreAttempts = attempt < maxAttempts;
  if (!hasMoreAttempts) return { shouldRetry: false, retryReason: "max_attempts_reached" };

  if (errorClass === "hard") return { shouldRetry: false, retryReason: "hard_error" };

  if (errorCode && retryOn.includes(errorCode)) {
    return { shouldRetry: true, retryReason: `policy_match:${errorCode}` };
  }

  if (errorClass === "transient" && retryOn.includes("transient")) {
    return { shouldRetry: true, retryReason: "policy_match:transient" };
  }

  return { shouldRetry: false, retryReason: `policy_no_match:${errorCode ?? errorClass}` };
}

function extractRetryDelayMs(err: any): number | null {
  const rawMsg = String(err?.message ?? "");

  try {
    const maybe = JSON.parse(rawMsg);
    const details = maybe?.error?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        const retryDelay = d?.retryDelay;
        if (typeof retryDelay === "string") {
          const m = retryDelay.match(/^(\d+(\.\d+)?)s$/);
          if (m) return Math.round(Number(m[1]) * 1000);
        }
      }
    }
  } catch {
    // ignore
  }

  const m2 = rawMsg.match(/retry in\s+(\d+(\.\d+)?)s/i);
  if (m2) return Math.round(Number(m2[1]) * 1000);

  return null;
}

function computeBackoffMs(params: { attempt: number; errorCode?: ErrorCode; err?: any }): number {
  const { errorCode, err } = params;
  if (errorCode === "rate_limit") {
    const d = extractRetryDelayMs(err);
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      return Math.min(d, BACKOFF_CAP_MS);
    }
    return Math.min(1000, BACKOFF_CAP_MS);
  }
  return 0;
}

// -----------------------------
// Tool directives (v4)
// -----------------------------
type ToolDirective = {
  toolName: string;
  input: Record<string, any>;
  source: "tool_name" | "tool_code";
  raw?: string;
};

function splitToolStatements(toolCode: string): string[] {
  return String(toolCode ?? "")
    .split(/\r?\n|;/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseToolCodeToDirective(toolCodeStatement: string): ToolDirective | null {
  const s = String(toolCodeStatement ?? "").trim();
  if (!s) return null;

  const fnMatch =
    s.match(/print\s*\(\s*([a-zA-Z_]\w*)\s*\(/) ?? s.match(/^([a-zA-Z_]\w*)\s*\(/);

  const toolName = fnMatch?.[1];
  if (!toolName) return null;

  const callStart = s.indexOf(`${toolName}(`);
  if (callStart < 0) return { toolName, input: {}, source: "tool_code", raw: s };

  const argsStart = callStart + toolName.length + 1;

  let depth = 1;
  let i = argsStart;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) break;
    }
  }

  const argsRaw = i > argsStart ? s.slice(argsStart, i).trim() : "";
  const input: Record<string, any> = {};
  if (!argsRaw) return { toolName, input, source: "tool_code", raw: s };

  const parts: string[] = [];
  let buf = "";
  let d = 0;
  let inStr: '"' | "'" | null = null;

  for (let k = 0; k < argsRaw.length; k++) {
    const c = argsRaw[k];

    if (inStr) {
      buf += c;
      if (c === inStr && argsRaw[k - 1] !== "\\") inStr = null;
      continue;
    }

    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }

    if (c === "(") d++;
    if (c === ")") d--;

    if (c === "," && d === 0) {
      parts.push(buf.trim());
      buf = "";
      continue;
    }

    buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const p of parts) {
    const m = p.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (!m) continue;

    const key = m[1];
    const valRaw = m[2].trim();

    const strM = valRaw.match(/^"(.*)"$/) || valRaw.match(/^'(.*)'$/);
    if (strM) {
      input[key] = strM[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
      continue;
    }

    if (valRaw === "true" || valRaw === "True") {
      input[key] = true;
      continue;
    }
    if (valRaw === "false" || valRaw === "False") {
      input[key] = false;
      continue;
    }

    if (/^-?\d+(\.\d+)?$/.test(valRaw)) {
      input[key] = Number(valRaw);
      continue;
    }

    input[key] = valRaw;
  }

  return { toolName, input, source: "tool_code", raw: s };
}

function extractToolDirectives(parsed: any): ToolDirective[] {
  if (!parsed || typeof parsed !== "object") return [];

  const explicitName = String(
    (parsed as any).tool_name ?? (parsed as any).toolName ?? (parsed as any).tool ?? ""
  ).trim();

  if (explicitName) {
    const params =
      (parsed as any).parameters ?? (parsed as any).params ?? (parsed as any).input ?? {};
    const input = params && typeof params === "object" ? params : {};
    return [{ toolName: explicitName, input, source: "tool_name" }];
  }

  const toolCode = (parsed as any).tool_code ?? (parsed as any).toolCode;
  const directives: ToolDirective[] = [];

  if (typeof toolCode === "string" && toolCode.trim().length > 0) {
    const statements = splitToolStatements(toolCode);
    for (const st of statements) {
      const d = parseToolCodeToDirective(st);
      if (d) directives.push(d);
    }
  } else if (Array.isArray(toolCode)) {
    for (const item of toolCode) {
      if (typeof item !== "string") continue;
      const statements = splitToolStatements(item);
      for (const st of statements) {
        const d = parseToolCodeToDirective(st);
        if (d) directives.push(d);
      }
    }
  }

  const seen = new Set<string>();
  const uniq: ToolDirective[] = [];
  for (const d of directives) {
    const key = `${d.toolName}::${JSON.stringify(d.input)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(d);
  }

  return uniq;
}

async function runDirectiveTools(params: {
  agentId: string;
  directives: ToolDirective[];
  whitelist: string[];
  registry: Record<string, any>;
  context: Record<string, any>;
  globalApiKey?: string;
}): Promise<{ toolResults: Record<string, any>; updatedContext: Record<string, any> }> {
  const { agentId, directives, whitelist, registry, context, globalApiKey } = params;

  const toolResults: Record<string, any> = {};
  let updatedContext = { ...context };

  const allowedDirectives = directives.filter((d) => whitelist.includes(d.toolName));
  if (allowedDirectives.length === 0) return { toolResults, updatedContext };

  for (const d of allowedDirectives) {
    try {
      const exec = await runToolsForAgent({
        agentId,
        agentTools: [d.toolName],
        registry,
        context: { ...updatedContext },
        parsedOutput: d.input,
        globalApiKey,
      });

      Object.assign(updatedContext, exec.updatedContext);
      const maybe = exec.toolResults?.[d.toolName];
      toolResults[d.toolName] = maybe ?? exec.toolResults ?? { ok: true };
    } catch (err) {
      toolResults[d.toolName] = {
        ok: false,
        status: null,
        error: String((err as any)?.message ?? err ?? "Tool execution failed"),
      };
    }
  }

  return { toolResults, updatedContext };
}

// API key
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY && !MOCK_LLM) {
  console.error(
    "❌ No API key set. Please set API_KEY or GEMINI_API_KEY in your environment, or use AIFLOW_MODE=sim (or AIFLOW_MOCK_LLM=1)."
  );
  process.exit(1);
}

async function run() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: node runtime/cli/runAiflow.mts <path-to-file.aiflow>");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  const raw = readFileSync(filePath, "utf-8");
  const project: any = JSON.parse(raw);

  const issues = validateProject(project);
  if (hasValidationErrors(issues)) {
    console.error("Invalid AIFLOW file:");
    for (const issue of issues) {
      if (issue.level === "error") {
        const location = issue.path ? ` (${issue.path})` : "";
        console.error(` › [${issue.code}] ${issue.message}${location}`);
      }
    }
    process.exit(1);
  }

  console.log(`▶ Running AIFLOW project: ${project.metadata?.name} v${project.metadata?.version}`);

  const ai = !MOCK_LLM ? new GoogleGenAI({ apiKey: API_KEY! }) : null;

  const context: Record<string, any> = { ...(project.flow?.variables || {}) };
  const trace: any[] = [];

  let currentAgentId: string | null =
    (project.flow && project.flow.entry_agent) || (project.flow && project.flow.start) || null;

  const agentsArray: any[] = Array.isArray(project.agents) ? project.agents : [];
  const logicRules: any[] = Array.isArray(project.flow?.logic) ? project.flow.logic : [];
  const toolsRegistry: Record<string, any> = project.tools || {};

  let steps = 0;
  const MAX_STEPS = 10;

  while (currentAgentId && steps < MAX_STEPS) {
    const agent = agentsArray.find((a) => a && a.id === currentAgentId) ?? null;

    if (!agent) {
      console.error(`❌ Agent '${currentAgentId}' not found`);
      break;
    }

    console.log(`\n=== Agent: ${agent.name ?? currentAgentId} (${agent.role}) ===`);

    const inputContextSnapshot = cloneJsonSafe(context);

    // ✅ CHANGED: deterministic timestamps in sim mode
    const startedAt = nowMsDeterministic(MOCK_LLM);

    const prompts = project.prompts || {};
    const promptTemplate =
      prompts[agent.prompt] ||
      `You are an AI agent acting as ${agent.role}. Use the context to decide what to do.`;

    const filledPrompt = promptTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      context[key] !== undefined ? String(context[key]) : `{{${key}}}`
    );

    const ctxString = JSON.stringify(context, null, 2);

    const fullPrompt = `
${filledPrompt}

[Current Context]:
${ctxString}

Respond in ${agent.output_format || "text"}.
`.trim();

    let rawOutput: string;
    let parsed: any;

    const resolvedRetryPolicy = resolveRetryPolicy(agent);
    const maxAttempts = resolvedRetryPolicy.maxAttempts;
    const retryOn = resolvedRetryPolicy.retryOn;

    const attempts: Array<{
      attempt: number;
      status: "success" | "error";
      model?: string;
      rawOutput?: string;
      error?: { message: string; code?: string; status?: string };
      errorClass?: ErrorClass;
      errorCode?: ErrorCode;
      shouldRetry?: boolean;
      retryReason?: string;
      backoffAppliedMs?: number;
    }> = [];

    let status: "success" | "error" = "success";
    let lastErr: any = null;

    if (MOCK_LLM) {
      const seed = Number(process.env.AIFLOW_SEED ?? "0");

      const simulatedParsed = simulateParsedOutput({
        agentId: currentAgentId,
        agentName: agent.name ?? currentAgentId,
        role: agent.role,
        outputFormat: agent.output_format,
        contextSnapshot: inputContextSnapshot,
        seed,
      });

      rawOutput =
        typeof simulatedParsed === "string"
          ? simulatedParsed
          : "```json\n" + JSON.stringify(simulatedParsed, null, 2) + "\n```";

      parsed = typeof simulatedParsed === "string" ? simulatedParsed : tryParseJson(rawOutput);

      attempts.push({
        attempt: 1,
        status: "success",
        model: "sim",
        rawOutput,
        shouldRetry: false,
        retryReason: "success",
        backoffAppliedMs: 0,
      });

      console.log("\n[SIM MODE] Deterministic simulated output (no network).");
    } else {
      const modelName = "gemini-2.5-flash";

      rawOutput = "";
      parsed = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // test helper
          if (attempt === 1 && process.env.AIFLOW_FORCE_FIRST_ATTEMPT_FAIL === "1") {
            throw Object.assign(new Error("FORCED_RETRY_TEST: simulated transient error"), {
              status: 429,
            });
          }

          const response = await ai!.models.generateContent({
            model: modelName,
            contents: fullPrompt,
          });

          rawOutput = (response as any).text ?? "";
          parsed = tryParseJson(rawOutput);

          attempts.push({
            attempt,
            status: "success",
            model: modelName,
            rawOutput,
            shouldRetry: false,
            retryReason: "success",
            backoffAppliedMs: 0,
          });

          status = "success";
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          status = "error";

          const msg = String(err?.message ?? err ?? "Unknown error");
          const code = String(err?.code ?? "");
          const st = String(err?.status ?? err?.response?.status ?? "");

          const classified = classifyLLMErrorV2(err);
          const decision = shouldRetryFromPolicyV2({
            errorClass: classified.errorClass,
            errorCode: classified.errorCode,
            attempt,
            maxAttempts,
            retryOn,
          });

          const backoffAppliedMs = decision.shouldRetry
            ? computeBackoffMs({ attempt, errorCode: classified.errorCode, err })
            : 0;

          attempts.push({
            attempt,
            status: "error",
            model: modelName,
            error: { message: msg, code: code || undefined, status: st || undefined },
            errorClass: classified.errorClass,
            errorCode: classified.errorCode,
            shouldRetry: decision.shouldRetry,
            retryReason: decision.retryReason,
            backoffAppliedMs,
          });

          if (!decision.shouldRetry) {
            rawOutput = `{"__error":"LLM_CALL_FAILED","message":${JSON.stringify(
              msg
            )},"code":${JSON.stringify(code || null)},"status":${JSON.stringify(st || null)}}`;
            parsed = tryParseJson(rawOutput);
            break;
          }

          if (backoffAppliedMs > 0 && !DISABLE_SLEEP_BACKOFF) {
            await sleep(backoffAppliedMs);
          }
        }
      }
    }

    // ✅ CHANGED: deterministic timestamps in sim mode
    const finishedAt = nowMsDeterministic(MOCK_LLM);

    console.log("\nRaw Output:\n" + rawOutput);
    console.log("\nParsed Output:", parsed);

    context[`output_${currentAgentId}`] = parsed;

    // -----------------------------
    // Tools execution (STRICT + directives-aware)
    // -----------------------------
    const agentToolsWhitelist: string[] = Array.isArray(agent.tools) ? agent.tools : [];
    let toolResults: Record<string, any> = {};

    const directives = extractToolDirectives(parsed);

    if (directives.length > 0) {
      if (toolsRegistry && Object.keys(toolsRegistry).length > 0) {
        const exec = await runDirectiveTools({
          agentId: currentAgentId,
          directives,
          whitelist: agentToolsWhitelist,
          registry: toolsRegistry,
          context,
          globalApiKey: API_KEY,
        });
        toolResults = exec.toolResults;
        Object.assign(context, exec.updatedContext);
      } else {
        toolResults = {};
      }
    } else {
      toolResults = {};
    }

    // ✅ Routing (condition engine)
    const rulesForAgent = logicRules.filter((rule) => rule.from === currentAgentId);

    const ruleResults: {
      id: string | null;
      from: string | null;
      to: string | null;
      condition: string | null;
      result: boolean;
    }[] = [];

    let nextRule: any | null = null;

    const evalContext = {
      context,
      output: parsed,
      agentId: currentAgentId,
      user: (context as any).user,
    };

    for (const rule of rulesForAgent) {
      const conditionStr: string =
        typeof rule.condition === "string" && rule.condition.trim().length > 0
          ? rule.condition
          : "always";

      const result = evaluateExpression(conditionStr, evalContext);

      ruleResults.push({
        id: rule.id ?? null,
        from: rule.from ?? null,
        to: rule.to ?? null,
        condition: rule.condition ?? null,
        result,
      });

      if (!nextRule && result) nextRule = rule;
    }

    trace.push({
      step: steps,
      agentId: currentAgentId,
      agentName: agent.name ?? currentAgentId,
      role: agent.role,
      inputContext: inputContextSnapshot,
      startedAt,
      finishedAt,
      status,
      attemptCount: attempts.length,
      attempts,
      retryPolicy: resolvedRetryPolicy,
      error:
        status === "error"
          ? {
              message: String(lastErr?.message ?? lastErr ?? "Unknown error"),
              code: lastErr?.code ? String(lastErr.code) : undefined,
              status: lastErr?.status
                ? String(lastErr.status)
                : lastErr?.response?.status
                ? String(lastErr.response.status)
                : undefined,
            }
          : null,
      rawOutput,
      parsedOutput: parsed,
      toolDirectives: directives,
      tools: toolResults,
      rulesEvaluated: ruleResults,
      selectedRuleId: nextRule?.id ?? null,
      nextAgentId: nextRule?.to ?? null,
    });

    if (!nextRule) {
      console.log("\n✅ No further transitions, stopping.");
      currentAgentId = null;
      break;
    }

    console.log(
      `\n→ Transition: ${currentAgentId} -> ${nextRule.to} (rule: ${nextRule.id ?? "unnamed"})`
    );
    currentAgentId = nextRule.to;
    steps++;
  }

  context.__trace = trace;

  console.log("\n🏁 Flow finished. Final context:");
  console.log(JSON.stringify(context, null, 2));
}

if (!process.env.VITEST) {
  run().catch((err) => {
    console.error("Unexpected error while running flow:", err);
    process.exit(1);
  });
}
