#!/usr/bin/env node
import { execFileSync } from "node:child_process";
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
};

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/coverageSweep.mts <path-to-flow.aiflow> [--seed N] [--json out.json]",
      "",
      "Examples:",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --json /tmp/unionCoverage.json",
    ].join("\n")
  );
  process.exit(1);
}

function parseArg(argv: string[], key: string): string | null {
  const idx = argv.findIndex((x) => x === key);
  if (idx === -1) return null;
  const v = argv[idx + 1];
  if (!v) throw new Error(`Missing value after ${key}`);
  return v;
}

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

function buildRowsFromTrace(trace: TraceStep[]): CoverageRow[] {
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
      });
    }
  }

  return rows;
}

function execRunToFile(params: {
  flowPath: string;
  outTxt: string;
  env: Record<string, string>;
}) {
  const nodeBin = process.execPath; // current node
  const script = resolve(process.cwd(), "runtime/cli/runAiflow.mts");

  const baseEnv: Record<string, string> = {
    ...process.env,
    // ensure “real mode without key” doesn’t block (we are forcing sim)
    API_KEY: "",
    GEMINI_API_KEY: "",
    ...params.env,
  };

  const output = execFileSync(nodeBin, [script, params.flowPath], {
    env: baseEnv,
    encoding: "utf-8",
  });

  writeFileSync(params.outTxt, output, "utf-8");
}

function keyEdge(r: CoverageRow): string {
  // edge identity (ignore step)
  return `${r.from}::${r.to}::${r.condition}`;
}

function unionCoverage(allRuns: Array<{ name: string; rows: CoverageRow[] }>) {
  // All evaluated edges across all runs
  const evaluatedEdges = new Map<string, { from: string; to: string; condition: string; count: number }>();
  // Observed edges across any run
  const observedEdges = new Map<string, { from: string; to: string; condition: string; count: number }>();

  for (const run of allRuns) {
    for (const row of run.rows) {
      const k = keyEdge(row);
      const cur = evaluatedEdges.get(k);
      if (cur) cur.count++;
      else evaluatedEdges.set(k, { from: row.from, to: row.to, condition: row.condition, count: 1 });

      if (row.observed) {
        const curO = observedEdges.get(k);
        if (curO) curO.count++;
        else observedEdges.set(k, { from: row.from, to: row.to, condition: row.condition, count: 1 });
      }
    }
  }

  const total = evaluatedEdges.size;
  const observed = observedEdges.size;
  const coveragePct = total === 0 ? 0 : Math.round((observed / total) * 1000) / 10;

  const missed = Array.from(evaluatedEdges.entries())
    .filter(([k]) => !observedEdges.has(k))
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count);

  return {
    totals: { unique_edges_evaluated: total, unique_edges_observed: observed, union_coverage_pct: coveragePct },
    missed_edges: missed,
  };
}

function printUnionReport(union: ReturnType<typeof unionCoverage>, runs: Array<{ name: string; outTxt: string }>) {
  console.log("\n=== COVERAGE SWEEP (UNION) ===");
  console.log(
    `Unique edges evaluated: ${union.totals.unique_edges_evaluated} | Observed: ${union.totals.unique_edges_observed} | Union coverage: ${union.totals.union_coverage_pct}%`
  );

  console.log("\nRuns:");
  for (const r of runs) {
    console.log(`- ${r.name}: ${r.outTxt}`);
  }

  if (union.missed_edges.length > 0) {
    console.log("\nStill missed edges (never observed in any run):");
    for (const e of union.missed_edges) {
      console.log(`- ${e.from} -> ${e.to} | ${e.condition} (seen=${e.count})`);
    }
  } else {
    console.log("\n✅ All evaluated edges were observed across the sweep.");
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) usageAndExit();

  const flowPath = resolve(process.cwd(), argv[0]);
  const seed = parseArg(argv, "--seed") ?? "42";
  const jsonOut = parseArg(argv, "--json");

  const runs = [
    {
      name: "baseline",
      env: { AIFLOW_MODE: "sim", AIFLOW_SEED: seed },
      outTxt: "/tmp/run_baseline.txt",
    },
    {
      name: "billing",
      env: { AIFLOW_MODE: "sim", AIFLOW_SEED: seed, AIFLOW_SIM_TICKET_TYPE: "billing" },
      outTxt: "/tmp/run_billing.txt",
    },
    {
      name: "solution_found_true",
      env: { AIFLOW_MODE: "sim", AIFLOW_SEED: seed, AIFLOW_SIM_SOLUTION_FOUND: "true" },
      outTxt: "/tmp/run_solution_true.txt",
    },
  ];

  // Execute runs
  for (const r of runs) {
    execRunToFile({ flowPath, outTxt: r.outTxt, env: r.env });
  }

  // Parse traces -> rows
  const parsedRuns: Array<{ name: string; rows: CoverageRow[] }> = [];

  for (const r of runs) {
    const raw = readFileSync(r.outTxt, "utf-8");
    const run = extractRunContextFromText(raw);
    const trace = Array.isArray(run.__trace) ? run.__trace : [];
    const rows = buildRowsFromTrace(trace);
    parsedRuns.push({ name: r.name, rows });
  }

  const union = unionCoverage(parsedRuns);
  printUnionReport(union, runs.map((r) => ({ name: r.name, outTxt: r.outTxt })));

  if (jsonOut) {
    const outPath = resolve(process.cwd(), jsonOut);
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          runs: runs.map((r) => ({ name: r.name, outTxt: r.outTxt, env: r.env })),
          union,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`\n✅ Wrote union coverage JSON to: ${outPath}`);
  }
}

main();
