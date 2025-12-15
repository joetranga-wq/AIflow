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

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/traceToAiflow.mts <run_output_file.txt|run.json> <out.aiflow>",
      "",
      "Examples:",
      "  node runtime/cli/traceToAiflow.mts /tmp/run.txt /tmp/generated.aiflow",
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
    } catch (e) {
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

/**
 * Build an "observed-only" AIFlow project from __trace.
 * - Agents: from trace step agentId/agentName/role, output_format inferred
 * - Logic edges: only selected transitions; condition taken from selected rule's condition
 */
function buildAiflowFromTrace(run: RunContext) {
  const trace = Array.isArray(run.__trace) ? run.__trace : [];
  if (trace.length === 0) {
    throw new Error("No __trace found in run context.");
  }

  // Entry agent = first step
  const entryAgent = trace[0].agentId;

  // Variables: use first inputContext snapshot if present, else include nothing
  const variables = (trace[0].inputContext && typeof trace[0].inputContext === "object")
    ? trace[0].inputContext
    : {};

  // Agents (unique by agentId)
  const agentsById = new Map<
    string,
    { id: string; name: string; role: string; prompt: string; output_format: "json" | "text"; tools: string[] }
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
      // If we already have it, keep existing; but if format was text and later became json, upgrade
      const cur = agentsById.get(id)!;
      if (cur.output_format === "text" && output_format === "json") {
        cur.output_format = "json";
      }
    }
  }

  // Prompts: placeholders (kept minimal; no scope creep)
  const prompts: Record<string, string> = {};
  for (const a of agentsById.values()) {
    prompts[a.prompt] =
      `You are ${a.name} acting as ${a.role}. Use the current context. Respond in ${a.output_format}.`;
  }

  // Logic: observed edges only
  const logic: Array<{ id: string; from: string; to: string; condition: string }> = [];
  const seenEdge = new Set<string>();

  for (const step of trace) {
    const from = step.agentId;
    const to = step.nextAgentId;
    if (!to) continue;

    // Condition: find selectedRuleId in rulesEvaluated, else fallback "always"
    let condition = "always";

    if (step.selectedRuleId && Array.isArray(step.rulesEvaluated)) {
      const selected = step.rulesEvaluated.find((r) => r.id === step.selectedRuleId);
      if (selected?.condition && String(selected.condition).trim().length > 0) {
        condition = String(selected.condition).trim();
      }
    } else if (Array.isArray(step.rulesEvaluated)) {
      // If there was exactly one true rule, reuse it
      const trues = step.rulesEvaluated.filter((r) => r.result === true);
      if (trues.length === 1 && trues[0].condition) condition = String(trues[0].condition).trim();
    }

    const edgeKey = `${from}::${to}::${condition}`;
    if (seenEdge.has(edgeKey)) continue;
    seenEdge.add(edgeKey);

    logic.push({
      id: `rule_${from}_to_${to}_${logic.length + 1}`,
      from,
      to,
      condition,
    });
  }

  // Basic metadata
  const generated = {
    metadata: {
      name: "GeneratedFromTrace",
      version: "0.1.0",
      description: "Observed-only workflow generated from __trace",
    },
    flow: {
      entry_agent: entryAgent,
      variables,
      logic,
    },
    agents: Array.from(agentsById.values()),
    prompts,
    tools: {},
  };

  return generated;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usageAndExit();

  const inputPath = resolve(process.cwd(), args[0]);
  const outPath = resolve(process.cwd(), args[1]);

  const raw = readFileSync(inputPath, "utf-8");
  const run = extractRunContextFromText(raw);

  const project = buildAiflowFromTrace(run);

  writeFileSync(outPath, JSON.stringify(project, null, 2), "utf-8");
  console.log(`✅ Wrote observed-only .aiflow to: ${outPath}`);
}

main();

