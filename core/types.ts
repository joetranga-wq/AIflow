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

// ✅ Expanded roles to match existing templates in core/constants.ts
export type AgentRole =
  | 'Worker'
  | 'Tool'
  | 'Classifier'
  | 'Engineer'
  | 'Copywriter'
  | 'Planner'
  | 'Writer'
  | 'Marketer';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
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

// ✅ Updated Flow to match .aiflow exports + templates in constants.ts
export interface Flow {
  // Optional so new/empty projects can exist in the editor.
  entry_agent?: string;

  // Optional schema version used in .aiflow files / templates
  schema_version?: string;

  variables: FlowVariables;
  agents: string[];
  logic: FlowLogic[];

  // Optional error handling (present in constants.ts + exports)
  error_handling?: {
    retry?: number;
    fallback_agent?: string;
  };
}

export interface ToolOperation {
  name: string;
  method: string;
  path: string;
  description?: string;
  input_schema?: any;
  output_schema?: any;
}

// ✅ Updated ToolDefinition to support both “rich” and “simple/legacy” templates
export interface ToolDefinition {
  type: 'http' | 'builtin' | 'python';
  description: string;

  // Some templates define a single method at the tool root (legacy)
  method?: string;

  // Either rich ops or simple string ops (legacy)
  operations?: ToolOperation[] | string[];

  endpoint?: string;
  input_schema?: any;
  output_schema?: any;
}

export interface AIFlowProject {
  metadata: {
    name: string;
    version: string;
    description?: string;
    creator?: string;
  };
  agents: Agent[];
  flow: Flow;
  tools: Record<string, ToolDefinition>;
  prompts: Record<string, string>;
}
