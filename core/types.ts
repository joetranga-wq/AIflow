export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  WORKFLOW = 'WORKFLOW',
  AGENTS = 'AGENTS',
  PROMPTS = 'PROMPTS',
  TOOLS = 'TOOLS',
  MEMORY = 'MEMORY',
  SETTINGS = 'SETTINGS',
  DOCS = 'DOCS',
  DEBUG = 'DEBUG',
}

export interface AgentModel {
  provider: string;
  name: string;
  temperature: number;
  max_tokens: number;
}

export interface Agent {
  id: string;
  name: string;
  role: 'Worker' | 'Tool';
  model: AgentModel;
  prompt: string;
  instructions: string;
  tools: string[];
  memory: string;
  output_format: string;
  executionStatus?: 'idle' | 'running' | 'success' | 'error';
}

export interface FlowLogic {
  id: string;
  from: string;
  to: string;
  condition: string;
  description: string;
  mapping?: any;

  // Decision owner for decision points in the UI (optional for backwards compatibility)
  decisionOwner?: 'ai' | 'human';
}

export interface FlowVariables {
  [key: string]: string | number | boolean;
}

export interface Flow {
  // Start node for runtime execution. Optional so new/empty projects can exist in the editor.
  entry_agent?: string;

  variables: FlowVariables;
  agents: string[];
  logic: FlowLogic[];
}

export interface ToolOperation {
  name: string;
  method: string;
  path: string;
  description?: string;
  input_schema?: any;
  output_schema?: any;
}

export interface ToolDefinition {
  type: 'http' | 'builtin' | 'python';
  description: string;
  operations: ToolOperation[];
  endpoint?: string;
}

export interface AIFlowProject {
  metadata: {
    name: string;
    version: string;
    description?: string;
  };
  agents: Agent[];
  flow: Flow;
  tools: Record<string, ToolDefinition>;
  prompts: Record<string, string>;
}
