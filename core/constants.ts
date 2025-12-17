import { AIFlowProject } from './types';

export const INITIAL_PROJECT: AIFlowProject = {
  metadata: {
    name: "CustomerSupportFlow",
    version: "1.0.0",
    description: "Multi-agent workflow for automated level 1 customer support.",
    creator: "Marcel Spaan"
  },
  flow: {
    schema_version: "1.0",
    entry_agent: "agent1",
    agents: ["agent1", "agent2", "agent3"],
    variables: {
      language: "nl",
      timezone: "Europe/Amsterdam"
    },
    logic: [
      {
        id: "rule1",
        from: "agent1",
        to: "agent2",
        condition: "ticket_type == 'technical'",
        description: "Route technical issues to the solution finder."
      },
      {
        id: "rule2",
        from: "agent1",
        to: "agent3",
        condition: "ticket_type == 'billing'",
        description: "Route billing issues to the general responder."
      },
      {
        id: "rule3",
        from: "agent2",
        to: "agent3",
        condition: "solution_found == true",
        description: "Draft response after solution is found."
      }
    ],
    error_handling: {
      retry: 2,
      fallback_agent: "agent3"
    }
  },
  agents: [
    {
      id: "agent1",
      name: "TriageBot",
      role: "Classifier",
      model: {
        provider: "openai",
        name: "gpt-4.2-mini",
        temperature: 0.1,
        max_tokens: 500
      },
      prompt: "system_triage.txt",
      instructions: "instructions_triage.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent2",
      name: "TechSolver",
      role: "Engineer",
      model: {
        provider: "openai",
        name: "gpt-4-turbo",
        temperature: 0.4,
        max_tokens: 2000
      },
      prompt: "system_tech.txt",
      instructions: "instructions_tech.md",
      tools: ["web_search", "stack_overflow_api"],
      memory: "memory/vector.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent3",
      name: "Responder",
      role: "Copywriter",
      model: {
        provider: "anthropic",
        name: "claude-3-5-sonnet",
        temperature: 0.7,
        max_tokens: 1000
      },
      prompt: "system_responder.txt",
      instructions: "guidelines_tone.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "text",
      executionStatus: "idle"
    }
  ],
  tools: {
    "web_search": {
      type: "http",
      endpoint: "https://api.search.com/v1",
      method: "GET",
      description: "Search the web for documentation."
    },
    "calculator": {
      type: "builtin",
      operations: ["add", "subtract", "multiply", "divide"],
      description: "Basic arithmetic operations."
    }
  },
  prompts: {
    "system_triage.txt": "You are a classifier. Analyze the incoming ticket and output JSON with 'ticket_type' (technical|billing|general).",
    "system_tech.txt": "You are a senior support engineer. Use tools to find solutions to the technical problem described.",
    "system_responder.txt": "You are a polite customer service agent. Draft a friendly email based on the provided solution."
  }
};

export const MARKETING_PROJECT: AIFlowProject = {
  metadata: {
    name: "MarketingContentFlow",
    version: "0.5.0",
    description: "Generates blog posts and social media snippets from topic ideas.",
    creator: "Sarah Jones"
  },
  flow: {
    schema_version: "1.0",
    entry_agent: "agent_strategist",
    agents: ["agent_strategist", "agent_writer", "agent_social"],
    variables: {
      tone: "professional"
    },
    logic: [
      {
        id: "link1",
        from: "agent_strategist",
        to: "agent_writer",
        condition: "approved == true",
        description: "Proceed to writing if strategy approved"
      },
      {
        id: "link2",
        from: "agent_writer",
        to: "agent_social",
        condition: "always",
        description: "Generate social media posts after article"
      }
    ],
    error_handling: {
      retry: 1,
      fallback_agent: "agent_strategist"
    }
  },
  agents: [
    {
      id: "agent_strategist",
      name: "ContentStrategist",
      role: "Planner",
      model: {
        provider: "openai",
        name: "gpt-4-turbo",
        temperature: 0.7,
        max_tokens: 1000
      },
      prompt: "strategy_prompt.txt",
      instructions: "strategy_guide.md",
      tools: ["trend_analysis"],
      memory: "memory/market_data.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent_writer",
      name: "BlogWriter",
      role: "Writer",
      model: {
        provider: "anthropic",
        name: "claude-3-opus",
        temperature: 0.8,
        max_tokens: 3000
      },
      prompt: "writer_prompt.txt",
      instructions: "style_guide.md",
      tools: [],
      memory: "memory/brand_voice.json",
      output_format: "markdown",
      executionStatus: "idle"
    },
    {
      id: "agent_social",
      name: "SocialMediaManager",
      role: "Marketer",
      model: {
        provider: "google",
        name: "gemini-2.5-flash",
        temperature: 0.9,
        max_tokens: 500
      },
      prompt: "social_prompt.txt",
      instructions: "platform_rules.md",
      tools: [],
      memory: "",
      output_format: "json",
      executionStatus: "idle"
    }
  ],
  tools: {
    "trend_analysis": {
      type: "http",
      endpoint: "https://api.trends.com/v1",
      method: "GET",
      description: "Analyze current market trends."
    }
  },
  prompts: {
    "strategy_prompt.txt": "Outline a content strategy for the given topic.",
    "writer_prompt.txt": "Write a comprehensive blog post based on the strategy.",
    "social_prompt.txt": "Create 3 tweets and 1 LinkedIn post for the blog article."
  }
};

export const TOOL_TEMPLATES: Record<string, any> = {
  "weather_api": {
    type: "http",
    description: "Get current weather for a location",
    endpoint: "https://api.weather.com/v1/current",
    method: "GET",
    input_schema: {
      type: "object",
      properties: { location: { type: "string" } }
    }
  },
  "calculator": {
    type: "builtin",
    description: "Perform basic math operations",
    operations: ["add", "subtract", "multiply", "divide"]
  },
  "database_query": {
    type: "http",
    description: "Execute SQL query",
    endpoint: "https://db.internal/query",
    method: "POST"
  }
};

// ===============================
// Default template (used for "New Project")  ✅ TEMPLATE B
// ===============================
export const DEFAULT_PROJECT_TEMPLATE: AIFlowProject = {
  metadata: {
    name: "Untitled Project",
    version: "0.1.0",
    description: "First 5 minutes with AIFlow (demo template)",
    creator: "Marcel Spaan"
  },

  flow: {
    schema_version: "1.0",
    entry_agent: "agent_1",
    agents: ["agent_1", "agent_2", "agent_3", "agent_4"],
    variables: {
      language: "nl",
      timezone: "Europe/Amsterdam"
    },
    logic: [
      {
        id: "link_1",
        from: "agent_1",
        to: "agent_2",
        condition: "language == \"nl\"",
        description: "Agent1 -> Agent2",
        decisionOwner: "ai"
      },
      {
        id: "link_2",
        from: "agent_2",
        to: "agent_3",
        condition: "language == \"nl\"",
        description: "Agent2 -> Agent3",
        decisionOwner: "ai"
      },
      {
        id: "link_3",
        from: "agent_3",
        to: "agent_4",
        condition: "language == \"nl\"",
        description: "Agent3 -> Draft",
        decisionOwner: "ai"
      }
    ],
    error_handling: {
      retry: 2,
      fallback_agent: "agent_4"
    }
  },

  agents: [
    {
      id: "agent_1",
      name: "New Agent1",
      role: "Worker",
      model: { provider: "openai", name: "gpt-4-turbo", temperature: 0.7, max_tokens: 1000 },
      prompt: "new_prompt.txt",
      instructions: "instructions.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent_2",
      name: "New Agent2",
      role: "Worker",
      model: { provider: "openai", name: "gpt-4-turbo", temperature: 0.7, max_tokens: 1000 },
      prompt: "new_prompt.txt",
      instructions: "instructions.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent_3",
      name: "New Agent3",
      role: "Worker",
      model: { provider: "openai", name: "gpt-4-turbo", temperature: 0.7, max_tokens: 1000 },
      prompt: "new_prompt.txt",
      instructions: "instructions.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "json",
      executionStatus: "idle"
    },
    {
      id: "agent_4",
      name: "Draft answer",
      role: "Worker",
      model: { provider: "openai", name: "gpt-4-turbo", temperature: 0.7, max_tokens: 1000 },
      prompt: "new_prompt.txt",
      instructions: "instructions.md",
      tools: [],
      memory: "memory/schema.json",
      output_format: "json",
      executionStatus: "idle"
    }
  ],

  tools: {},

  // ✅ Prevent AGENT_UNKNOWN_PROMPT("new_prompt.txt")
  prompts: {
    "new_prompt.txt": "You are a helpful AI agent. Output JSON."
  }
};
