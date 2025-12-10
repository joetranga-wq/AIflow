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
  const logic = Array.isArray(flow.logic) ? flow.logic : [];
  const prompts = project.prompts ?? null;
  const tools = Array.isArray(project.tools) ? project.tools : [];

  issues.push(...validateEntryAgent(flow, agents));
  issues.push(...validateAgents(agents));
  issues.push(...validateLogic(logic, agents));
  issues.push(...validatePrompts(prompts, agents));
  issues.push(...validateTools(tools, agents));
  issues.push(...validateReachability(flow.entry_agent, agents, logic));

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

  const rulesByFrom: Record<string, any[]> = {};

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

    // Verzamel rules per from-agent voor conflict-detectie
    if (rule.from) {
      if (!rulesByFrom[rule.from]) {
        rulesByFrom[rule.from] = [];
      }
      rulesByFrom[rule.from].push({ rule, index, path });
    }
  });

  // Conflicten per from-agent
  Object.entries(rulesByFrom).forEach(([fromId, entries]) => {
    // 1) Meerdere "always" conditions vanaf dezelfde from
    const alwaysRules = entries.filter(
      (e) =>
        typeof e.rule.condition === 'string' &&
        e.rule.condition.trim().toLowerCase() === 'always'
    );
    if (alwaysRules.length > 1) {
      issues.push({
        level: 'warning',
        code: 'LOGIC_MULTIPLE_ALWAYS',
        message: `Agent "${fromId}" has multiple logic rules with condition "always". Execution order may be ambiguous.`,
        path: `flow.logic`
      });
    }

    // 2) Exact dezelfde condition meerdere keren
    const seenConditions = new Map<string, number>();
    for (const e of entries) {
      const cond = String(e.rule.condition ?? '').trim();
      if (!cond) continue;
      const key = cond;
      if (seenConditions.has(key)) {
        issues.push({
          level: 'warning',
          code: 'LOGIC_DUPLICATE_CONDITION',
          message: `Agent "${fromId}" has duplicate logic condition "${cond}".`,
          path: `flow.logic[${e.index}]`
        });
      } else {
        seenConditions.set(key, e.index);
      }
    }
  });

  return issues;
}

/**
 * Prompt validation:
 * - If project.prompts is an object map: { key: "prompt text" }
 * - Agent.prompt can reference a key in project.prompts
 */
function validatePrompts(prompts: any, agents: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!prompts || typeof prompts !== 'object') {
    // No global prompts defined – nothing to validate.
    return issues;
  }

  const promptKeys = new Set<string>(Object.keys(prompts));
  const usedPromptKeys = new Set<string>();

  agents.forEach((agent, index) => {
    const promptKey = agent?.prompt;
    if (!promptKey) return;

    const path = `agents[${index}].prompt`;
    if (!promptKeys.has(promptKey)) {
      issues.push({
        level: 'error',
        code: 'AGENT_UNKNOWN_PROMPT',
        message: `Agent "${agent.id ?? `#${index}`}" references unknown prompt key "${promptKey}".`,
        path
      });
    } else {
      usedPromptKeys.add(promptKey);
    }
  });

  // Unused prompts (nice to know, not fatal)
  promptKeys.forEach((key) => {
    if (!usedPromptKeys.has(key)) {
      issues.push({
        level: 'warning',
        code: 'PROMPT_UNUSED',
        message: `Prompt "${key}" is defined but not used by any agent.`,
        path: `prompts["${key}"]`
      });
    }
  });

  return issues;
}

/**
 * Tools validation:
 * - project.tools: array of { id, ... }
 * - agent.tools: array of tool ids
 */
function validateTools(tools: any[], agents: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(tools) || tools.length === 0) {
    // No tools defined – only validate that agents don't reference unknown tools.
    agents.forEach((agent, index) => {
      const agentTools: string[] = Array.isArray(agent?.tools) ? agent.tools : [];
      if (agentTools.length > 0) {
        issues.push({
          level: 'warning',
          code: 'AGENT_TOOLS_WITHOUT_REGISTRY',
          message: `Agent "${agent.id ?? `#${index}`}" references tools, but project.tools is empty.`,
          path: `agents[${index}].tools`
        });
      }
    });
    return issues;
  }

  const toolIds = new Set<string>();
  tools.forEach((t, index) => {
    if (!t || typeof t !== 'object' || !t.id) {
      issues.push({
        level: 'error',
        code: 'TOOL_INVALID',
        message: `Tool at index ${index} is missing an "id" field.`,
        path: `tools[${index}]`
      });
      return;
    }
    if (toolIds.has(t.id)) {
      issues.push({
        level: 'error',
        code: 'DUPLICATE_TOOL_ID',
        message: `Duplicate tool id "${t.id}".`,
        path: `tools[${index}].id`
      });
    }
    toolIds.add(t.id);
  });

  const usedToolIds = new Set<string>();

  agents.forEach((agent, index) => {
    const agentTools: string[] = Array.isArray(agent?.tools) ? agent.tools : [];
    agentTools.forEach((toolId) => {
      const path = `agents[${index}].tools`;
      if (!toolIds.has(toolId)) {
        issues.push({
          level: 'error',
          code: 'AGENT_TOOL_UNKNOWN',
          message: `Agent "${agent.id ?? `#${index}`}" references unknown tool "${toolId}".`,
          path
        });
      } else {
        usedToolIds.add(toolId);
      }
    });
  });

  // Unused tools (warning)
  toolIds.forEach((id) => {
    if (!usedToolIds.has(id)) {
      issues.push({
        level: 'warning',
        code: 'TOOL_UNUSED',
        message: `Tool "${id}" is defined but not used by any agent.`,
        path: `tools`
      });
    }
  });

  return issues;
}

/**
 * Reachability:
 * - Starting from entry_agent, follow logic[from -> to]
 * - Agents that are never reached: warning UNREACHABLE_AGENT
 */
function validateReachability(
  entryAgent: string | undefined,
  agents: any[],
  logic: any[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!entryAgent) {
    // Already handled as error in validateEntryAgent
    return issues;
  }

  const agentIds = new Set(agents.map((a) => a?.id).filter(Boolean) as string[]);
  if (!agentIds.has(entryAgent)) {
    // Already handled as error
    return issues;
  }

  const adjacency = new Map<string, Set<string>>();
  logic.forEach((rule) => {
    if (!rule || typeof rule !== 'object') return;
    const from = rule.from;
    const to = rule.to;
    if (!from || !to) return;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)!.add(to);
  });

  const reachable = new Set<string>();
  const queue: string[] = [];

  reachable.add(entryAgent);
  queue.push(entryAgent);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    neighbors.forEach((next) => {
      if (!reachable.has(next) && agentIds.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    });
  }

  agents.forEach((agent, index) => {
    const id = agent?.id;
    if (!id) return;
    if (!reachable.has(id)) {
      issues.push({
        level: 'warning',
        code: 'UNREACHABLE_AGENT',
        message: `Agent "${id}" is never reached from entry_agent "${entryAgent}".`,
        path: `agents[${index}]`
      });
    }
  });

  return issues;
}

/**
 * Small helper for consumers that only care about "is this safe to run?"
 */
export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}
