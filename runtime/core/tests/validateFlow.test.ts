import { describe, it, expect } from "vitest";
import { validateFlow } from "../validateFlow.mts";

describe("validateFlow", () => {
  it("returns ok=true for a minimal valid project", () => {
    const project = {
      flow: {
        start: "agent1",
        logic: [
          { from: "agent1", to: "agent2" },
        ],
      },
      agents: {
        agent1: { name: "TriageBot" },
        agent2: { name: "ResponderBot" },
      },
    };

    const result = validateFlow(project as any);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when project is not an object", () => {
    const result = validateFlow(null as any);

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("Project is empty or not a JSON object.")
      )
    ).toBe(true);
  });

  it("reports missing flow or agents sections", () => {
    const result = validateFlow({} as any);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing 'flow' section in .aiflow file.");
    expect(result.errors).toContain(
      "Missing or empty 'agents' section in .aiflow file."
    );
  });

  it("reports invalid or unknown flow.start", () => {
    const project = {
      flow: {
        start: "unknown_agent",
        logic: [],
      },
      agents: {
        agent1: {},
      },
    };

    const result = validateFlow(project as any);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("flow.start"))).toBe(true);
  });

  it("reports unknown from/to agents in logic rules", () => {
    const project = {
      flow: {
        start: "agent1",
        logic: [
          { from: "agent1", to: "unknown" },
          { from: "unknown2", to: "agent1" },
        ],
      },
      agents: {
        agent1: {},
      },
    };

    const result = validateFlow(project as any);

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("references unknown agent"))
    ).toBe(true);
  });
});
