#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, basename } from "node:path";

function usageAndExit() {
  console.error(
    [
      "Usage:",
      "  node runtime/cli/designToolchain.mts <flow.aiflow> [--seed N] [--out-dir DIR] [--auto] [--max-iter N]",
      "",
      "What it produces (in out-dir):",
      "  - run_baseline.txt",
      "  - generated-observed.aiflow",
      "  - generated-full.aiflow",
      "  - unionCoverage.json",
      "  - (optional) copied sweep run files if found",
      "",
      "Examples:",
      "  node runtime/cli/designToolchain.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow",
      "  node runtime/cli/designToolchain.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --auto",
      "  node runtime/cli/designToolchain.mts examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow --seed 42 --auto --out-dir /tmp/aiflow-next-artifacts",
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

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(key);
}

function safeMkdir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function runNodeScript(scriptRel: string, args: string[], env: Record<string, string>) {
  const nodeBin = process.execPath;
  const script = resolve(process.cwd(), scriptRel);

  const mergedEnv: Record<string, string> = {
    ...process.env,
    // keep us strictly in SIM mode / no keys
    API_KEY: "",
    GEMINI_API_KEY: "",
    ...env,
  };

  return execFileSync(nodeBin, [script, ...args], {
    env: mergedEnv,
    encoding: "utf-8",
  });
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) usageAndExit();

  const flowPath = resolve(process.cwd(), argv[0]);
  const seed = parseArg(argv, "--seed") ?? "42";
  const outDir = resolve(process.cwd(), parseArg(argv, "--out-dir") ?? "/tmp/aiflow-next-artifacts");
  const auto = hasFlag(argv, "--auto");
  const maxIter = parseArg(argv, "--max-iter");

  safeMkdir(outDir);

  const flowName = basename(flowPath);
  console.log(`▶ Design toolchain for: ${flowName}`);
  console.log(`  seed=${seed} auto=${auto ? "true" : "false"} outDir=${outDir}`);

  // 1) Baseline run -> capture stdout
  console.log("\n[1/4] Running baseline sim…");
  const baselineTxt = runNodeScript(
    "runtime/cli/runAiflow.mts",
    [flowPath],
    {
      AIFLOW_MODE: "sim",
      AIFLOW_SEED: seed,
    }
  );
  const baselineOutPath = resolve(outDir, "run_baseline.txt");
  writeFileSync(baselineOutPath, baselineTxt, "utf-8");
  console.log(`✅ wrote ${baselineOutPath}`);

  // 2) Generate observed-only + full .aiflow from baseline trace
  console.log("\n[2/4] Generating .aiflow from baseline trace…");

  const observedAiflowPath = resolve(outDir, "generated-observed.aiflow");
  runNodeScript(
    "runtime/cli/traceToAiflow.mts",
    [baselineOutPath, observedAiflowPath],
    {}
  );
  console.log(`✅ wrote ${observedAiflowPath}`);

  const fullAiflowPath = resolve(outDir, "generated-full.aiflow");
  runNodeScript(
    "runtime/cli/traceToAiflow.mts",
    [baselineOutPath, fullAiflowPath, "--mode", "full"],
    {}
  );
  console.log(`✅ wrote ${fullAiflowPath}`);

  // 3) Coverage sweep (fixed or auto) -> unionCoverage.json
  console.log("\n[3/4] Running coverage sweep…");

  const unionCoveragePath = resolve(outDir, "unionCoverage.json");

  const sweepArgs = [
    flowPath,
    "--seed",
    seed,
    "--json",
    unionCoveragePath,
  ];

  if (auto) sweepArgs.push("--auto");
  if (maxIter) sweepArgs.push("--max-iter", maxIter);

  const sweepTxt = runNodeScript("runtime/cli/coverageSweep.mts", sweepArgs, {});
  const sweepLogPath = resolve(outDir, "coverageSweep.txt");
  writeFileSync(sweepLogPath, sweepTxt, "utf-8");
  console.log(`✅ wrote ${unionCoveragePath}`);
  console.log(`✅ wrote ${sweepLogPath}`);

  // 4) Copy sweep run files from /tmp into outDir (best-effort)
  console.log("\n[4/4] Copying sweep run files (best-effort)…");

  // These are the known outputs from coverageSweep.mts. If your sweep later changes filenames,
  // it still won’t break the pipeline; we just copy what exists.
  const candidates = [
    "/tmp/run_baseline.txt",
    "/tmp/run_billing.txt",
    "/tmp/run_solution_true.txt",
    "/tmp/run_auto_ticket_type_billing.txt",
    "/tmp/run_auto_solution_found_true.txt",
  ];

  let copied = 0;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const dst = resolve(outDir, basename(p));
    try {
      copyFileSync(p, dst);
      copied++;
    } catch {
      // ignore
    }
  }

  // Also copy the unionCoverage-auto.json if user ran it separately
  const maybeUnionAuto = "/tmp/unionCoverage-auto.json";
  if (existsSync(maybeUnionAuto)) {
    const dst = resolve(outDir, basename(maybeUnionAuto));
    try {
      copyFileSync(maybeUnionAuto, dst);
      copied++;
    } catch {
      // ignore
    }
  }

  console.log(`✅ copied ${copied} file(s) into outDir`);

  // Quick summary
  console.log("\n🏁 Done. Artifacts:");
  console.log(`- ${baselineOutPath}`);
  console.log(`- ${observedAiflowPath}`);
  console.log(`- ${fullAiflowPath}`);
  console.log(`- ${unionCoveragePath}`);
  console.log(`- ${sweepLogPath}`);

  // Optional: print final union coverage pct from JSON
  try {
    const json = JSON.parse(readFileSync(unionCoveragePath, "utf-8"));
    const pct = json?.union?.totals?.union_coverage_pct;
    if (typeof pct === "number") {
      console.log(`\n📈 Union coverage: ${pct}%`);
    }
  } catch {
    // ignore
  }
}

main();
