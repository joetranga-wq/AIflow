#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { validateProject, hasValidationErrors } from "../core/validator.ts";
import { evaluateExpression } from "../core/conditionEngineV2.ts";
import { runToolsForAgent } from "../core/toolsRuntime.mts";

// 🧪 Mock-modus: als deze env var op "1" staat, slaan we echte LLM-calls over
const MOCK_LLM = process.env.AIFLOW_MOCK_LLM === "1";

// Kleine helper om ```json ... ``` naar echte JSON te parsen
export function tryParseJson(text: string): any {
  if (!text) return text;

  // Strip code fences ```json ... ```
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return text; // geen geldige JSON → gewoon de originele tekst bewaren
  }
}

// Haal API-key uit env (CLI-omgeving)
// In MOCK_LLM-mode gebruiken we geen echte calls, maar laten we de check staan
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY && !MOCK_LLM) {
  console.error(
    "❌ No API key set. Please set API_KEY or GEMINI_API_KEY in your environment, or use AIFLOW_MOCK_LLM=1."
  );
  process.exit(1);
}

// 🔁 Mock output generator op basis van agentId
function getMockOutput(agentId: string, context: Record<string, any>): any {
  switch (agentId) {
    // CustomerSupportFlow
    case "triage":
      return {
        needs_human: false,
        category: "mock_category"
      };
    case "automated_resolution":
      return {
        resolved: true,
        message: "Mock automated resolution successful."
      };

    // LeadQualificationFlow
    case "agent_qualifier":
      return {
        fit_score: 80,
        reason: "Mock: fits ICP."
      };

    // MarketingContentFlow
    case "agent_strategist":
      return {
        approved: true,
        strategy: "Mock strategy plan"
      };
    case "agent_social":
      return {
        posts: [
          { channel: "twitter", text: "Mock tweet 1" },
          { channel: "twitter", text: "Mock tweet 2" },
          { channel: "twitter", text: "Mock tweet 3" },
          { channel: "linkedin", text: "Mock LinkedIn post" }
        ]
      };

    // Default: géén volledige contextSnapshot meer → voorkomt circular refs
    default:
      return {
        mock: true,
        agentId,
        note: "Default mock output."
      };
  }
}

async function run() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage: node runtime/cli/runAiflow.mts <path-to-file.aiflow>"
    );
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  const raw = readFileSync(filePath, "utf-8");
  const project: any = JSON.parse(raw);

  // ✅ v0.2: Valideer het ingeladen .aiflow-project met de nieuwe validator
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

  console.log(
    `▶ Running AIFLOW project: ${project.metadata?.name} v${project.metadata?.version}`
  );

  const ai = !MOCK_LLM ? new GoogleGenAI({ apiKey: API_KEY! }) : null;

  // Globale context (flow.variables + latere outputs)
  const context: Record<string, any> = {
    ...(project.flow?.variables || {}),
  };

  // Trace-structuur om alle stappen vast te leggen
  const trace: any[] = [];

  // ✅ Bepaal start-agent: flow.entry_agent is de bron (fallback naar flow.start)
  let currentAgentId: string | null =
    (project.flow && project.flow.entry_agent) ||
    (project.flow && project.flow.start) ||
    null;

  // In de huidige spec is agents een ARRAY
  const agentsArray: any[] = Array.isArray(project.agents)
    ? project.agents
    : [];

  const logicRules: any[] = Array.isArray(project.flow?.logic)
    ? project.flow.logic
    : [];
  const toolsRegistry: Record<string, any> = project.tools || {};

  let steps = 0;
  const MAX_STEPS = 10;

  while (currentAgentId && steps < MAX_STEPS) {
    const agent =
      agentsArray.find((a) => a && a.id === currentAgentId) ??
      null;

    if (!agent) {
      console.error(`❌ Agent '${currentAgentId}' not found`);
      break;
    }

    console.log(
      `\n=== Agent: ${agent.name ?? currentAgentId} (${agent.role}) ===`
    );

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

    if (MOCK_LLM) {
      // 🧪 Geen echte call: gebruik mock output
      const mock = getMockOutput(currentAgentId, context);
      rawOutput = "```json\n" + JSON.stringify(mock, null, 2) + "\n```";
      parsed = mock;
      console.log("\n[MOCK MODE] Skipping real LLM call.");
    } else {
      // 🌐 Echte Gemini-call
      const modelName = "gemini-2.5-flash";

      const response = await ai!.models.generateContent({
        model: modelName,
        contents: fullPrompt,
      });

      rawOutput = (response as any).text ?? "";
      parsed = tryParseJson(rawOutput);
    }

    console.log("\nRaw Output:\n" + rawOutput);
    console.log("\nParsed Output:", parsed);

    // Sla output op in de context onder deze agent-id
    context[`output_${currentAgentId}`] = parsed;

    // 🧩 Tools Runtime integratie (optioneel per agent)
    const agentTools: string[] = Array.isArray(agent.tools) ? agent.tools : [];
    let toolResults: Record<string, any> = {};

    if (
      agentTools.length > 0 &&
      toolsRegistry &&
      Object.keys(toolsRegistry).length > 0
    ) {
      try {
        const toolExec = await runToolsForAgent({
          agentId: currentAgentId,
          agentTools,
          registry: toolsRegistry,
          context: { ...context },
          parsedOutput: parsed,
          globalApiKey: API_KEY,
        });

        // Context updaten met toolresultaten
        Object.assign(context, toolExec.updatedContext);
        toolResults = toolExec.toolResults;
      } catch (err) {
        console.warn(
          `⚠️ Tool execution failed for agent '${currentAgentId}':`,
          err
        );
      }
    }

    // ✅ v0.2 Expression-based routing met nieuwe condition engine
    const rulesForAgent = logicRules.filter(
      (rule) => rule.from === currentAgentId
    );

    const ruleResults: {
      id: string | null;
      from: string | null;
      to: string | null;
      condition: string | null;
      result: boolean;
    }[] = [];

    let nextRule: any | null = null;

    // Zelfde eval-context als in runFlow v0.2
    const evalContext = {
      context,
      output: parsed,
      agentId: currentAgentId,
      user: context.user,
    };

    for (const rule of rulesForAgent) {
      const conditionStr: string =
        typeof rule.condition === "string" &&
        rule.condition.trim().length > 0
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

      if (!nextRule && result) {
        nextRule = rule;
      }
    }

    // ✅ Trace entry maken voor deze stap (incl. tools)
    trace.push({
      step: steps,
      agentId: currentAgentId,
      agentName: agent.name ?? currentAgentId,
      role: agent.role,
      inputContext: { ...context },
      rawOutput,
      parsedOutput: parsed,
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
      `\n→ Transition: ${currentAgentId} -> ${nextRule.to} (rule: ${
        nextRule.id ?? "unnamed"
      })`
    );
    currentAgentId = nextRule.to;
    steps++;
  }

  // ✅ Trace aan de context toevoegen voor debugging / Studio
  context.__trace = trace;

  console.log("\n🏁 Flow finished. Final context:");
  console.log(JSON.stringify(context, null, 2));
}

// Alleen de CLI daadwerkelijk starten als we NIET onder Vitest draaien
if (!process.env.VITEST) {
  run().catch((err) => {
    console.error("Unexpected error while running flow:", err);
    process.exit(1);
  });
}
