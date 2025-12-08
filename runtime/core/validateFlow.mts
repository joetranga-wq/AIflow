export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateFlow(project: any): ValidationResult {
  const errors: string[] = [];

  if (!project || typeof project !== "object") {
    errors.push("Project is empty or not a JSON object.");
    return { ok: false, errors };
  }

  const flow = project.flow;
  const agents = project.agents;

  // Basisstructuur
  if (!flow) {
    errors.push("Missing 'flow' section in .aiflow file.");
  }

  if (!agents || typeof agents !== "object" || Object.keys(agents).length === 0) {
    errors.push("Missing or empty 'agents' section in .aiflow file.");
  }

  // Als flow of agents ontbreken, kunnen we niet verder checken
  if (!flow || !agents) {
    return { ok: errors.length === 0, errors };
  }

  const agentNames = new Set(Object.keys(agents));

  // 1. flow.start moet naar bestaande agent verwijzen
  if (!flow.start || typeof flow.start !== "string") {
    errors.push("flow.start must be a string referencing an existing agent.");
  } else if (!agentNames.has(flow.start)) {
    errors.push(`flow.start references unknown agent '${flow.start}'.`);
  }

  // 2. flow.logic[].from/to moeten bestaan
  const logic = Array.isArray(flow.logic) ? flow.logic : [];
  logic.forEach((rule: any, index: number) => {
    const prefix = `flow.logic[${index}]`;

    if (!rule.from || typeof rule.from !== "string") {
      errors.push(`${prefix}.from must be a string agent name.`);
    } else if (!agentNames.has(rule.from)) {
      errors.push(`${prefix}.from references unknown agent '${rule.from}'.`);
    }

    if (!rule.to || typeof rule.to !== "string") {
      errors.push(`${prefix}.to must be a string agent name.`);
    } else if (!agentNames.has(rule.to)) {
      errors.push(`${prefix}.to references unknown agent '${rule.to}'.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}
