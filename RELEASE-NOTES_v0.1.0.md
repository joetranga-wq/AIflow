# AIFLOW v0.1.0 — Initial Open Standard Preview

**Release date:** 2025-12-07  
**Status:** Preview / Experimental

This is the first public preview release of **AIFLOW**, an open standard and toolkit for building **multi-agent AI workflows**.

---

## Highlights

### 🧠 AIFLOW Studio (React + Vite)

- Visual editor for multi-agent workflows  
- Configure agents, models, prompts and routing logic  
- Set a global API key in the UI  
- Run and inspect workflows directly in the browser

### ⚙️ AIFLOW Runtime (CLI)

- Node-based CLI runtime for executing `.aiflow` files  
- Reads and validates the project structure (`metadata`, `flow`, `agents`, `tools`, `memory`)  
- Executes agents sequentially and evaluates routing rules  
- Parses JSON output and injects it into the runtime context  

Entry point:

```bash
runtime/cli/runAiflow.mts
```

Run any workflow:

```bash
export API_KEY=YOUR_GEMINI_API_KEY
npm run run-flow -- ./examples/CustomerSupportFlow_v1.0.0.aiflow
```

### 📦 `.aiflow` Open Standard (v0.1)

See the spec document at:

- `spec/aiflow-v0.1.md`

Key design goals:

- Vendor-neutral JSON format  
- Deterministic execution semantics  
- Explicit routing logic (`flow.logic`)  
- Extensible design (`tools`, `memory`, future semantics)

### 🧪 Included Example Workflows

The `examples/` directory ships with three ready-to-run projects:

- `CustomerSupportFlow_v1.0.0.aiflow`  
- `MarketingContentFlow_v0.5.0.aiflow`  
- `LeadQualificationFlow_v1.0.0.aiflow`  

Each example demonstrates different agent roles, providers, routing setups and output formats.

---

## Breaking Changes (relative to local prototypes)

Because this is the first tagged public release, there are no breaking changes yet.  
Future releases will document any breaking changes in this file.

---

## Installation & Usage

Clone the repository:

```bash
git clone https://github.com/joetranga-wq/AIflow
cd AIflow
```

Install dependencies:

```bash
npm install
```

Run the Studio:

```bash
npm run dev
```

Run an example via CLI:

```bash
export API_KEY=YOUR_GEMINI_API_KEY
npm run run-flow -- ./examples/CustomerSupportFlow_v1.0.0.aiflow
```

---

## Roadmap for v0.2

- Expression-based routing language  
- More detailed validation of `.aiflow` files  
- Improved browser console (per-step logs and timing)  

---

## Feedback & Contributions

Please open issues and pull requests on GitHub:

- https://github.com/joetranga-wq/AIflow

This is an early preview. Feedback on the standard, runtime behavior and Studio UX is especially welcome.
