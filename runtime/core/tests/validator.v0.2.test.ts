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
        { id: 'triage', model: { provider: 'gemini', name: 'gemini-pro' }, prompt: 'triage_prompt' },
        { id: 'responder', model: { provider: 'gemini', name: 'gemini-pro' }, prompt: 'responder_prompt' }
      ],
      prompts: {
        triage_prompt: 'You are a triage agent.',
        responder_prompt: 'You answer users.'
      },
      tools: [
        { id: 'lookup_kb' }
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

  it('reports unknown prompt referenced by agent', () => {
    const project = {
      flow: { entry_agent: 'triage', logic: [] },
      agents: [
        { id: 'triage', model: {}, prompt: 'missing_prompt' }
      ],
      prompts: {
        some_other_prompt: 'Hello'
      }
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('AGENT_UNKNOWN_PROMPT');
  });

  it('warns on unused prompts', () => {
    const project = {
      flow: { entry_agent: 'triage', logic: [] },
      agents: [
        { id: 'triage', model: {} }
      ],
      prompts: {
        unused_prompt: 'Hello'
      }
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('PROMPT_UNUSED');
  });

  it('reports unknown tools referenced by agent', () => {
    const project = {
      flow: { entry_agent: 'triage', logic: [] },
      agents: [
        { id: 'triage', model: {}, tools: ['unknown_tool'] }
      ],
      tools: [
        { id: 'lookup_kb' }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('AGENT_TOOL_UNKNOWN');
  });

  it('warns on unused tools', () => {
    const project = {
      flow: { entry_agent: 'triage', logic: [] },
      agents: [
        { id: 'triage', model: {} }
      ],
      tools: [
        { id: 'unused_tool' }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('TOOL_UNUSED');
  });

  it('warns on unreachable agents', () => {
    const project = {
      flow: {
        entry_agent: 'triage',
        logic: [
          { from: 'triage', to: 'responder', condition: 'always' }
        ]
      },
      agents: [
        { id: 'triage', model: {} },
        { id: 'responder', model: {} },
        { id: 'orphan', model: {} }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('UNREACHABLE_AGENT');
  });

  it('warns on multiple "always" conditions from same agent', () => {
    const project = {
      flow: {
        entry_agent: 'triage',
        logic: [
          { from: 'triage', to: 'responder', condition: 'always' },
          { from: 'triage', to: 'orphan', condition: 'always' }
        ]
      },
      agents: [
        { id: 'triage', model: {} },
        { id: 'responder', model: {} },
        { id: 'orphan', model: {} }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('LOGIC_MULTIPLE_ALWAYS');
  });

  it('warns on duplicate conditions from same agent', () => {
    const project = {
      flow: {
        entry_agent: 'triage',
        logic: [
          { from: 'triage', to: 'responder', condition: 'output.score > 0.5' },
          { from: 'triage', to: 'orphan', condition: 'output.score > 0.5' }
        ]
      },
      agents: [
        { id: 'triage', model: {} },
        { id: 'responder', model: {} },
        { id: 'orphan', model: {} }
      ]
    };

    const issues = validateProject(project);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('LOGIC_DUPLICATE_CONDITION');
  });
});
