# AIflow CLI – Design & Simulation Tooling

This directory contains CLI tools for **design-time workflows**:
- deterministic Simulation Mode (no API keys, no network)
- trace-driven workflow generation
- rule coverage analysis
- automated design artifact pipelines

These tools are intended for **workflow authors**, not runtime execution in production.

---

## Simulation Mode

Simulation Mode allows running any `.aiflow` **deterministically**, without API keys or network access.

```bash
unset API_KEY GEMINI_API_KEY
AIFLOW_MODE=sim AIFLOW_SEED=42 \
node runtime/cli/runAiflow.mts <path/to/flow.aiflow>
```

### Characteristics
- No external LLM calls
- Deterministic output via `AIFLOW_SEED`
- Deterministic trace timestamps (no wall-clock)
- Stable output for diffs, tests, and generation

### Legacy alias (still supported)
```bash
AIFLOW_MOCK_LLM=1 node runtime/cli/runAiflow.mts <path/to/flow.aiflow>
```

---

## SIM Scenario Overrides

To force specific branches during Simulation Mode:

```bash
# Force ticket classification branch
AIFLOW_MODE=sim AIFLOW_SEED=42 AIFLOW_SIM_TICKET_TYPE=billing \
node runtime/cli/runAiflow.mts <flow.aiflow>

# Force solution-found branch
AIFLOW_MODE=sim AIFLOW_SEED=42 AIFLOW_SIM_SOLUTION_FOUND=true \
node runtime/cli/runAiflow.mts <flow.aiflow>
```

Supported overrides:
- `AIFLOW_SIM_TICKET_TYPE=technical|billing|general`
- `AIFLOW_SIM_SOLUTION_FOUND=true|false`

Overrides are recorded in the trace under `__sim_override`.

---

## Trace Output

All CLI runs print a **final context** containing a structured `__trace` array.
This trace is the **source of truth** for generation and coverage.

---

## Trace → Workflow Generator

Generate `.aiflow` files from a trace (stdout captured to file).

### Observed-only mode (default)
Generates only transitions that were actually taken.
Safe to execute.

```bash
node runtime/cli/traceToAiflow.mts \
  /tmp/run_baseline.txt \
  /tmp/generated-observed.aiflow
```

### Full-graph mode
Keeps executable logic observed-only, but adds full rule evaluation
coverage metadata under `flow.__generator.rules`.

```bash
node runtime/cli/traceToAiflow.mts \
  /tmp/run_baseline.txt \
  /tmp/generated-full.aiflow \
  --mode full
```

---

## Coverage Tools

### Per-run coverage report

```bash
node runtime/cli/traceCoverage.mts /tmp/run_baseline.txt
```

Outputs:
- total rules evaluated
- observed vs missed edges
- per-agent coverage summary

---

### Coverage Sweep (Union)

Run multiple simulation scenarios and compute **union coverage**.

```bash
node runtime/cli/coverageSweep.mts <flow.aiflow> --seed 42
```

#### Auto mode
Automatically derives SIM scenarios from **missed edges**, using only
existing overrides (no scope creep).

```bash
node runtime/cli/coverageSweep.mts <flow.aiflow> --seed 42 --auto
```

Optionally write coverage JSON:
```bash
node runtime/cli/coverageSweep.mts <flow.aiflow> --seed 42 --auto --json /tmp/unionCoverage.json
```

---

## Design Toolchain (One Command)

Run the full design pipeline:
1. baseline simulation
2. observed + full `.aiflow` generation
3. auto coverage sweep
4. artifact collection

```bash
unset API_KEY GEMINI_API_KEY
node runtime/cli/designToolchain.mts \
  <flow.aiflow> \
  --seed 42 \
  --auto \
  --out-dir /tmp/aiflow-next-artifacts
```

Artifacts produced:
- `run_baseline.txt`
- `generated-observed.aiflow`
- `generated-full.aiflow`
- `unionCoverage.json`
- `coverageSweep.txt`
- individual sweep run files

---

## Design Principles

- **Trace-first**: traces are the authoritative execution record
- **Observed-only execution**: generated workflows are safe by default
- **Determinism**: same seed = same output
- **CLI-first**: editor and CI friendly
- **No runtime coupling**: tooling does not affect production execution

---

## Intended Use

- workflow authoring
- branch exploration
- coverage validation
- design-time CI checks
- Studio / UI integration (future)

Not intended for:
- production execution
- live inference
