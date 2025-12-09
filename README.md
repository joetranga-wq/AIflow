# AIFLOW Studio

**Visual AI Agent Workflows — Design · Run · Debug**

AIFLOW is a visual + code-native framework for building multi‑agent AI workflows.

- 🧠 **Workflow Builder** – design your agents and routing logic as a graph  
- ✍️ **File‑based Prompts** – prompts live as files in your repo and are linked to agents  
- 🧰 **Tools Registry & Runtime** – define tools once, reuse them across agents  
- 💻 **CLI Runtime** – execute `.aiflow` projects locally or in CI  
- 🐛 **Debug Trace Viewer** – inspect each step of a CLI run with full execution context  
- ✨ **Graph Highlighting** – jump from a CLI trace into the visual workflow path

AIFLOW is built for developers who want **clear, debuggable multi‑agent systems** without hiding anything behind SaaS black boxes.

---

## ✨ What’s in this repo?

This repository contains:

- The **AIFLOW Standard v0.1** spec (`./AIFLOW.md`)
- **AIFLOW Studio** (the web UI)
- The **CLI runtime** for running `.aiflow` projects
- The **condition engine**, **validator**, and **tools runtime**
- Example projects under `./examples`

Everything is designed to be **git‑friendly**: flows, agents, prompts, tools and rules all live as files.

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/AIFlow-studio/AIflow.git
cd AIflow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run AIFLOW Studio (web UI)

```bash
npm run dev
```

Then open the URL shown in your terminal (usually `http://localhost:3000`).  
From here you can:

- Edit workflows visually in the **Workflow Builder**
- Configure **agents**, **prompts**, and **tools**
- Open the **Debug – CLI Trace Viewer**

---

## 🧪 Running an example flow via CLI

This repo ships with a fully‑worked example: **CustomerSupportFlow**.

From the project root:

```bash
npm run run-flow -- ./examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow
```

You’ll see:

- Each agent step (e.g. `TriageBot`, `ResponderBot`)
- Raw model output
- Parsed output
- Selected routing rule and next agent

At the end, the CLI prints the **Final context JSON** with a `__trace` field.

Copy that JSON, then:

1. Open **Debug → CLI Trace Viewer** in AIFLOW Studio  
2. Paste the final context JSON  
3. Click **Parse trace** to inspect each step  
4. Use **Highlight full path in Workflow** to light up the executed path in the graph

---

## 🧠 Key Components

### Condition Engine

- Supports expressions like:  
  - `ticket_type == 'billing'`  
  - `contains(classification, 'Network')`  
- Works with nested keys such as `output_agent1.ticket_type`  
- Fully tested under `runtime/core/tests`

### Flow Validator

The validator checks that a `.aiflow` project is structurally sound:

- All agents referenced in routes exist  
- Conditions parse correctly  
- Entry/exit points are well‑defined

Validation is used both in the CLI and Studio to give early feedback on broken flows.

### Tools Runtime

- Central registry for tools defined in TypeScript  
- Runs tools for a given agent step during a flow  
- Makes tool input/output available in the agent context and trace

---

## 🐛 Debugging & Traces

The **Debug – CLI Trace Viewer** is designed to make multi‑agent behaviour understandable:

- See **Input Context**, **Parsed Output**, and **Evaluated Rules** per step  
- Clearly marked **selected rule** and **next agent**  
- Step badges (`STEP 0`, `STEP 1`, …) plus numbered markers in the graph  
- Full‑path highlighting across the workflow

Instead of guessing why a route was taken, you can see exactly which condition fired.

---

## 📁 Project Structure (high‑level)

```text
core/              # Core runtime & spec helpers
runtime/           # CLI runtime, condition engine, validator, tools runtime
spec/              # AIFLOW Standard v0.x spec
studio/            # Next.js/React app (AIFLOW Studio UI)
examples/          # Example flows, including CustomerSupportFlow
docs/screenshots/  # UI screenshots & marketing assets
```

---

## 🛠 Tech Stack

- **TypeScript / Node.js** – runtime & tooling  
- **React / Next.js** – Studio UI  
- **Vitest** – tests for core logic and CLI  
- **GitHub Actions** – CI for build and tests

---

## 🤝 Contributing

Contributions are very welcome.

- Found a bug or have an idea? → open an **Issue**  
- Want to add an example flow or tool? → open a **Pull Request**  

Please see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details once that file is in place.

---

## 📜 License

AIFLOW is released under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

---

## 💬 Questions / Feedback

For now, the easiest way to reach the project is via:

- X (Twitter): **[@aiflowbuild](https://x.com/aiflowbuild)**  
- GitHub Issues on this repo

If you’re building something cool on top of AIFLOW, we’d love to see it. 🚀
