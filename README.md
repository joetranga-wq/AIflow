# AIFLOW — Decision Security for Automated Systems

**We make sure automated actions can be stopped — and explained — before damage happens.**

AIFLOW is a **decision security layer** that sits between automated systems (AI agents, rules, ML)
and execution. It decides **whether automation is allowed** — and explains why.

AIFLOW never executes actions.

---

## How AIFLOW fits

```
Automated System
(AI agents, rules, ML)
        │
        ▼
   AIFLOW
Decision Security Layer
        │
   ┌────┴────┐
   ▼         ▼
Execute   Hold / Confirm
```

AIFLOW does not move money, publish content, or trigger side‑effects.  
It only decides whether automation may proceed.

---

## What AIFLOW is (and is not)

**AIFLOW is:**
- A decision layer for automated systems
- Explainable and trace‑first by design
- Provider‑agnostic (OpenAI, Gemini, others)

**AIFLOW is not:**
- An automation tool (like n8n or Zapier)
- A payment processor
- A fraud engine

Stopping automation is a **valid outcome**, not a failure.

---

## Decision‑as‑Code (.aiflow)

AIFLOW flows are defined as portable `.aiflow` JSON files.

A `.aiflow` file describes:
- Decision structure and routing
- Agent roles and responsibilities
- Expected decision outputs
- Retry and error semantics

This makes decisions:
- Versioned
- Reviewable
- Auditable
- Reproducible

The UI is an editor.  
The `.aiflow` file is the source of truth.

---

## Simulation mode (no API key)

AIFLOW supports deterministic simulation:
- No API keys required
- Seeded runs
- Trace‑first debugging

Simulation lets teams understand decisions **before** connecting real systems.

---

## Security & data handling

AIFLOW:
- Does not store credentials
- Does not execute actions
- Does not own sensitive systems

It evaluates decision context and returns a decision + explanation.

**AIFLOW sits outside the blast radius of core systems.**

---

# Developer Documentation

---

# AIFLOW Studio

![CI Status](https://github.com/AIFlow-studio/AIflow/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/AIFLOW-v0.1.0-blue)

**Visual AI Agent Workflows — Design · Run · Debug**

AIFLOW is a visual + code‑native framework for building multi‑agent AI workflows.

- 🧠 **Workflow Builder** – design agents and routing logic as a graph  
- ✍️ **File‑based Prompts** – prompts live as files in your repo  
- 🧰 **Tools Registry & Runtime** – define tools once, reuse them  
- 💻 **CLI Runtime** – execute `.aiflow` projects locally or in CI  
- 🐛 **Debug Trace Viewer** – inspect each step with full context  
- ✨ **Graph Highlighting** – jump from CLI trace to visual path  

AIFLOW is built for developers who want **clear, debuggable multi‑agent systems**
without hiding behavior behind SaaS black boxes.

---

## 🌟 Current Stable Version

**AIFLOW Standard:** v0.1 — Open Standard Preview  
**Runtime & Studio:** v0.1.x  
**Next Version:** v0.2 — active development on `main`

See the roadmap in [`AIFLOW.md`](./AIFLOW.md).

---

## 🔗 Links

- 🧩 **Standard & Master Document:** [`AIFLOW.md`](./AIFLOW.md)  
- 📘 **Spec folder:** [`./spec`](./spec)  
- 🌐 **Docs & Website:** https://aiflow-studio.github.io/AIflow-site/

---

## 🚀 Getting Started

```bash
git clone https://github.com/AIFlow-studio/AIflow.git
cd AIflow
npm install
npm run dev
```

Open `http://localhost:3000` to launch AIFLOW Studio.

---

## 🧪 Running an example flow via CLI

```bash
npm run run-flow -- ./examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow
```

Paste the final JSON output into **Debug → CLI Trace Viewer**
and use **Highlight full path in Workflow** to visualize the executed route.

---

## 📁 Project Structure

```
core/              # Core runtime & helpers
runtime/           # CLI runtime, condition engine, validator
spec/              # AIFLOW Standard v0.x
studio/            # React app (Studio UI)
examples/          # Example flows
docs/screenshots/  # UI screenshots
```

---

## 🤝 Contributing

Issues and pull requests are welcome.
A `CONTRIBUTING.md` will be added as the project matures.

---

## 📜 License

MIT License — see [`LICENSE`](./LICENSE).

---

## 💬 Contact

- X (Twitter): [@aiflowbuild](https://x.com/aiflowbuild)
- GitHub Issues

If you’re building something on top of AIFLOW, we’d love to see it.
