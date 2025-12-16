import { AIFlowProject, Agent } from '../../core/types';
import { GoogleGenAI } from '@google/genai';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  agentId?: string;
  details?: any;
}

export type RunMode = 'real' | 'sim';

export interface SimOverrides {
  ticket_type?: string;      // e.g. "billing" | "technical"
  solution_found?: boolean;  // true | false
}

export interface RunOptions {
  mode?: RunMode;            // default: 'real' (auto 'sim' if no key)
  seed?: number;             // deterministic simulation seed
  simOverrides?: SimOverrides;
}

function strHash32(input: string): number {
  // Simple deterministic 32-bit hash
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  // Deterministic PRNG
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseBoolLike(v: any): boolean | undefined {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return undefined;
}

export class WorkflowRunner {
  private project: AIFlowProject;
  private ai: GoogleGenAI;
  private context: Record<string, any> = {};
  private onLog: (log: LogEntry) => void;
  private onStatusChange: (agentId: string, status: 'idle' | 'running' | 'completed' | 'error') => void;
  private isRunning: boolean = false;
  private apiKey: string;

  private options: Required<RunOptions>;

  constructor(
    project: AIFlowProject,
    apiKey: string,
    inputs: Record<string, string>,
    onLog: (log: LogEntry) => void,
    onStatusChange: (agentId: string, status: 'idle' | 'running' | 'completed' | 'error') => void,
    options?: RunOptions
  ) {
    this.project = project;
    this.onLog = onLog;
    this.onStatusChange = onStatusChange;

    this.apiKey = apiKey || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });

    this.context = { ...project.flow.variables, ...inputs };

    // Defaults:
    const mode: RunMode = options?.mode ?? (this.apiKey ? 'real' : 'sim');
    this.options = {
      mode,
      seed: options?.seed ?? 42,
      simOverrides: options?.simOverrides ?? {},
    };
  }

  async start() {
    this.isRunning = true;
    this.log('info', 'Starting workflow execution...', undefined, {
      initialContext: this.context,
      mode: this.options.mode,
      seed: this.options.seed,
      simOverrides: this.options.simOverrides,
    });

    let currentAgentId: string | null = this.project.flow.entry_agent;
    let steps = 0;
    const MAX_STEPS = 20;

    while (currentAgentId && this.isRunning && steps < MAX_STEPS) {
      const agent = this.project.agents.find((a) => a.id === currentAgentId);
      if (!agent) {
        this.log('error', `Agent '${currentAgentId}' not found in configuration.`);
        break;
      }

      await this.executeAgent(agent);

      if (!this.isRunning) break;

      const nextAgentId = this.evaluateLogic(currentAgentId);

      if (nextAgentId) {
        const nextAgent = this.project.agents.find((a) => a.id === nextAgentId);
        const nextLabel = nextAgent ? `${nextAgent.name} (${nextAgentId})` : nextAgentId;
        this.log('info', `Routing to next agent: ${nextLabel}`, agent.id);
        currentAgentId = nextAgentId;
      } else {
        this.log('info', 'No matching rule. Execution will stop.', agent.id);
        this.log('success', 'Workflow execution finished. No further valid transitions.');
        currentAgentId = null;
      }
      steps++;
    }

    if (steps >= MAX_STEPS) {
      this.log('warn', 'Execution stopped: Max steps exceeded (Loop protection).');
    }

    this.isRunning = false;
  }

  stop() {
    this.isRunning = false;
    this.log('warn', 'Workflow execution stopped by user.');
  }

  private async executeAgent(agent: Agent) {
    this.onStatusChange(agent.id, 'running');
    this.log('info', `Executing Agent: ${agent.name}`, agent.id);

    try {
      let promptText =
        this.project.prompts[agent.prompt] || `You are a helpful AI assistant acting as ${agent.role}.`;

      // Template Injection
      promptText = promptText.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return this.context[key] !== undefined ? String(this.context[key]) : `{{${key}}}`;
      });

      const contextString = JSON.stringify(this.context, null, 2);
      const fullPrompt = `${promptText}\n\n[Current Context Variables]:\n${contextString}\n\nInstructions: Perform your task based on the context.`;

      let output = '';

      const runMode: RunMode = this.options.mode;

      if (runMode === 'real') {
        if (!this.apiKey) {
          // Real mode, but no key: hard fail (consistent)
          throw new Error('No API key provided (required for real mode).');
        }

        // Choose model mapping (kept from existing logic)
        let modelId = 'gemini-2.5-flash';
        if (agent.model.name.includes('pro') || agent.model.name.includes('gpt-4')) {
          modelId = 'gemini-3-pro-preview';
        }

        this.log('info', `Generating content with model: ${modelId}...`, agent.id);

        // NOTE: agent.model in core types supports: name, temperature, max_tokens
        // DO NOT reference top_p here (it doesn't exist in AgentModel).
        const response = await this.ai.models.generateContent({
          model: modelId,
          contents: fullPrompt,
          config: {
            temperature: agent.model.temperature,
            maxOutputTokens: agent.model.max_tokens || 1000,
            responseMimeType: agent.output_format === 'json' ? 'application/json' : 'text/plain',
          },
        });

        output = response.text || '';
      } else {
        // SIM MODE: deterministic, no network, no key needed
        output = this.simulateAgentOutput(agent);
      }

      this.log('success', `Agent completed task.`, agent.id, {
        outputPreview: typeof output === 'string' ? output.slice(0, 500) : output,
      });

      // Store raw output
      this.context['last_output'] = output;
      this.context[`${agent.id}.output`] = output;

      // If JSON, try to parse and merge into context
      if (agent.output_format === 'json') {
        try {
          const json = JSON.parse(output);
          this.context = { ...this.context, ...json };
          this.log('info', 'Context updated with parsed JSON.', agent.id, json);
        } catch {
          this.log('warn', 'Failed to parse JSON output.', agent.id, { output });
        }
      }

      this.onStatusChange(agent.id, 'completed');
    } catch (error: any) {
      this.log('error', `Execution failed: ${error?.message || String(error)}`, agent.id);
      this.onStatusChange(agent.id, 'error');
      throw error;
    }
  }

  private simulateAgentOutput(agent: Agent): string {
    const seed = this.options.seed ?? 42;
    const baseKey = `sim:${seed}:${agent.id}:${agent.name}:${agent.role}`;
    const sig = strHash32(baseKey);

    // Simple deterministic PRNG (if you want a bit of variety)
    const rand = mulberry32(sig);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

    const overrides = this.options.simOverrides || {};

    // Mirror CLI-like behavior (good enough for designing routes)
    if (agent.output_format === 'json') {
      // Default payloads
      if (agent.id === 'agent1') {
        const ticketType = overrides.ticket_type || pick(['technical', 'billing']);
        const payload: any = {
          simulated: true,
          ticket_type: ticketType,
          signature: `sim-${seed}-${agent.id}-${sig}`,
        };
        if (overrides.ticket_type) payload.__sim_override = { ticket_type: overrides.ticket_type };
        return JSON.stringify(payload, null, 2);
      }

      if (agent.id === 'agent2') {
        const solutionFound = parseBoolLike(overrides.solution_found) ?? false;
        const payload: any = {
          simulated: true,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          decision: pick(['A', 'B', 'C']),
          signature: `sim-${seed}-${agent.id}-${sig}`,
        };
        if (solutionFound === true) {
          payload.solution_found = true;
          payload.__sim_override = { solution_found: true };
        }
        return JSON.stringify(payload, null, 2);
      }

      // Generic JSON agent
      const payload: any = {
        simulated: true,
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        signature: `sim-${seed}-${agent.id}-${sig}`,
      };
      return JSON.stringify(payload, null, 2);
    }

    // text/plain simulation
    return `SIMULATED_OUTPUT(${agent.id}) seed=${seed} sig=${sig}`;
  }

  private evaluateLogic(currentAgentId: string): string | null {
    const rules = this.project.flow.logic.filter((l) => l.from === currentAgentId);

    for (const rule of rules) {
      if (rule.condition === 'always') return rule.to;

      try {
        const condition = rule.condition.trim();
        if (condition.includes('==')) {
          const [keyRaw, valRaw] = condition.split('==').map((s) => s.trim());
          const key = keyRaw.replace(/['"]/g, '');
          const val = valRaw.replace(/['"]/g, '');
          if (String(this.context[key]) === val) return rule.to;
        } else {
          if (this.context[condition]) return rule.to;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`Error evaluating rule: ${rule.condition}`, e);
      }
    }
    return null;
  }

  private log(level: LogEntry['level'], message: string, agentId?: string, details?: any) {
    this.onLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      level,
      message,
      agentId,
      details,
    });
  }
}
