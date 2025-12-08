#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { validateFlow } from "../core/validateFlow.mts";
import { evaluateCondition } from "../core/evaluateCondition.mts";

// Kleine helper om ```json ... ``` naar echte JSON te parsen
export function tryParseJson(text: string): any {
  if (!text) return text;

  // Strip code fences ```json ... ```
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return text; // geen geldige JSON → gewoon de originele tekst bewaren
  }
}

// Haal API-key uit env (CLI-omgeving)
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error(
    "❌ No API key set. Please set API_KEY or GEMINI_API_KEY in your environment."
  );
  process.exit(1);
}

async function run() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage: node runtime/cli/runAiflow.mts <path-to-file.aiflow>"
    );
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  const raw = readFileSync(filePath, "utf-8");
  const project: any = JSON.parse(raw);

  // ✅ Valideer het ingeladen .aiflow-project voordat we iets uitvoeren
  const validation = validateFlow(project);
  if (!validation.ok) {
    console.error("Invalid AIFLOW file:");
    for (const err of validation.errors) {
      console.error(" ›", err);
    }
    process.exit(1);
  }

  console.log(
    `▶ Running AIFLOW project: ${project.metadata?.name} v${project.metadata?.version}`
  );

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Globale context (flow.variables + latere outputs)
  const context: Record<string, any> = {
    ...(project.flow?.variables || {}),
  };

  // Trace-structuur om alle stappen vast te leggen
  const trace: any[] = [];

  // ✅ Bepaal start-agent: eerst flow.start, dan flow.entry_agent als fallback
  let currentAgentId: string | null =
    (project.flow && project.flow.start) ||
    (project.flow && project.flow.entry_agent) ||
    null;

  const agents: Record<string, any> = project.agents || {};
  const logicRules: any[] = Array.isArray(project.flow?.logic)
    ? project.flow.logic
    : [];

  let steps = 0;
  const MAX_STEPS = 10;

  while (currentAgentId && steps < MAX_STEPS) {
    const agent = agents[currentAgentId];

    if (!agent) {
      console.error(`❌ Agent '${currentAgentId}' not found`);
      break;
    }

    console.log(
      `\n=== Agent: ${agent.name ?? currentAgentId} (${agent.role}) ===`
    );

    const prompts = project.prompts || {};
    const promptTemplate =
      prompts[agent.prompt] ||
      `You are an AI agent acting as ${agent.role}. Use the context to decide what to do.`;

    const filledPrompt = promptTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      context[key] !== undefined ? String(context[key]) : `{{${key}}}`
    );

    const ctxString = JSON.stringify(context, null, 2);

    const fullPrompt = `
${filledPrompt}

[Current Context]:
${ctxString}

Respond in ${agent.output_format || "text"}.
`.trim();

    // Voor nu forceren we gewoon een geldig Gemini-model
    const modelName = "gemini-2.5-flash";

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
    });

    const rawOutput = (response as any).text ?? "";
    const parsed = tryParseJson(rawOutput);

    console.log("\nRaw Output:\n" + rawOutput);
    console.log("\nParsed Output:", parsed);

    // Sla output op in de context onder deze agent-id
    context[`output_${currentAgentId}`] = parsed;

    // ✅ Expression-based routing: kies de eerste rule waarvan de condition waar is
    const rulesForAgent = logicRules.filter(
      (rule) => rule.from === currentAgentId
    );

    const ruleResults: {
      id: string | null;
      from: string | null;
      to: string | null;
      condition: string | null;
      result: boolean;
    }[] = [];

    let nextRule: any | null = null;

    for (const rule of rulesForAgent) {
      const result = evaluateCondition(rule.condition, {
        context,
        output: parsed,
        agentId: currentAgentId,
      });

      ruleResults.push({
        id: rule.id ?? null,
        from: rule.from ?? null,
        to: rule.to ?? null,
        condition: rule.condition ?? null,
        result,
      });

      if (!nextRule && result) {
        nextRule = rule;
      }
    }

    // ✅ Trace entry maken voor deze stap
    trace.push({
      step: steps,
      agentId: currentAgentId,
      agentName: agent.name ?? currentAgentId,
      role: agent.role,
      inputContext: { ...context },
      rawOutput,
      parsedOutput: parsed,
      rulesEvaluated: ruleResults,
      selectedRuleId: nextRule?.id ?? null,
      nextAgentId: nextRule?.to ?? null,
    });

    if (!nextRule) {
      console.log("\n✅ No further transitions, stopping.");
      currentAgentId = null;
      break;
    }

    console.log(
      `\n→ Transition: ${currentAgentId} -> ${nextRule.to} (rule: ${
        nextRule.id ?? "unnamed"
      })`
    );
    currentAgentId = nextRule.to;
    steps++;
  }

  // ✅ Trace aan de context toevoegen voor debugging / Studio
  context.__trace = trace;

  console.log("\n🏁 Flow finished. Final context:");
  console.log(JSON.stringify(context, null, 2));
}

// Alleen de CLI daadwerkelijk starten als we NIET onder Vitest draaien
if (!process.env.VITEST) {
  run().catch((err) => {
    console.error("Unexpected error while running flow:", err);
    process.exit(1);
  });
}
