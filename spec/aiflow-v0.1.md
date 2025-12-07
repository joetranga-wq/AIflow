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

## 3. metadata

Defines project-level information

{
  "name": "CustomerSupportFlow",
  "version": "1.0.0",
  "description": "Multi-agent workflow for support ticket handling.",
  "created": "2025-12-02T20:15:00Z",
  "modified": "2025-12-02T20:15:00Z"
}

Required fields:

Field	Type	Required	Description
name	string	yes	Human-readable project name
version	string	yes	Semver-compatible version
description	string	no	Optional description
created	string (ISO 8601)	yes	Creation timestamp
modified	string (ISO 8601)	yes	Last modification timestamp


## 4. agents

Each agent is a generative model with a role + prompt + config.

Example

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

Required fields
Field	Type	Description
name	string	Internal descriptive name
role	string	Classifier, Engineer, Writer, Worker, etc
provider	enum	"openai", "google", "anthropic"
model	string	Model name
prompt	string	Reference to prompt file
config	object	Model settings
5. flow

Defines execution order and transition logic.

## 5.1 start

Which agent runs first:

"start": "agent1"

## 5.2 logic

Defines routing rules between agents.

"logic": {
  "agent1": [
    {
      "if": "output.ticket_type == 'general'",
      "then": "agent2"
    }
  ]
}

Conditions MUST use the AIFLOW expression language (version 1.0).

Supported operators:

==, !=

<, <=, >, >=

and, or

string access: output.field

nested: output.data.key

## 6. tools (future extension)

Tools represent actions agents can perform.

Example placeholder:

"tools": {
  "web_search": {
    "type": "search",
    "description": "Perform web search queries.",
    "schema": {}
  }
}

## 7. memory (future extension)

Defines how long-term or per-agent memory is handled.

"memory": {
  "enabled": false
}

## 8. Execution Semantics

Runtime loads .aiflow

Runtime executes the start agent

Runtime parses model output (JSON if possible)

Runtime evaluates logic[agentX] rules

Runtime transitions to next agent

Runtime repeats until:

no transition is available

or workflow explicitly ends

Runtime returns final context

## 9. Validation Rules

All agents referenced in transitions must exist.

start must reference a valid agent.

All models must match provider constraints.

Conditions must be valid AIFLOW expressions.

metadata.version MUST follow semver.

All prompt file names must be resolvable in project directory.

## 10. File Extension

Official extension:

.aiflow

## 11. Versioning of the Standard

This document describes AIFLOW Standard v0.1.

Backwards-incompatible changes will increment the major version.

Minor versions add optional features.

Patch versions clarify existing rules.

## 12. Roadmap for v0.2

Fully defined tool API

Memory API

Event-driven workflows

Parallel execution

Improved validation (JSON Schema)

Streaming agent output

Tool calling integration (OpenAI, Anthropic, Google)

End of AIFLOW Standard v0.1


---

# ✅ **Volgende actie voor jou**

### 1️⃣ Maak de map:

```bash
mkdir spec
