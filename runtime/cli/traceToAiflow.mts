#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type TraceRuleEval = {
  id: string | null;
  from: string | null;
  to: string | null;
  condition: string | null;
  result: boolean;
};

type TraceStep = {
  step: number;
  agentId: string;
  agentName?: string;
  role?: string;
  inputContext?: Record<string, any>;
  parsedOutput?: any;
  rulesEvaluated?: TraceRuleEval[];
  selectedRuleId?: string | null;
  nextAgentId?: string | null;
};

type RunContext = {
  __trace?: TraceStep[];
  [k: string]: any;
};

type Mode = "observed" | "full";

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/traceToAiflow.mts <run_output_file.txt|run.json> <out.aiflow> [--mode observed|full]",
      "",
      "Examples:",
      "  node runtime/cli/traceToAiflow.mts /tmp/run.txt /tmp/generated.aiflow",
      "  node runtime/cli/traceToAiflow.mts /tmp/run.txt /tmp/generated-full.aiflow --mode full",
      "",
      "Notes:",
      "  - observed: flow.logic contains only observed transitions (runnable)",
      "  - full:     flow.logic stays observed-only, but flow.__generator includes all evaluated rules (coverage graph)",
    ].join("\n")
  );
  process.exit(1);
}

/**
 * Extract final JSON from a log file produced by runAiflow.mts.
 * It looks for the marker "Final context:" and parses everything after it as JSON.
 * If marker not found, tries to parse the whole file as JSON.
 */
function extractRunContextFromText(text: string): RunContext {
  const marker = "Final context:";
  const idx = text.lastIndexOf(marker);

  if (idx >= 0) {
    const after = text.slice(idx + marker.length).trim();
    try {
      return JSON.parse(after);
    } catch {
      throw new Error(
        "Found 'Final context:' marker but failed to parse JSON after it. " +
          "Make sure the file contains the final pretty-printed JSON."
      );
    }
  }

  // Fallback: whole file is JSON
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Could not parse input as JSON, and did not find 'Final context:' marker. " +
        "Provide a /tmp/run.txt created by redirecting runAiflow output, or a pure JSON file."
    );
  }
}

function inferOutputFormatFromParsedOutput(parsed: any): "json" | "text" {
  if (parsed && typeof parsed === "object") return "json";
  return "text";
}

function parseMode(argv: string[]): Mode {
  const idx = argv.findIndex((x) => x === "--mode");
  if (idx === -1) return "observed";
  const val = argv[idx + 1];
  if (val === "observed" || val === "full") return val;
  throw new Error(`Invalid --mode value: '${val}'. Use 'observed' or 'full'.`);
}

type GeneratorRule = {
  id: string | null;
  from: string;
  to: string;
  condition: string;
  result: boolean;
  observed: boolean;
  selectedRuleId: string | null;
  nextAgentId: string | null;
  step: number;
};

function normalizeNonEmpty(s: any, fallback: string): string {
  const v = String(s ?? "").trim();
  return v.length > 0 ? v : fallback;
}

/**
 * Build an AIFlow project from __trace.
 *
 * observed mode:
 * - flow.logic: only the observed transitions (selected nextAgentId)
 *
 * full mode:
 * - flow.logic: STILL observed-only (so it remains runnable, no behavior change)
 * - flow.__generator.rules: includes all evaluated rules (hit/miss coverage graph)
 */
function buildAiflowFromTrace(run: RunContext, mode: Mode) {
  const trace = Array.isArray(run.__trace) ? run.__trace : [];
  if (trace.length === 0) throw new Error("No __trace found in run context.");

  const entryAgent = trace[0].agentId;

  const variables =
    trace[0].inputContext && typeof trace[0].inputContext === "object" ? trace[0].inputContext : {};

  // Agents (unique by agentId)
  const agentsById = new Map<
    string,
    {
      id: string;
      name: string;
      role: string;
      prompt: string;
      output_format: "json" | "text";
      tools: string[];
    }
  >();

  for (const step of trace) {
    const id = step.agentId;
    const name = step.agentName ?? id;
    const role = step.role ?? "Agent";
    const output_format = inferOutputFormatFromParsedOutput(step.parsedOutput);

    if (!agentsById.has(id)) {
      agentsById.set(id, {
        id,
        name,
        role,
        prompt: `prompt_${id}`,
        output_format,
        tools: [],
      });
    } else {
      const cur = agentsById.get(id)!;
      if (cur.output_format === "text" && output_format === "json") cur.output_format = "json";
    }
  }

  // Prompts: minimal placeholders (no scope creep)
  const prompts: Record<string, string> = {};
  for (const a of agentsById.values()) {
    prompts[a.prompt] =
      `You are ${a.name} acting as ${a.role}. Use the current context. Respond in ${a.output_format}.`;
  }

  // Observed logic edges only (keeps runnable behavior identical)
  const logic: Array<{ id: string; from: string; to: string; condition: string }> = [];
  const seenObservedEdge = new Set<string>();

  // Full graph coverage info
  const allRules: GeneratorRule[] = [];
  const seenRule = new Set<string>();

  for (const step of trace) {
    const from = step.agentId;
    const next = step.nextAgentId ?? null;
    const selectedRuleId = step.selectedRuleId ?? null;
    const rules = Array.isArray(step.rulesEvaluated) ? step.rulesEvaluated : [];

    // --- collect full rule coverage (if mode=full) ---
    if (mode === "full") {
      for (const r of rules) {
        const to = normalizeNonEmpty(r.to, "");
        if (!to) continue;

        const condition = normalizeNonEmpty(r.condition, "always");
        const observed =
          selectedRuleId !== null &&
          r.id !== null &&
          r.id === selectedRuleId &&
          next !== null &&
          to === next;

        const key = `${step.step}::${r.id ?? "null"}::${from}::${to}::${condition}::${r.result}::${observed}`;
        if (seenRule.has(key)) continue;
        seenRule.add(key);

        allRules.push({
          id: r.id ?? null,
          from,
          to,
          condition,
          result: Boolean(r.result),
          observed,
          selectedRuleId,
          nextAgentId: next,
          step: step.step,
        });
      }
    }

    // --- observed transition -> flow.logic ---
    if (!next) continue;

    // Condition: take the selected rule's condition, else fallback "always"
    let condition = "always";

    if (selectedRuleId && rules.length > 0) {
      const selected = rules.find((r) => r.id === selectedRuleId);
      if (selected?.condition && String(selected.condition).trim().length > 0) {
        condition = String(selected.condition).trim();
      }
    } else if (rules.length > 0) {
      const trues = rules.filter((r) => r.result === true);
      if (trues.length === 1 && trues[0].condition) condition = String(trues[0].condition).trim();
    }

    const edgeKey = `${from}::${next}::${condition}`;
    if (seenObservedEdge.has(edgeKey)) continue;
    seenObservedEdge.add(edgeKey);

    logic.push({
      id: `rule_${from}_to_${next}_${logic.length + 1}`,
      from,
      to: next,
      condition,
    });
  }

  const flow: any = {
    entry_agent: entryAgent,
    variables,
    logic,
  };

  if (mode === "full") {
    flow.__generator = {
      mode: "full-graph",
      note:
        "flow.logic is observed-only for safe execution; full evaluated rules coverage is listed in __generator.rules",
      rules: allRules,
    };
  } else {
    flow.__generator = {
      mode: "observed-only",
      note: "flow.logic contains only observed transitions from the trace",
    };
  }

  const generated = {
    metadata: {
      name: mode === "full" ? "GeneratedFromTraceFull" : "GeneratedFromTrace",
      version: "0.1.0",
      description:
        mode === "full"
          ? "Workflow generated from __trace (observed logic + full coverage graph metadata)"
          : "Observed-only workflow generated from __trace",
    },
    flow,
    agents: Array.from(agentsById.values()),
    prompts,
    tools: {},
  };

  return generated;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) usageAndExit();

  const mode = parseMode(argv);

  const inputPath = resolve(process.cwd(), argv[0]);
  const outPath = resolve(process.cwd(), argv[1]);

  const raw = readFileSync(inputPath, "utf-8");
  const run = extractRunContextFromText(raw);

  const project = buildAiflowFromTrace(run, mode);

  writeFileSync(outPath, JSON.stringify(project, null, 2), "utf-8");
  console.log(`✅ Wrote ${mode} .aiflow to: ${outPath}`);
}

main();
