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

type Scenario = {
  name: string;
  env: Record<string, string>;
  outTxt: string;
};

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/coverageSweep.mts <path-to-flow.aiflow> [--seed N] [--json out.json] [--auto] [--max-iter N]",
      "",
      "Examples:",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --json /tmp/unionCoverage.json",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --auto",
      "  node runtime/cli/coverageSweep.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --auto --max-iter 10",
      "",
      "Notes:",
      "  - Auto mode only uses these SIM overrides:",
      "      * AIFLOW_SIM_TICKET_TYPE=technical|billing|general",
      "      * AIFLOW_SIM_SOLUTION_FOUND=true|false",
      "  - Union coverage is computed on UNIQUE EDGES: from::to::condition",
    ].join("\n")
  );
  process.exit(1);
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(key);
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

function execRunToFile(params: { flowPath: string; outTxt: string; env: Record<string, string> }) {
  const nodeBin = process.execPath;
  const script = resolve(process.cwd(), "runtime/cli/runAiflow.mts");

  const baseEnv: Record<string, string> = {
    ...process.env,
    // ensure real mode doesn't block (we force sim)
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

function keyEdge(from: string, to: string, condition: string): string {
  return `${from}::${to}::${condition}`;
}

function unionCoverage(allRuns: Array<{ name: string; rows: CoverageRow[] }>) {
  const evaluatedEdges = new Map<
    string,
    { from: string; to: string; condition: string; count: number }
  >();
  const observedEdges = new Map<string, { from: string; to: string; condition: string; count: number }>();

  for (const run of allRuns) {
    for (const row of run.rows) {
      const k = keyEdge(row.from, row.to, row.condition);

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
    totals: {
      unique_edges_evaluated: total,
      unique_edges_observed: observed,
      union_coverage_pct: coveragePct,
    },
    missed_edges: missed,
    evaluated_edges: Array.from(evaluatedEdges.values()),
    observed_edges: Array.from(observedEdges.values()),
  };
}

function printUnionReport(union: ReturnType<typeof unionCoverage>, scenarios: Scenario[]) {
  console.log("\n=== COVERAGE SWEEP (UNION) ===");
  console.log(
    `Unique edges evaluated: ${union.totals.unique_edges_evaluated} | Observed: ${union.totals.unique_edges_observed} | Union coverage: ${union.totals.union_coverage_pct}%`
  );

  console.log("\nRuns:");
  for (const s of scenarios) {
    console.log(`- ${s.name}: ${s.outTxt}`);
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

// -----------------------------
// AUTO scenario synthesis (NO scope creep)
// -----------------------------
function extractTicketTypeFromCondition(cond: string): "technical" | "billing" | "general" | null {
  const c = cond.trim();

  // handle: output.ticket_type == 'billing' / "billing"
  const m =
    c.match(/output\.ticket_type\s*==\s*'([^']+)'/) ||
    c.match(/output\.ticket_type\s*==\s*"([^"]+)"/);

  if (!m) return null;

  const v = String(m[1]).trim().toLowerCase();
  if (v === "technical" || v === "billing" || v === "general") return v;
  return null;
}

function extractSolutionFoundFromCondition(cond: string): "true" | "false" | null {
  const c = cond.trim();

  // handle: output.solution_found == true/false
  const m = c.match(/output\.solution_found\s*==\s*(true|false)/i);
  if (!m) return null;

  const v = String(m[1]).trim().toLowerCase();
  return v === "true" ? "true" : "false";
}

function scenarioKey(env: Record<string, string>): string {
  const keys = Object.keys(env).sort();
  return keys.map((k) => `${k}=${env[k]}`).join("&");
}

function proposeScenarioFromMissedEdge(
  missed: { from: string; to: string; condition: string },
  seed: string
): { name: string; env: Record<string, string> } | null {
  // Always sim
  const baseEnv: Record<string, string> = { AIFLOW_MODE: "sim", AIFLOW_SEED: seed };

  // Ticket type override
  const tt = extractTicketTypeFromCondition(missed.condition);
  if (tt) {
    return {
      name: `auto_ticket_type_${tt}`,
      env: { ...baseEnv, AIFLOW_SIM_TICKET_TYPE: tt },
    };
  }

  // solution_found override
  const sf = extractSolutionFoundFromCondition(missed.condition);
  if (sf) {
    return {
      name: `auto_solution_found_${sf}`,
      env: { ...baseEnv, AIFLOW_SIM_SOLUTION_FOUND: sf },
    };
  }

  // Unknown condition pattern => can't auto-satisfy without new overrides (scope creep)
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) usageAndExit();

  const flowPath = resolve(process.cwd(), argv[0]);
  const seed = parseArg(argv, "--seed") ?? "42";
  const jsonOut = parseArg(argv, "--json");
  const auto = hasFlag(argv, "--auto");
  const maxIter = Number(parseArg(argv, "--max-iter") ?? "8");

  if (!Number.isFinite(maxIter) || maxIter < 1) {
    throw new Error("--max-iter must be a positive number");
  }

  // Default (non-auto) scenarios: baseline + two known overrides
  let scenarios: Scenario[] = [
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

  if (auto) {
    // Start with baseline only; we'll add scenarios as needed
    scenarios = [
      {
        name: "baseline",
        env: { AIFLOW_MODE: "sim", AIFLOW_SEED: seed },
        outTxt: "/tmp/run_baseline.txt",
      },
    ];
  }

  const seenScenarioKeys = new Set<string>(scenarios.map((s) => scenarioKey(s.env)));

  // Run loop
  const parsedRuns: Array<{ name: string; rows: CoverageRow[] }> = [];
  let union = unionCoverage(parsedRuns);

  for (let iter = 0; iter < maxIter; iter++) {
    // Execute any scenarios not yet executed in parsedRuns
    const doneNames = new Set(parsedRuns.map((r) => r.name));
    const toRun = scenarios.filter((s) => !doneNames.has(s.name));

    for (const s of toRun) {
      execRunToFile({ flowPath, outTxt: s.outTxt, env: s.env });

      const raw = readFileSync(s.outTxt, "utf-8");
      const run = extractRunContextFromText(raw);
      const trace = Array.isArray(run.__trace) ? run.__trace : [];
      const rows = buildRowsFromTrace(trace);

      parsedRuns.push({ name: s.name, rows });
    }

    union = unionCoverage(parsedRuns);

    // If not auto, we do only one pass (we already ran baseline/billing/solution)
    if (!auto) break;

    // If covered, stop
    if (union.missed_edges.length === 0) break;

    // Propose new scenarios from missed edges
    let added = 0;

    for (const m of union.missed_edges) {
      const proposal = proposeScenarioFromMissedEdge(m, seed);
      if (!proposal) continue;

      const key = scenarioKey(proposal.env);
      if (seenScenarioKeys.has(key)) continue;

      seenScenarioKeys.add(key);

      const outTxtSafe = `/tmp/run_${proposal.name}.txt`;
      scenarios.push({ name: proposal.name, env: proposal.env, outTxt: outTxtSafe });
      added++;
    }

    // If we couldn't add anything new, stop (avoid infinite loop)
    if (added === 0) break;
  }

  printUnionReport(union, scenarios);

  if (auto && union.missed_edges.length > 0) {
    console.log(
      "\n⚠️ Auto mode stopped with missed edges remaining.\n" +
        "This is expected if conditions require new override types.\n" +
        "We intentionally do NOT add new override families automatically (no scope creep)."
    );
  }

  if (jsonOut) {
    const outPath = resolve(process.cwd(), jsonOut);
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          mode: auto ? "auto" : "fixed",
          seed,
          maxIter,
          runs: scenarios.map((s) => ({ name: s.name, outTxt: s.outTxt, env: s.env })),
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

main().catch((err) => {
  console.error("❌ coverageSweep failed:", err);
  process.exit(1);
});
