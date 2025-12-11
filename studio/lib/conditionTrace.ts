// studio/lib/conditionTrace.ts

export type ConditionResult = "true" | "false" | "error";

export type TraceNodeType =
  | "AND"
  | "OR"
  | "NOT"
  | "COMPARE"
  | "CALL"
  | "LITERAL"
  | "FIELD";

export interface TraceError {
  message: string;
  code?: string;
}

export interface TraceNode {
  id: string;
  type: TraceNodeType;
  /**
   * Operator voor deze node, indien van toepassing:
   * "&&", "||", "==", ">=", "in", "!" etc.
   */
  operator?: string;
  /**
   * Eindresultaat van deze subexpressie.
   * Voor booleans meestal true/false, maar kan ook number/string zijn.
   */
  value?: unknown;
  /**
   * Het ruwe stukje expressie, handig voor UI:
   * bv. "customer.age >= 18"
   */
  raw?: string;
  children?: TraceNode[];
  error?: TraceError;
  /**
   * true als deze node niet geëvalueerd werd door short-circuiting.
   */
  shortCircuited?: boolean;
}

export interface ReferencedField {
  /** bv. "customer.age" of "nodes.fetchProfile.result.segment" */
  path: string;
  value: unknown;
  /** optioneel koppelen aan workflow-node */
  sourceNodeId?: string;
}

export interface ConditionTrace {
  conditionId: string;
  runId?: string;
  /** De originele rule-expression zoals de user ‘m heeft ingevoerd. */
  expression: string;
  result: ConditionResult;
  root: TraceNode;
  referencedFields: ReferencedField[];

  /**
   * Optioneel: door backend ingevulde "expression with values"
   * bv. `(21 >= 18 && "DE" in ["NL","BE"]) || false`
   * Als je dit niet hebt, kunnen we nog steeds de tree tonen.
   */
  expressionWithValues?: string;

  /**
   * Optioneel: human-readable reason uit de engine.
   * De UI kan zelf ook iets genereren, maar dit is handig als de engine
   * al een goede uitleg maakt.
   */
  reasonText?: string;
}
