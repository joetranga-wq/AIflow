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
  rulesEvaluated?: TraceRuleEval[];
  selectedRuleId?: string | null;
  nextAgentId?: string | null;
};

type RunContext = {
  __trace?: TraceStep[];
  [k: string]: any;
};

type CoverageRow = {
  from: string;
  to: string;
  condition: string;
  ruleId: string | null;
  step: number;
  result: boolean;
  observed: boolean;
  selectedRuleId: string | null;
  nextAgentId: string | null;
};

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/traceCoverage.mts <run_output_file.txt|run.json> [--json out.json]",
      "",
      "Examples:",
      "  node runtime/cli/traceCoverage.mts /tmp/run.txt",
      "  node runtime/cli/traceCoverage.mts /tmp/run.txt --json /tmp/coverage.json",
    ].join("\n")
  );
  process.exit(1);
}

/**
 * Extract final JSON from a log file produced by runAiflow.mts.
 * It looks for the marker 'Final context:' and parses everything after it as JSON.
 * If marker not found, tries to parse the whole file as JSON.
 */
function extractRunContextFromText(text: string): RunContext {
  const marker = "Final context:";
  const idx = text.lastIndexOf(marker);

  if (idx >= 0) {
    const after = text.slice(idx + marker.length).trim();
    return JSON.parse(after);
  }

  return JSON.parse(text);
}

function nonEmpty(s: any, fallback: string): string {
  const v = String(s ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function parseJsonOut(argv: string[]): string | null {
  const idx = argv.findIndex((x) => x === "--json");
  if (idx === -1) return null;
  const p = argv[idx + 1];
  if (!p) throw new Error("Missing path after --json");
  return p;
}

function buildCoverageRows(trace: TraceStep[]): CoverageRow[] {
  const rows: CoverageRow[] = [];

  for (const step of trace) {
    const from = step.agentId;
    const selectedRuleId = step.selectedRuleId ?? null;
    const nextAgentId = step.nextAgentId ?? null;
    const rules = Array.isArray(step.rulesEvaluated) ? step.rulesEvaluated : [];

    for (const r of rules) {
      const to = nonEmpty(r.to, "");
      if (!to) continue;

      const condition = nonEmpty(r.condition, "always");
      const observed =
        selectedRuleId !== null &&
        r.id !== null &&
        r.id === selectedRuleId &&
        nextAgentId !== null &&
        to === nextAgentId;

      rows.push({
        from,
        to,
        condition,
        ruleId: r.id ?? null,
        step: step.step,
        result: Boolean(r.result),
        observed,
        selectedRuleId,
        nextAgentId,
      });
    }
  }

  return rows;
}

function summarize(rows: CoverageRow[]) {
  const total = rows.length;
  const observed = rows.filter((r) => r.observed).length;
  const trueCount = rows.filter((r) => r.result).length;
  const falseCount = rows.filter((r) => !r.result).length;

  // group by agent (from)
  const byFrom = new Map<string, CoverageRow[]>();
  for (const r of rows) {
    if (!byFrom.has(r.from)) byFrom.set(r.from, []);
    byFrom.get(r.from)!.push(r);
  }

  const perAgent = Array.from(byFrom.entries()).map(([from, rs]) => {
    const aTotal = rs.length;
    const aObs = rs.filter((x) => x.observed).length;
    const aTrue = rs.filter((x) => x.result).length;
    const aFalse = rs.filter((x) => !x.result).length;

    // unique edges (from,to,condition)
    const uniqEdges = new Set(rs.map((x) => `${x.from}::${x.to}::${x.condition}`)).size;

    return {
      from,
      total_rules_evaluated: aTotal,
      observed_rules: aObs,
      true_rules: aTrue,
      false_rules: aFalse,
      unique_edges: uniqEdges,
      coverage_pct: aTotal === 0 ? 0 : Math.round((aObs / aTotal) * 1000) / 10,
    };
  });

  // missed edges (rules that were evaluated but never observed)
  const missed = rows.filter((r) => !r.observed);
  const missedEdgesUniq = new Map<string, { from: string; to: string; condition: string; count: number }>();
  for (const m of missed) {
    const key = `${m.from}::${m.to}::${m.condition}`;
    const cur = missedEdgesUniq.get(key);
    if (cur) cur.count++;
    else missedEdgesUniq.set(key, { from: m.from, to: m.to, condition: m.condition, count: 1 });
  }

  const missedEdges = Array.from(missedEdgesUniq.values()).sort((a, b) => b.count - a.count);

  return {
    totals: {
      rules_evaluated: total,
      observed_rules: observed,
      true_rules: trueCount,
      false_rules: falseCount,
      coverage_pct: total === 0 ? 0 : Math.round((observed / total) * 1000) / 10,
    },
    per_agent: perAgent.sort((a, b) => a.from.localeCompare(b.from)),
    missed_edges: missedEdges,
  };
}

function printReport(summary: ReturnType<typeof summarize>) {
  console.log("\n=== TRACE COVERAGE REPORT ===");
  console.log(
    `Rules evaluated: ${summary.totals.rules_evaluated} | Observed: ${summary.totals.observed_rules} | Coverage: ${summary.totals.coverage_pct}%`
  );
  console.log(`True: ${summary.totals.true_rules} | False: ${summary.totals.false_rules}`);

  console.log("\nPer agent:");
  for (const a of summary.per_agent) {
    console.log(
      `- ${a.from}: evaluated=${a.total_rules_evaluated}, observed=${a.observed_rules}, coverage=${a.coverage_pct}%, unique_edges=${a.unique_edges}`
    );
  }

  if (summary.missed_edges.length > 0) {
    console.log("\nMissed edges (evaluated but not taken):");
    for (const e of summary.missed_edges.slice(0, 20)) {
      console.log(`- ${e.from} -> ${e.to} | ${e.condition} (count=${e.count})`);
    }
    if (summary.missed_edges.length > 20) {
      console.log(`... and ${summary.missed_edges.length - 20} more`);
    }
  } else {
    console.log("\nNo missed edges — all evaluated rules were observed (rare).");
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) usageAndExit();

  const inputPath = resolve(process.cwd(), argv[0]);
  const jsonOut = parseJsonOut(argv);

  const raw = readFileSync(inputPath, "utf-8");
  const run = extractRunContextFromText(raw);
  const trace = Array.isArray(run.__trace) ? run.__trace : [];
  if (trace.length === 0) throw new Error("No __trace found in run context.");

  const rows = buildCoverageRows(trace);
  const summary = summarize(rows);

  printReport(summary);

  if (jsonOut) {
    const outPath = resolve(process.cwd(), jsonOut);
    writeFileSync(
      outPath,
      JSON.stringify({ summary, rows }, null, 2),
      "utf-8"
    );
    console.log(`\n✅ Wrote JSON coverage to: ${outPath}`);
  }
}

main();
