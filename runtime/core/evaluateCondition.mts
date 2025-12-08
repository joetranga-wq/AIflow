export type ConditionContext = {
  context: Record<string, any>;
  output: any;
  agentId?: string | null;
};

/**
 * Haal een (eventueel geneste) waarde op uit een object op basis van een pad.
 * Voorbeeld: getFromObj(obj, ["output_agent1", "ticket_type"])
 */
function getFromObj(obj: any, path: string[]): any {
  let current = obj;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/**
 * Haal een variabele op uit de condition context.
 *
 * - Ondersteunt nested keys via dot-notation, zoals:
 *   - "classification"
 *   - "output_agent1.ticket_type"
 *   - "nested.value"
 *
 * - Zoekt eerst in ctx.output en daarna in ctx.context.
 */
function getValue(name: string, ctx: ConditionContext): any {
  const path = name.split(".");

  // Eerst in de laatste agent-output
  if (ctx.output && typeof ctx.output === "object") {
    const outVal = getFromObj(ctx.output, path);
    if (outVal !== undefined) {
      return outVal;
    }
  }

  // Dan in de globale context
  const ctxVal = getFromObj(ctx.context, path);
  if (ctxVal !== undefined) {
    return ctxVal;
  }

  return undefined;
}

/**
 * Evalueer een eenvoudige condition-string tegen de context.
 *
 * Ondersteunde patronen:
 *  - foo == 'bar'
 *  - foo != "bar"
 *  - contains(foo, 'bar')
 *  - foo > 3
 *  - foo >= 1.5
 *  - foo < 10
 *  - foo <= 2.0
 *
 * Alles wat niet herkend kan worden → false.
 * Lege / undefined expression → true (geen condition = altijd waar).
 */
export function evaluateCondition(
  expression: string | undefined | null,
  ctx: ConditionContext
): boolean {
  if (!expression || typeof expression !== "string") {
    // Geen condition betekent "altijd waar"
    return true;
  }

  const expr = expression.trim();

  // --- contains(foo, 'bar') ---
  if (expr.startsWith("contains(") && expr.endsWith(")")) {
    const inner = expr.slice("contains(".length, -1).trim();
    const parts = inner.split(",");

    if (parts.length === 2) {
      const varName = parts[0].trim();
      const literalRaw = parts[1].trim();

      // Haal quotes weg: 'foo' of "foo"
      const match = literalRaw.match(/^(['"])(.*)\1$/);
      const literal = match ? match[2] : literalRaw;

      const value = getValue(varName, ctx);

      if (typeof value === "string") {
        return value.toLowerCase().includes(literal.toLowerCase());
      }
    }

    return false;
  }

  // --- Numerieke vergelijkingen: foo > 3, foo >= 1.5, foo < 10, foo <= 2 ---
  const numericCmp = expr.match(
    /^([a-zA-Z0-9_.]+)\s*(>=|<=|>|<)\s*([0-9]+(\.[0-9]+)?)$/
  );

  if (numericCmp) {
    const [, varName, op, numberLiteral] = numericCmp;
    const value = getValue(varName, ctx);

    const left = Number(value);
    const right = Number(numberLiteral);

    // Als de linkerkant geen geldig getal is → condition faalt
    if (Number.isNaN(left)) {
      return false;
    }

    switch (op) {
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
    }
  }

  // --- String vergelijkingen: foo == 'bar', foo != "bar" ---
  const simpleCmp = expr.match(
    /^([a-zA-Z0-9_.]+)\s*([=!]=)\s*(['"])(.*)\3$/
  );

  if (simpleCmp) {
    const [, varName, op, , literal] = simpleCmp;
    const value = getValue(varName, ctx);

    const valueStr =
      value === undefined || value === null ? "" : String(value);

    if (op === "==") {
      return valueStr === literal;
    }
    if (op === "!=") {
      return valueStr !== literal;
    }
  }

  // Onbekend formaat → voor nu niet matchen
  return false;
}
