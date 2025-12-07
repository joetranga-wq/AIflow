# AIFLOW Standard — Version 0.1

AIFLOW is an open standard for defining, exchanging, and executing multi-agent AI workflows.  
It provides a portable, deterministic JSON-based format that can be executed by any AIFLOW-compliant runtime.

---

## 1. Goals of the Standard

- Provide a **vendor-neutral** workflow specification for LLM-based agents.  
- Allow workflows to be **shared**, **portable**, and **version-controlled**.  
- Separate **design (Studio)** from **execution (Runtime)**.  
- Support **deterministic transitions** based on agent output.  
- Allow future extensibility (tools, memory, events, conditions).  

---

## 2. AIFLOW Project Structure

Every `.aiflow` file must contain the following root fields:

```json
{
  "metadata": { ... },
  "flow": { ... },
  "agents": { ... },
  "tools": { ... },
  "memory": { ... }
}
```

---

## 3. `metadata`

Defines project-level information:

```json
{
  "name": "CustomerSupportFlow",
  "version": "1.0.0",
  "description": "Multi-agent workflow for support ticket handling.",
  "created": "2025-12-02T20:15:00Z",
  "modified": "2025-12-02T20:15:00Z"
}
```

Required fields:

| Field      | Type            | Required | Description                         |
|-----------|-----------------|----------|-------------------------------------|
| `name`    | string          | yes      | Human-readable project name        |
| `version` | string (semver) | yes      | Project version                    |
| `created` | string (ISO8601)| yes      | Creation timestamp                 |
| `modified`| string (ISO8601)| yes      | Last modification timestamp        |
| `description` | string      | no       | Optional description               |

---

## 4. `agents`

Each agent is a generative model with a role, prompt and configuration.

Example:

```json
"agents": {
  "agent1": {
    "name": "TriageBot",
    "role": "Classifier",
    "provider": "openai",
    "model": "gpt-4.2-mini",
    "prompt": "system_triage.txt",
    "config": {
      "temperature": 0.1,
      "max_tokens": 500
    }
  }
}
```

Required conceptual fields:

| Field     | Type   | Description                                         |
|----------|--------|-----------------------------------------------------|
| `name`   | string | Internal descriptive name                           |
| `role`   | string | e.g. `Classifier`, `Engineer`, `Writer`, `Analyst`  |
| `provider` | enum | e.g. `"openai"`, `"google"`, `"anthropic"`          |
| `model`  | string | Model name as required by the provider              |
| `prompt` | string | Reference to a prompt template or inline text       |
| `config` | object | Model settings (temperature, max_tokens, etc.)      |

---

## 5. `flow`

Defines execution order and transition logic.

### 5.1 `start`

Specifies which agent runs first:

```json
"flow": {
  "start": "agent1"
}
```

### 5.2 `logic`

Defines routing rules between agents:

```json
"logic": {
  "agent1": [
    {
      "if": "output.ticket_type == 'general'",
      "then": "agent2",
      "description": "Route general tickets to agent2."
    }
  ]
}
```

Conditions MUST use the AIFLOW expression language (version 1.0).

Supported operators (non-exhaustive):

- `==`, `!=`  
- `<`, `<=`, `>`, `>=`  
- `and`, `or`  
- field access: `output.field`, `output.data.key`  

---

## 6. `tools` (future extension)

Tools represent actions agents can perform (e.g. HTTP calls, database queries).

Example placeholder:

```json
"tools": {
  "web_search": {
    "type": "http",
    "endpoint": "https://api.search.com/v1",
    "method": "GET",
    "description": "Perform web documentation searches.",
    "schema": {}
  }
}
```

The exact tool schema will be defined in a future version.

---

## 7. `memory` (future extension)

Defines how long-term or per-agent memory is handled.

Example placeholder:

```json
"memory": {
  "enabled": false
}
```

A future version of the standard will describe memory stores and policies.

---

## 8. Execution Semantics

High-level steps:

1. Runtime loads the `.aiflow` file.  
2. Runtime validates the structure (`metadata`, `agents`, `flow`, etc.).  
3. Runtime starts at `flow.start`.  
4. Runtime runs the configured agent (prompt + model + config).  
5. Runtime attempts to parse output (JSON if `output_format` is JSON).  
6. Parsed values are injected into runtime context.  
7. Runtime evaluates `flow.logic[currentAgent]` conditions.  
8. If a rule matches, runtime transitions to the `then` agent.  
9. Steps 4–8 repeat until no transitions match or the flow ends explicitly.  
10. Runtime returns the final context and last agent output.

---

## 9. Validation Rules (v0.1)

Minimum validation requirements:

- All agents referenced in `flow.start` and `flow.logic` MUST exist in `agents`.  
- `metadata.version` MUST follow semantic versioning (`MAJOR.MINOR.PATCH`).  
- Providers + models MUST be compatible with the runtime implementation.  
- Expression strings in `flow.logic[*].if` MUST be valid according to the expression grammar.  

---

## 10. File Extension

Official extension:

```text
.aiflow
```

---

## 11. Versioning of the Standard

This document describes **AIFLOW Standard v0.1**.

- Backwards-incompatible changes will increment the **major** version.  
- New optional features will increment the **minor** version.  
- Clarifications and non-breaking changes will increment the **patch** version.  

---

## 12. Roadmap for v0.2

Planned additions:

- Fully defined tool API  
- Memory API specification  
- Event-driven workflows  
- Parallel execution semantics  
- JSON Schema-based validation  
- Streaming agent output  
- Tool calling integration with major LLM providers  

---

_End of AIFLOW Standard v0.1_
