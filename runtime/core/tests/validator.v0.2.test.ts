// runtime/core/tests/validator.v0.2.test.ts

import { describe, it, expect } from 'vitest';
import { validateProject, hasValidationErrors } from '../validator';

describe('Validator v0.2', () => {
  it('accepts a minimal valid project', () => {
    const project = {
      flow: {
        entry_agent: 'triage',
        logic: [
          { from: 'triage', to: 'responder', condition: 'always' }
        ]
      },
      agents: [
        { id: 'triage', model: { provider: 'gemini', name: 'gemini-pro' } },
        { id: 'responder', model: { provider: 'gemini', name: 'gemini-pro' } }
      ]
    };

    const issues = validateProject(project);
    expect(hasValidationErrors(issues)).toBe(false);
  });

  it('reports missing entry_agent', () => {
    const project = {
      flow: {},
      agents: [
        { id: 'triage', model: { provider: 'gemini', name: 'gemini-pro' } }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('MISSING_ENTRY_AGENT');
    expect(hasValidationErrors(issues)).toBe(true);
  });

  it('reports invalid entry_agent', () => {
    const project = {
      flow: { entry_agent: 'unknown', logic: [] },
      agents: [
        { id: 'triage', model: { provider: 'gemini', name: 'gemini-pro' } }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('INVALID_ENTRY_AGENT');
  });

  it('reports duplicate agent IDs', () => {
    const project = {
      flow: { entry_agent: 'triage', logic: [] },
      agents: [
        { id: 'triage', model: {} },
        { id: 'triage', model: {} }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('DUPLICATE_AGENT_ID');
  });

  it('reports unknown agent in logic.to', () => {
    const project = {
      flow: {
        entry_agent: 'triage',
        logic: [{ from: 'triage', to: 'responder', condition: 'always' }]
      },
      agents: [
        { id: 'triage', model: {} }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('LOGIC_UNKNOWN_TO');
  });

  it('allows missing logic (no rules) but still validates agents/entry', () => {
    const project = {
      flow: { entry_agent: 'triage' },
      agents: [
        { id: 'triage', model: { provider: 'gemini', name: 'gemini-pro' } }
      ]
    };

    const issues = validateProject(project);
    expect(hasValidationErrors(issues)).toBe(false);
  });
});
