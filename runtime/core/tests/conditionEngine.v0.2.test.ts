// runtime/core/tests/conditionEngine.v0.2.test.ts

import { describe, it, expect } from 'vitest';
import {
  parseCondition,
  evaluateExpression,
  evaluateConditionAst
} from '../conditionEngineV2';

const ctx = {
  output: {
    score: 0.9,
    ticket_type: 'billing',
    summary: 'This is an urgent billing issue.'
  },
  user: {
    region: 'EU',
    plan: 'pro'
  }
};

describe('Condition Engine v0.2', () => {
  it('parses and evaluates "always" as true', () => {
    const result = evaluateExpression('always', ctx);
    expect(result).toBe(true);
  });

  it('compares numeric values', () => {
    expect(evaluateExpression('output.score > 0.5', ctx)).toBe(true);
    expect(evaluateExpression('output.score < 0.5', ctx)).toBe(false);
  });

  it('handles AND / OR logic', () => {
    expect(
      evaluateExpression('output.score > 0.5 AND user.region == "EU"', ctx)
    ).toBe(true);

    expect(
      evaluateExpression('output.score > 0.5 AND user.region == "US"', ctx)
    ).toBe(false);

    expect(
      evaluateExpression('output.score > 0.5 OR user.region == "US"', ctx)
    ).toBe(true);
  });

  it('handles NOT and parentheses', () => {
    expect(
      evaluateExpression('NOT (user.region == "US")', ctx)
    ).toBe(true);

    expect(
      evaluateExpression('(output.score > 0.5 AND user.region == "EU") OR user.region == "US"', ctx)
    ).toBe(true);
  });

  it('supports contains() with string paths', () => {
    expect(
      evaluateExpression('contains(output.summary, "urgent")', ctx)
    ).toBe(true);

    expect(
      evaluateExpression('contains(output.summary, "refund")', ctx)
    ).toBe(false);
  });

  it('exposes parseCondition for external validation', () => {
    const ast = parseCondition('output.score >= 0.8 AND user.plan == "pro"');
    const result = evaluateConditionAst(ast, ctx);
    expect(result).toBe(true);
  });
});
