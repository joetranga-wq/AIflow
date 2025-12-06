<div align="center">
  <h1>AIFLOW Studio</h1>

  <div>

  ![Status](https://img.shields.io/badge/status-active-brightgreen)
  ![License](https://img.shields.io/badge/license-MIT-blue)
  ![Node](https://img.shields.io/badge/node-22.x-43853d?logo=node.js&logoColor=white)
  ![Vite](https://img.shields.io/badge/vite-6.x-646CFF?logo=vite&logoColor=white)
  ![Gemini](https://img.shields.io/badge/Gemini-supported-4A90E2?logo=google)
  ![AIFLOW](https://img.shields.io/badge/AIFLOW-open%20standard-black)

  </div>

  <p><strong>Design, debug and execute multi-agent AI workflows – powered by the AIFLOW open standard.</strong></p>
</div>

---

## ⚡ Quick Start

```bash
git clone https://github.com/joetranga-wq/AIflow
cd AIflow

npm install
npm run dev


http://localhost:3000

export API_KEY=YOUR_GEMINI_API_KEY
npm run run-flow -- ./example.aiflow


🖼️ Screenshots

⚠️ Replace these placeholder images once you upload your screenshots to
docs/screenshots/.

Workflow Builder
<img src="docs/screenshots/mockup_agents_safari.svg" width="800"/>
Agent Editor
<img src="docs/screenshots/mockup_dashboard_safari.svg" width="800"/>
Execution Console
<img src="docs/screenshots/mockup_workflow_console_macbook.svg" width="800"/>
Exporting .aiflow
<img src="docs/screenshots/mockup_workflow_macbook.svg" width="800"/>
🚀 What is AIFLOW?

AIFLOW is a universal format for defining, sharing, and executing multi-agent AI workflows (.aiflow files).
It separates the logic of your workflow from the runtime, so the same .aiflow project can be executed in different environments (browser, CLI, server).

This repository contains:

AIFLOW Studio – a visual IDE to design workflows, configure agents, prompts, tools & memory.

AIFLOW Runtime (CLI) – a Node-based runner that can execute .aiflow projects end-to-end.

🧩 Core Concepts

An AIFLOW project includes:

metadata

flow – agents, transitions, variables, logic rules

agents

tools

prompts

Example Customer Support Flow:

TriageBot – classifier → returns ticket_type

TechSolver – engineer → returns status, message, next_action

Responder – copywriter → produces final customer email

🧪 Running the Studio (Browser Runtime)
1. Install dependencies
npm install

2. Configure environment

Create .env.local:

GEMINI_API_KEY=YOUR_GEMINI_API_KEY

3. Start dev server
npm run dev


You now have access to:

Workflow Builder

Agents / Prompts / Tools editors

Execution console

AIFLOW documentation viewer

4. Set Global API Key in the UI

Under Settings → Global API Key.

5. Run a flow

Click Run and watch each agent execute based on flow.logic.

🖥️ Running .aiflow via CLI

The runtime is located at:

services/runAiflow.mts


Export a .aiflow project from the Studio

Set your API key

Run:

npm run run-flow -- ./example.aiflow


The CLI runtime will:

Load the .aiflow

Execute agents sequentially

Build prompts

Call Gemini

Parse JSON output (via tryParseJson)

Populate the final context

🧠 JSON Post-Processing

The runtime:

strips ```json fences

parses JSON objects

stores them as:

"output_agent1": {
  "ticket_type": "general"
}


This enables conditional logic like:

if (context.output_agent1.ticket_type === "billing") …

🧱 Project Structure
AIflow/
├── App.tsx
├── components/
├── services/
│   ├── WorkflowRunner.ts
│   └── runAiflow.mts
├── types.ts
├── constants.ts
├── metadata.json
├── index.tsx
├── index.html
├── vite.config.ts
└── README.md


Future structure:

/studio
/runtime
/spec

🛣️ Roadmap
v0.2

Conditional flow logic

JSON-based routing

v0.3

Tooling standard

HTTP + Builtin tools

v0.4

Shared runtime core

Python runtime

v1.0

Full .aiflow container spec

Validation library

Security & trust model

🤝 Contributing
git checkout -b feat/my-feature
npm run dev
npm run run-flow -- example.aiflow
git commit -am "Add feature"
git push


Then open a PR.

📜 License

MIT (recommended).