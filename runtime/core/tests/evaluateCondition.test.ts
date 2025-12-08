import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../evaluateCondition.mts";

describe("evaluateCondition", () => {
  const ctx = {
    context: {
      user: "John",
      ticket_text: "My wifi is broken"
    },
    output: {
      classification: "Network Issue",
      priority: "High"
    },
    agentId: "agent1"
  };

  it("returns true when expression is empty or null", () => {
    expect(evaluateCondition("", ctx)).toBe(true);
    expect(evaluateCondition(null as any, ctx)).toBe(true);
    expect(evaluateCondition(undefined as any, ctx)).toBe(true);
  });

  it("compares values using ==", () => {
    expect(
      evaluateCondition("classification == 'Network Issue'", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("classification == \"Network Issue\"", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("priority == 'High'", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("priority == 'Low'", ctx)
    ).toBe(false);
  });

  it("compares values using !=", () => {
    expect(
      evaluateCondition("classification != 'Billing'", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("priority != 'High'", ctx)
    ).toBe(false);
  });

  it("supports contains(value, literal)", () => {
    expect(
      evaluateCondition("contains(classification, 'Network')", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("contains(classification, 'Billing')", ctx)
    ).toBe(false);

    expect(
      evaluateCondition("contains(ticket_text, 'wifi')", ctx)
    ).toBe(true);

    expect(
      evaluateCondition("contains(ticket_text, 'router')", ctx)
    ).toBe(false);
  });

  it("returns false for unknown or invalid expressions", () => {
    expect(
      evaluateCondition("foo > 3", ctx)
    ).toBe(false);

    expect(
      evaluateCondition("weird stuff()", ctx)
    ).toBe(false);
  });
});

