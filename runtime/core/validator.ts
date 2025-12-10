// runtime/core/validator.ts

/**
 * Basic validation types
 */

export type ValidationLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;      // e.g. 'MISSING_ENTRY_AGENT', 'LOGIC_UNKNOWN_TO'
  message: string;   // human readable explanation
  path?: string;     // JSON-style path, e.g. "flow.entry_agent" or "agents[0].id"
}

/**
 * Main entry point
 *
 * NOTE:
 * - `project` is typed as `any` for now so this file does not depend on
 *   your internal type definitions yet.
 * - Later you can replace `any` with your actual `AIFlowProject` type.
 */
export function validateProject(project: any): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!project || typeof project !== 'object') {
    issues.push({
      level: 'error',
      code: 'INVALID_PROJECT',
      message: 'Project must be a non-null object.',
      path: ''
    });
    return issues;
  }

  const flow = project.flow ?? {};
  const agents = Array.isArray(project.agents) ? project.agents : [];

  issues.push(...validateEntryAgent(flow, agents));
  issues.push(...validateAgents(agents));
  issues.push(...validateLogic(flow.logic ?? [], agents));

  return issues;
}

/**
 * Helpers
 */

function validateEntryAgent(flow: any, agents: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entry = flow.entry_agent;

  if (!entry) {
    issues.push({
      level: 'error',
      code: 'MISSING_ENTRY_AGENT',
      message: 'The flow.entry_agent field is required.',
      path: 'flow.entry_agent'
    });
    return issues;
  }

  const exists = agents.some((a) => a?.id === entry);
  if (!exists) {
    issues.push({
      level: 'error',
      code: 'INVALID_ENTRY_AGENT',
      message: `entry_agent "${entry}" does not match any agent.id.`,
      path: 'flow.entry_agent'
    });
  }

  return issues;
}

function validateAgents(agents: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!agents.length) {
    issues.push({
      level: 'error',
      code: 'NO_AGENTS_DEFINED',
      message: 'The project defines no agents.',
      path: 'agents'
    });
    return issues;
  }

  const ids = new Set<string>();

  agents.forEach((agent, index) => {
    const pathPrefix = `agents[${index}]`;

    if (!agent || typeof agent !== 'object') {
      issues.push({
        level: 'error',
        code: 'AGENT_INVALID',
        message: `Agent at index ${index} is not a valid object.`,
        path: pathPrefix
      });
      return;
    }

    if (!agent.id) {
      issues.push({
        level: 'error',
        code: 'AGENT_MISSING_ID',
        message: `Agent at index ${index} has no "id" field.`,
        path: `${pathPrefix}.id`
      });
    } else {
      if (ids.has(agent.id)) {
        issues.push({
          level: 'error',
          code: 'DUPLICATE_AGENT_ID',
          message: `Duplicate agent id "${agent.id}".`,
          path: `${pathPrefix}.id`
        });
      }
      ids.add(agent.id);
    }

    // Very light model check – can be expanded later
    const model = agent.model;
    if (!model || !model.provider || !model.name) {
      issues.push({
        level: 'warning',
        code: 'AGENT_MODEL_INCOMPLETE',
        message: `Agent "${agent.id ?? `#${index}`}" has incomplete model configuration.`,
        path: `${pathPrefix}.model`
      });
    }
  });

  return issues;
}

function validateLogic(logic: any[], agents: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const agentIds = new Set(agents.map((a) => a?.id).filter(Boolean) as string[]);

  if (!Array.isArray(logic)) {
    return issues;
  }

  logic.forEach((rule, index) => {
    const path = `flow.logic[${index}]`;

    if (!rule || typeof rule !== 'object') {
      issues.push({
        level: 'error',
        code: 'LOGIC_INVALID_RULE',
        message: `Logic rule at index ${index} is not a valid object.`,
        path
      });
      return;
    }

    if (!rule.from) {
      issues.push({
        level: 'error',
        code: 'LOGIC_MISSING_FROM',
        message: `Logic rule at index ${index} is missing "from".`,
        path
      });
    } else if (!agentIds.has(rule.from)) {
      issues.push({
        level: 'error',
        code: 'LOGIC_UNKNOWN_FROM',
        message: `Logic rule references unknown "from" agent "${rule.from}".`,
        path
      });
    }

    if (!rule.to) {
      // For now we treat missing "to" as a warning: flow can terminate here.
      issues.push({
        level: 'warning',
        code: 'LOGIC_MISSING_TO',
        message: `Logic rule at index ${index} has no "to" agent (flow may terminate here).`,
        path
      });
    } else if (!agentIds.has(rule.to)) {
      issues.push({
        level: 'error',
        code: 'LOGIC_UNKNOWN_TO',
        message: `Logic rule references unknown "to" agent "${rule.to}".`,
        path
      });
    }

    if (!rule.condition) {
      issues.push({
        level: 'warning',
        code: 'LOGIC_MISSING_CONDITION',
        message: `Logic rule at index ${index} has no "condition".`,
        path
      });
    }
    // In v0.2+ kun je hier een condition-parser aanroepen om syntax te checken.
  });

  return issues;
}

/**
 * Small helper for consumers that only care about "is this safe to run?"
 */
export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}
