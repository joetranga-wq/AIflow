# AIFLOW — Open Standard & Studio  
*Masterdocument voor standaard, runtime, studio, website en roadmap*

---

## 1. Visie & Positionering

**AIFLOW** is een open standaard en toolset voor het definiëren, delen en uitvoeren van **multi-agent AI-workflows**.

Het doel:

- Een **vendor-neutrale** manier om agents, prompts, tools en logica te beschrijven.
- Een **draagbaar** formaat: één `.aiflow` JSON-bestand bevat alles wat een workflow nodig heeft.
- Een **scheiding van concerns**:
  - **AIFLOW Standard** — de JSON-spec.
  - **AIFLOW Studio** — visuele editor voor workflows.
  - **AIFLOW Runtime** — engines (CLI / browser / straks Python) die de `.aiflow`-bestanden uitvoeren.

AIFLOW moet zich voelen als:

- **OpenAPI voor multi-agent workflows**  
- Met de UX-polish van moderne no-code tools  
- En de degelijkheid van een “real standard” (spec, validators, tooling, tests).

---

## 2. Repositories & Structuur

### 2.1 Repos

- **Studio + Runtime + Spec**  
  `https://github.com/joetranga-wq/AIflow`
- **Marketing website / docs hub**  
  `https://github.com/joetranga-wq/AIflow-site`

### 2.2 Hoofdstructuur AIflow-repo

Samengevat:

- `studio/` — React UI (AIFLOW Studio)
- `core/` — types, constants, shared logic
- `runtime/`
  - `cli/` — Node/TS CLI-runtime (`runAiflow.mts`)
  - `browser/` — browser runtime (`WorkflowRunner.ts`)
- `spec/` — AIFLOW Standard v0.1 (`aiflow-v0.1.md`)
- `examples/` — voorbeeldprojecten (per example een subfolder met `.aiflow` + `README.md`)
- `docs/` — o.a. screenshots voor README & site

De README beschrijft al netjes Quick Start, CLI-run, projectstructuur en roadmap.

---

## 3. AIFLOW Standard v0.1 — Kern

> De volledige spec staat in `spec/aiflow-v0.1.md`. Dit is de samenvatting.

### 3.1 Hoofdobject: `AIFlowProject`

Belangrijkste velden:

- `metadata`
  - `name`, `version`, `description`, `labels`
- `flow`
  - `entry_agent`
  - `variables` (globale input/vars)
  - `agents` (lijst van agent-id’s in de flow)
  - `logic` (routingregels)
- `agents[]`
  - `id`, `name`, `role`
  - `model` (provider, name, temperature, max_tokens)
  - `prompt` (verwijzing naar prompt file)
  - `instructions`
  - `tools`, `memory`
  - `output_format` (`json` of `raw/text`)
- `tools` (v0.2+)
- `memory` (v0.3+)

### 3.2 Flow & Logic

- Flow is een **gerichte graaf**: nodes = agents, edges = logic rules.
- Een `logic` entry bevat o.a. `from`, `to`, `condition`, `description`.
- In v0.1 zijn conditions nog simpel (strings zoals `"always"` of basale expressies).
- In v0.2 komt een echte **expression evaluator** (`output_agent1.ticket_type == 'billing'` etc.).

---

## 4. Wat is er in deze sessie gebouwd?

### 4.1 CLI Runtime (Node / `runAiflow.mts`)

**Doelen:**

- `.aiflow`-file inlezen
- Project structureren + basisvalidatie
- Agents sequentieel uitvoeren met LLM-calls
- Context updaten + transitions volgen
- Trace bijhouden voor debugging

**Belangrijke punten:**

- Leest nu een `.aiflow`-project (`AIFlowProject`) in.
- Initialiseert context met:
  - `flow.variables`
  - (in het voorbeeld) `ticket_text = "My wifi is broken and the router keeps restarting."`
- Roept de eerste agent aan (`agent1` = TriageBot).
- Parse van JSON-achtige output:
  - Strip ```json fences
  - Parse JSON
  - Fallback naar originele tekst als parse faalt
- Slaat modeloutput op in context:
  - `output_agent1`, `output_agent2`, …  
- Evalueert logic-rules en bepaalt de volgende agent.

We hebben ook:

- Een helper `tryParseJson` met Vitest tests.
- Een placeholder `validateFlow.mts` + `evaluateCondition` tests als eerste stap naar een echte validator/condition-engine.

### 4.2 Gemini-integratie (CLI)

- Leest de API-key via `API_KEY` of `GEMINI_API_KEY`.
- Gebruikt Google AI Studio client (`@google/genai`) om content te genereren.
- Foutafhandeling zoals:
  - Geen API key → nette melding
  - Model niet gevonden → duidelijke error

### 4.3 Voorbeeldflow: `CustomerSupportFlow_v1.0.0.aiflow`

We hebben:

- Een tickettekst aan de `flow.variables` toegevoegd (`ticket_text`).
- De flow zo ingericht dat:
  1. **TriageBot** (Classifier) kijkt naar `ticket_text` en geeft:
     ```json
     { "classification": "Network Issue" }
     ```
  2. Logic rule `route_network` stuurt door naar **ResponderBot** als de classification `'Network'` bevat.
  3. **ResponderBot** bouwt een nette e-mailreply gebaseerd op `ticket_text`.

Het CLI-resultaat bevat nu een **rijk final context-object**:

```json
{
  "ticket_text": "My wifi is broken and the router keeps restarting.",
  "output_agent1": { "classification": "Network Issue" },
  "output_agent2": "Subject: Re: Your WiFi Issue ...",
  "__trace": [ ... ]
}
```

### 4.4 Tracing Formaat (`__trace`)

Bij elke stap wordt een object gepusht in `__trace[]`:

- `step` — index (0, 1, 2, …)
- `agentId`, `agentName`, `role`
- `inputContext` — context vóór deze stap
- `rawOutput` — ruwe modeloutput (string)
- `parsedOutput` — JSON of tekst na parsing
- `rulesEvaluated[]` — array van rules met:
  - `id`, `from`, `to`, `condition`, `result`
- `selectedRuleId` — welke rule is “hit”
- `nextAgentId` — volgende agent of `null`

Dit traceformaat is nu de basis voor de Debug UI.

### 4.5 Testing & CI

- **Vitest** is opgezet:
  - `runtime/cli/tests/tryParseJson.test.ts`
  - `runtime/core/tests/evaluateCondition.test.ts`
- **GitHub Actions CI**:
  - Workflow onder `.github/workflows/ci.yml`
  - Draait build + tests op push naar `main`.

---

## 5. AIFLOW Studio — huidige status

### 5.1 Hoofdviews in `App.tsx`

Belangrijke views:

- Dashboard
- Workflow Builder (graph editor)
- Agents
- Memory (mock)
- Prompts
- Tools
- Settings (Global API key)
- Documentation (spec viewer)
- **Debug (CLI Trace)** — nieuw

### 5.2 Workflow Builder

Kenmerken:

- Graph van agents (nodes) + logic (edges).
- Node acties:
  - Agent aanmaken
  - Tool-node aanmaken
  - Node verwijderen
- Link-mode:
  - Klik op node A → klik op node B → er wordt een logic rule `from A → to B` gemaakt (`condition: "always"`).
- Metadata-editing:
  - Projectnaam, versie, etc.
- Prompt editor:
  - Prompts in `project.prompts[filename]` met “Save”/“Delete”.

### 5.3 Executie in de browser (`WorkflowRunner`)

- Runtime in `runtime/browser/WorkflowRunner.ts`:
  - Gebruikt `GoogleGenAI` met een API key (global of env).  
  - Combineert `project.flow.variables` + user inputs in een context object.
  - Bouwt prompts met template-injectie (`{{variable}}`).
  - Schrijft outputs terug naar context (`last_output`, `<agentId>.output`).
  - Ondersteunt JSON-output parsing om automatisch context bij te werken.

- In de UI:
  - Run-modal om inputs in te vullen.
  - ConsolePanel toont logs en status per agent.
  - Agentstatussen: `idle`, `running`, `completed`, `error`.

---

## 6. Debug — CLI Trace Viewer (Studio)

We hebben een volledig nieuwe debugpagina gebouwd:

### 6.1 Concept

- Je draait een flow via de CLI:
  ```bash
  npm run run-flow -- ./examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow

  ```
- Aan het eind kopieer je **alleen** het JSON-object na:
  ```
  🏁 Flow finished. Final context:
  { ... }
  ```
- Dat plak je in de Debug-pagina → klik op **Parse trace**.

### 6.2 Features

- **Context Overview**  
  Bovenin zie je het `Final context`-object, excl. `__trace`.

- **Execution Trace Timeline**  
  Pills met `STEP 0 · TriageBot`, `STEP 1 · ResponderBot`, …

- **Step Details**  
  Voor de geselecteerde stap:
  - Input Context (JSON)
  - Parsed Output (JSON/tekst)
  - Evaluated Rules, met highlight op de gebruikte rule (`selectedRuleId`).

- **Play trace 🎬**  
  - Knop “Play trace” loopt automatisch door `STEP 0 → STEP 1 → …`.
  - Actieve step wordt gehighlight.
  - Je kunt pauzeren, of een step handmatig selecteren (dat pauzeert de autoplay).

- **Open in Workflow Builder**  
  - Een knop rechtsboven (“Open in Workflow Builder”) gebruikt de actieve step (`agentId`) om in de graph die node te selecteren.
  - Hiermee kun je van CLI-trace → visuele node springen.

Dit is de basis voor toekomstige features zoals:

- Node-highlighting in de graph op basis van trace.
- “Live play” van een run binnen de graph zelf.

---

## 7. Website (AIflow-site)

In deze sessie (en eerdere iteraties) is voor de website o.a. gedaan:

- Landing page opgeschoond: heldere hero + tagline.
- CTA’s toegevoegd:
  - Link naar GitHub-repo
  - Link naar docs / spec
  - Export/Download `.aiflow` CTA’s
- Docs-hub / `docs.html` opgezet als centrale plek voor:
  - Spec
  - Studio docs
  - Runtime docs
  - Roadmap
- Branding:
  - Minimalistisch AIflow-logo (SVG).
  - Kleuren en iconen afgestemd op Studio.

(De precieze inhoud van index/docs staat in de AIflow-site repo; dit doc beschrijft alleen de rol.)

---

## 8. Waar staan we nu?

### 8.1 Bereikt

- ✅ AIFLOW Standard v0.1 staat als Markdown-spec.
- ✅ AIflow repo is opgeschoond, met duidelijke README & structuur.
- ✅ CLI-runtime draait een echte voorbeeldflow (`CustomerSupportFlow`).
- ✅ JSON post-processing + contextinjectie werkt.
- ✅ Vitest + eerste tests + CI pipeline actief.
- ✅ Debug Trace Viewer in Studio:
  - Parse van Final context JSON
  - Overzicht van context
  - Per-step detail + rules
  - Play trace functionaliteit
- ✅ Website heeft een nette landing + docs-hub + AIFLOW-branding.

### 8.2 Nog te doen (kort overzicht)

**Runtime / Core**

- Condition engine v0.2:
  - `evaluateCondition` productierijp maken
  - Ondersteuning voor nested keys, `contains()`, `==`, `!=`, `>`, `<`, etc.
- Validator:
  - `validateFlow.mts` uitbreiden met echte checks (missing agents, dangling links, invalid models).
- Tooling:
  - Tools-interface ontwerpen (tools aanroepen vanuit agents).
  - Basis “HTTP tool” en 1–2 example tools.

**Studio**

- Graph:
  - Node highlight op basis van trace (active agent).
  - Visuele aansluiting met Debug “Open in Workflow Builder”.
- Debug:
  - Kleine UX tweaks (filtering, zoekfunctie in context).
  - Mogelijkheid om meerdere traces op te slaan.
- Agents/Prompts:
  - Templates (Classifier, Router, Responder, Tool-Caller).
  - Snelle “Add flow from template”.

**Spec v0.2**

- Uitwerken van:
  - Logic/conditions als formeel onderdeel van de spec.
  - Tools-sectie (types, operations, auth).
  - Memory-sectie (vectorstores, keys).

**Website & Marketing**

- OG-image genereren en instellen voor socials.
- Kleine demo-gif opnemen (workflow die runt met highlight).
- Launch-post (LinkedIn / X) voorbereiden.
- Eventueel: Product Hunt / dev.to / blogpost.

---

## 9. Roadmap

### v0.2 — “Smart Routing & Validation”

- Expression/condition engine.
- Flow-validator + duidelijke CLI-errors.
- Studio UI voor het testen van conditions (testpaneel).
- Verdere uitbouw Debug Trace Viewer (node highlight in graph).

### v0.3 — “Tools & Memory”

- Tools-standaard (HTTP / builtin / Python).
- Tool-execution in runtime.
- Eenvoudige memory-interfaces (bv. notities per ticket).
- Studio UI voor tools configureren.

### v0.4 — “Runtimes”

- Gestandaardiseerde runtime-API.
- Python-runtime proof-of-concept.
- Docker-image met CLI/runtime.

### v1.0 — “Stable Standard”

- Definitieve `.aiflow`-spec.
- Backwards-compat-story.
- Volledige validator + tooling.
- Website met officiële docs, voorbeelden en best practices.

---

## 10. Hoe verder werken met dit project

### 10.1 Dev-workflow (lokaal)

```bash
# Studio & runtime
git clone https://github.com/joetranga-wq/AIflow
cd AIflow
npm install

# Dev server (Studio)
npm run dev   # http://localhost:3000

# Tests
npm test

# CLI-run (met API key)
export API_KEY=YOUR_GEMINI_API_KEY
npm run run-flow -- ./examples/CustomerSupportFlow/CustomerSupportFlow_v1.0.0.aiflow

```

### 10.2 Debug flow

1. CLI-run uitvoeren.
2. JSON na `Final context:` kopiëren.
3. In Studio → Debug (CLI Trace).
4. JSON plakken → **Parse trace**.
5. Play trace / steps inspecteren.
6. Optioneel: “Open in Workflow Builder” → node aanpassen.

---

## 11. Toverwoord voor nieuwe sessies

Als je in een nieuwe chat verder wilt werken aan dit project, start dan met:

```text
AIFLOW-NEXT
```

En voeg eventueel (als extra hulp) één zin toe zoals:

> “Gebruik de AIFLOW.md context (standard + runtime + studio + debug viewer + roadmap).”

Dan kunnen we meteen doorpakken op:

- Verdere runtime-ontwikkeling
- Node highlighting in de graph o.b.v. trace
- Tools/memory design
- Website/docs/marketing

---

_Einde AIFLOW Masterdocument_
