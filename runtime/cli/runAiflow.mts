#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { AIFlowProject, Agent } from "../../core/types";

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
    console.error("Usage: node runtime/cli/runAiflow.mts <path-to-file.aiflow>");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  const raw = readFileSync(filePath, "utf-8");
  const project = JSON.parse(raw) as AIFlowProject;

  console.log(
    `▶ Running AIFLOW project: ${project.metadata.name} v${project.metadata.version}`
  );

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Eenvoudige context (je kunt dit later uitbreiden)
  const context: Record<string, any> = {
    ...(project.flow.variables || {}),
  };

  let currentAgentId: string | null = project.flow.entry_agent;
  let steps = 0;
  const MAX_STEPS = 10;

  while (currentAgentId && steps < MAX_STEPS) {
    const agent: Agent | undefined = project.agents.find(
      (a) => a.id === currentAgentId
    );

    if (!agent) {
      console.error(`❌ Agent '${currentAgentId}' not found`);
      break;
    }

    console.log(`\n=== Agent: ${agent.name} (${agent.role}) ===`);

    const promptTemplate =
      project.prompts[agent.prompt] ||
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

    // Hier slaan we nu ECHTE JSON op in de context (of tekst als parse faalt)
    context[`output_${agent.id}`] = parsed;

    // Simpele logic: pak eerste rule waar from == currentAgentId
    const rules = project.flow.logic.filter(
      (rule) => rule.from === currentAgentId
    );
    const nextRule = rules[0];

    if (!nextRule) {
      console.log("\n✅ No further transitions, stopping.");
      currentAgentId = null;
      break;
    }

    console.log(
      `\n→ Transition: ${currentAgentId} -> ${nextRule.to} (rule: ${nextRule.id})`
    );
    currentAgentId = nextRule.to;
    steps++;
  }

  console.log("\n🏁 Flow finished. Final context:");
  console.log(JSON.stringify(context, null, 2));
}

// ... alle imports + functies + run() definitie ...

// Alleen de CLI daadwerkelijk starten als we NIET onder Vitest draaien
if (!process.env.VITEST) {
  run().catch((err) => {
    console.error("Unexpected error while running flow:", err);
    process.exit(1);
  });
}

