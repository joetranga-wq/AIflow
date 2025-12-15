export type RunMode = "real" | "sim";

export interface RunConfig {
  mode: RunMode;
  seed?: number;
  source: "AIFLOW_MODE" | "MOCK_LLM" | "default";
}

/**
 * Priority:
 * 1) AIFLOW_MODE=sim|real
 * 2) AIFLOW_MOCK_LLM=1 or MOCK_LLM=1 -> sim
 * 3) default -> real
 *
 * Seed:
 * - AIFLOW_SEED=<number> (optional)
 */
export function resolveRunConfig(env: NodeJS.ProcessEnv = process.env): RunConfig {
  const modeRaw = String(env.AIFLOW_MODE ?? "").trim().toLowerCase();
  const mockRaw = String(env.AIFLOW_MOCK_LLM ?? env.MOCK_LLM ?? "").trim().toLowerCase();
  const seedRaw = String(env.AIFLOW_SEED ?? "").trim();

  const seed =
    seedRaw.length > 0 && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : undefined;

  if (modeRaw === "sim") return { mode: "sim", seed, source: "AIFLOW_MODE" };
  if (modeRaw === "real") return { mode: "real", seed, source: "AIFLOW_MODE" };

  if (mockRaw === "1" || mockRaw === "true") return { mode: "sim", seed, source: "MOCK_LLM" };

  return { mode: "real", seed, source: "default" };
}
