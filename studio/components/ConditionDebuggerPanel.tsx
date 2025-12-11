// studio/components/ConditionDebuggerPanel.tsx
import React from "react";

// Self-contained types voor Condition Debugger

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
  operator?: string;
  value?: unknown;
  raw?: string;
  children?: TraceNode[];
  error?: TraceError;
  shortCircuited?: boolean;
}

export interface ReferencedField {
  path: string;
  value: unknown;
  sourceNodeId?: string;
}

export interface ConditionTrace {
  conditionId: string;
  runId?: string;
  expression: string;
  result: ConditionResult;
  root: TraceNode;
  referencedFields: ReferencedField[];
  expressionWithValues?: string;
  reasonText?: string;
}

// Helper functies

function isTruthy(value: unknown): boolean {
  return value === true;
}

function nodeResultLabel(node: TraceNode): string {
  if (node.shortCircuited) return "Not evaluated (short-circuited)";
  if (node.error) return "Error";
  if (typeof node.value === "boolean") {
    return node.value ? "TRUE" : "FALSE";
  }
  if (node.value === undefined) return "Unknown";
  try {
    return JSON.stringify(node.value);
  } catch {
    return String(node.value);
  }
}

function generateFallbackReason(trace: ConditionTrace): string {
  if (trace.result === "error") {
    return "De rule heeft een error veroorzaakt tijdens evaluatie.";
  }

  const trueLeafs: TraceNode[] = [];
  const falseLeafs: TraceNode[] = [];
  const errored: TraceNode[] = [];

  function visit(node: TraceNode) {
    if (node.error) {
      errored.push(node);
      return;
    }
    if (!node.children || node.children.length === 0) {
      if (node.value === true) trueLeafs.push(node);
      else if (node.value === false) falseLeafs.push(node);
      return;
    }
    node.children.forEach(visit);
  }

  visit(trace.root);

  if (trace.result === "true") {
    const firstTrue = trueLeafs[0];
    if (firstTrue?.raw) {
      return `De rule is TRUE omdat '${firstTrue.raw}' waar is in deze context.`;
    }
    return "De rule is TRUE op basis van de huidige data.";
  } else {
    const firstFalse = falseLeafs[0];
    if (firstFalse?.raw) {
      return `De rule is FALSE omdat '${firstFalse.raw}' niet waar is in deze context.`;
    }
    return "De rule is FALSE op basis van de huidige data.";
  }
}

type ConditionDebuggerPanelProps = {
  trace: ConditionTrace | null;
  onClose?: () => void;
};

export const ConditionDebuggerPanel: React.FC<ConditionDebuggerPanelProps> = ({
  trace,
  onClose,
}) => {
  if (!trace) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500">
        Geen rule geselecteerd.
      </div>
    );
  }

  const badgeColor =
    trace.result === "true"
      ? "bg-green-100 text-green-800 border-green-300"
      : trace.result === "false"
      ? "bg-red-100 text-red-800 border-red-300"
      : "bg-yellow-100 text-yellow-800 border-yellow-300";

  const badgeLabel =
    trace.result === "true"
      ? "TRUE"
      : trace.result === "false"
      ? "FALSE"
      : "ERROR";

  const reason = trace.reasonText ?? generateFallbackReason(trace);

  return (
    <div className="flex flex-col h-full border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex flex-col">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Condition Debugger
          </div>
          <div className="text-sm font-medium text-gray-900">
            Why is this rule {badgeLabel}?
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}
          >
            {badgeLabel}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              aria-label="Close condition debugger"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* Expression */}
        <section className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">
            Rule expression
          </div>
          <pre className="whitespace-pre-wrap text-xs font-mono bg-gray-50 border border-gray-200 rounded-md px-2 py-2 text-gray-800">
            {trace.expression}
          </pre>

          {trace.expressionWithValues && (
            <>
              <div className="text-xs font-semibold text-gray-500">
                With values
              </div>
              <pre className="whitespace-pre-wrap text-xs font-mono bg-indigo-50 border border-indigo-100 rounded-md px-2 py-2 text-gray-900">
                {trace.expressionWithValues}
              </pre>
            </>
          )}
        </section>

        {/* Why? */}
        <section className="space-y-1">
          <div className="text-xs font-semibold text-gray-500">
            Why is this rule {badgeLabel}?
          </div>
          <p className="text-xs text-gray-800 leading-relaxed">{reason}</p>
        </section>

        {/* Explain tree */}
        <section className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">
            Explain tree
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs">
            <TraceTree node={trace.root} depth={0} />
          </div>
        </section>

        {/* Data sources */}
        {trace.referencedFields.length > 0 && (
          <section className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">
              Data used in this rule
            </div>
            <div className="rounded-md border border-gray-200 bg-white max-h-40 overflow-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-2 py-1 font-medium">
                      Field
                    </th>
                    <th className="text-left px-2 py-1 font-medium">
                      Value
                    </th>
                    <th className="text-left px-2 py-1 font-medium">
                      Source node
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trace.referencedFields.map((f) => (
                    <tr key={f.path} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-mono text-[11px] text-gray-700">
                        {f.path}
                      </td>
                      <td className="px-2 py-1 text-gray-900">
                        <ValuePreview value={f.value} />
                      </td>
                      <td className="px-2 py-1 text-gray-500">
                        {f.sourceNodeId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

// ========== Subcomponents ==========

type TraceTreeProps = {
  node: TraceNode;
  depth: number;
};

const TraceTree: React.FC<TraceTreeProps> = ({ node, depth }) => {
  const hasChildren = !!node.children && node.children.length > 0;
  const isBool =
    typeof node.value === "boolean" ||
    node.value === true ||
    node.value === false;

  const pillBase =
    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border";

  const pillClass = node.error
    ? `${pillBase} bg-yellow-100 text-yellow-800 border-yellow-300`
    : isBool
    ? isTruthy(node.value)
      ? `${pillBase} bg-green-100 text-green-800 border-green-300`
      : `${pillBase} bg-red-100 text-red-800 border-red-300`
    : `${pillBase} bg-gray-100 text-gray-700 border-gray-300`;

  const label = nodeResultLabel(node);

  return (
    <div>
      <div className="flex items-start gap-2">
        {/* Indent */}
        <div
          style={{ width: depth * 12 }}
          className="flex-shrink-0"
          aria-hidden
        />
        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={pillClass}>{label}</span>
            {node.operator && (
              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                {node.type} ({node.operator})
              </span>
            )}
            {!node.operator && (
              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                {node.type}
              </span>
            )}
            {node.shortCircuited && (
              <span className="text-[10px] text-gray-400">
                · short-circuited
              </span>
            )}
          </div>
          {node.raw && (
            <div className="mt-0.5 text-[11px] font-mono text-gray-800">
              {node.raw}
            </div>
          )}
          {node.error && (
            <div className="mt-0.5 text-[11px] text-yellow-800">
              {node.error.message}
            </div>
          )}
        </div>
      </div>
      {hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children!.map((child) => (
            <TraceTree key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const ValuePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null) return <span className="text-gray-500">null</span>;
  if (value === undefined)
    return <span className="text-gray-400">undefined</span>;
  if (typeof value === "string") {
    if (value.length > 40) {
      return (
        <span className="font-mono text-[11px] text-gray-800">
          "{value.slice(0, 37)}..."
        </span>
      );
    }
    return (
      <span className="font-mono text-[11px] text-gray-800">"{value}"</span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <span className="font-mono text-[11px] text-gray-800">
        {String(value)}
      </span>
    );
  }
  try {
    const json = JSON.stringify(value);
    if (json.length > 40) {
      return (
        <span className="font-mono text-[11px] text-gray-800">
          {json.slice(0, 37)}...
        </span>
      );
    }
    return (
      <span className="font-mono text-[11px] text-gray-800">{json}</span>
    );
  } catch {
    return (
      <span className="font-mono text-[11px] text-gray-800">
        {String(value)}
      </span>
    );
  }
};
