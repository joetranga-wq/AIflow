import React from 'react';
import { X } from 'lucide-react';
import {
  autoRewriteExpression,
  type KnownField,
} from '../runtime/autoRewriteExpression';

interface ConditionDebuggerPanelProps {
  trace: any;
  onClose?: () => void;
  onApplyRewrite?: (rewrittenExpression: string) => void;
  onSetDecisionOwner?: (owner: 'ai' | 'human') => void;
  hideAutoFix?: boolean; // 👈 NIEUW: verberg AutoFix blok (bij open Rule Inspector)
}


// 🔧 Canonical field helpers (C-fix)
//
// 1) Flatten debugContext → ["ticket.type", "ticket.priority", ...]
// 2) Canonicaliseer snake_case → dot.notation
//    - "ticket_type" → "ticket.type"
//    - "ticket_priority" → "ticket.priority"
// 3) Bouw KnownField[] waar .path altijd canonical is
const collectFieldPaths = (obj: any, prefix = ''): string[] => {
  if (obj == null || typeof obj !== 'object') return [];
  const paths: string[] = [];

  for (const key of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    paths.push(full);
    paths.push(...collectFieldPaths(obj[key], full));
  }

  return paths;
};

const buildKnownFieldsFromPaths = (paths: string[]): KnownField[] => {
  const unique = Array.from(new Set(paths));

  return unique.map((originalPath) => {
    // Canonical: als er underscores zijn maar geen dots, interpreteren we dat als dot-notation
    // "ticket_type" → "ticket.type"
    const isSnakeOnly =
      originalPath.includes('_') && !originalPath.includes('.');
    const canonicalPath = isSnakeOnly
      ? originalPath.replace(/_/g, '.')
      : originalPath;

    const last = canonicalPath.split('.').pop() || canonicalPath;
    const underscoreVariant = canonicalPath.replace(/\./g, '_');

    const aliases = Array.from(
      new Set(
        [
          canonicalPath,
          originalPath, // raw uit context
          underscoreVariant,
          last,
        ].filter(Boolean),
      ),
    );

    return {
      id: canonicalPath,
      path: canonicalPath,
      label: canonicalPath,
      aliases,
    };
  });
};

// Tiny helper: probeer onbekend veld te mappen naar bestaande path
const findFieldSuggestion = (
  unknownPath: string,
  availablePaths: string[],
): string | null => {
  // snake_case → dots
  if (unknownPath.includes('_') && !unknownPath.includes('.')) {
    const dotVariant = unknownPath.replace(/_/g, '.');
    const match = availablePaths.find((p) => p === dotVariant);
    if (match) return match;
  }
  return null;
};

export const ConditionDebuggerPanel: React.FC<
  ConditionDebuggerPanelProps
> = ({ trace, onClose, onApplyRewrite, onSetDecisionOwner, hideAutoFix }) => {

  if (!trace) return null;

  const isMissingOwner = !!(trace?.missingOwner || trace?.edgeStatus === 'missing_owner');

  const expression = trace.expression as string;
  const expressionWithValues = trace.expressionWithValues as string;
  const result = trace.result;
  const root = trace.root;
  const referencedFields: { path: string; value: any }[] =
    trace.referencedFields ?? [];

  // 🔍 Canonical veldinformatie uit debugContext
  const debugContext = trace.debugContext ?? null;
  const availablePaths = debugContext ? collectFieldPaths(debugContext) : [];
  const knownFields = availablePaths.length
    ? buildKnownFieldsFromPaths(availablePaths)
    : [];

  // 🧠 AutoRewrite C-fix: gebruik canonical fields + aliases
  const autoRewrite =
    expression && knownFields.length
      ? autoRewriteExpression(expression, knownFields)
      : null;

  const unknownFields = referencedFields.filter(
    (f) => typeof f.value === 'undefined',
  );

  const unknownWithSuggestions = unknownFields.map((f) => {
    const suggestion = availablePaths.length
      ? findFieldSuggestion(f.path, availablePaths)
      : null;
    return { ...f, suggestion };
  });

  const statusLabel =
    result === true ? 'TRUE' : result === false ? 'FALSE' : 'ERROR';

  const statusColorClasses =
    result === true
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : result === false
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  const statusDotClasses =
    result === true
      ? 'bg-emerald-500'
      : result === false
      ? 'bg-rose-500'
      : 'bg-amber-500';

  const statusText =
    result === true
      ? 'Why is this rule TRUE?'
      : result === false
      ? 'Why is this rule FALSE?'
      : 'Why is this rule ERROR?';

  const explanationText =
    result === true
      ? 'De rule is TRUE op basis van de huidige data.'
      : result === false
      ? 'De rule is FALSE op basis van de huidige data.'
      : 'De rule kon niet correct geëvalueerd worden (bijvoorbeeld door een onbekend veld of typefout).';

  const renderNode = (node: any): React.ReactNode => {
    if (!node) return <></>;

    const isError = node.type === 'ERROR';
    const isShortCircuited = node.shortCircuited;

    const label =
      node.type === 'BINARY'
        ? node.operator
        : node.type === 'UNARY'
        ? node.operator
        : node.type === 'FIELD'
        ? node.raw
        : node.type === 'ARRAY'
        ? 'ARRAY'
        : node.type;

    const valueLabel =
      typeof node.value === 'boolean'
        ? node.value
          ? 'TRUE'
          : 'FALSE'
        : node.value === null
        ? 'null'
        : typeof node.value === 'undefined'
        ? 'undefined'
        : JSON.stringify(node.value);

    const badgeColor =
      typeof node.value === 'boolean'
        ? node.value
          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
          : 'bg-rose-100 text-rose-700 border-rose-200'
        : isError
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

    const typeLabel =
      node.type === 'BINARY'
        ? 'BINARY'
        : node.type === 'UNARY'
        ? 'UNARY'
        : node.type === 'FIELD'
        ? 'FIELD'
        : node.type === 'ARRAY'
        ? 'ARRAY'
        : node.type === 'LITERAL'
        ? 'LITERAL'
        : node.type;

    return (
      <div className="border border-slate-200 rounded-xl p-3 mb-2 bg-white">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.12em] bg-slate-50 text-slate-500 border border-slate-200">
              {typeLabel}
            </span>
            {node.operator && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-slate-50">
                {node.operator}
              </span>
            )}
            {isShortCircuited && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200">
                Short-circuited
              </span>
            )}
            {isError && node.error && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200">
                {node.error}
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
          >
            {valueLabel}
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 mb-2">
          {node.raw}
        </div>
        {Array.isArray(node.children) && node.children.length > 0 && (
          <div className="mt-2 pl-3 border-l border-slate-200 space-y-2">
            {node.children.map((child: any) => (
              <div key={child.id}>{renderNode(child)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Condition Debugger
          </span>
          <span className="text-xs text-slate-500">{statusText}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${statusColorClasses}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotClasses}`} />
            {statusLabel}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-slate-700">
        {isMissingOwner && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
            <div className="text-[11px] text-amber-900">
              This is a decision point. Choose who owns this decision.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSetDecisionOwner?.('ai')}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
              >
                Set owner: AI
              </button>
              <button
                type="button"
                onClick={() => onSetDecisionOwner?.('human')}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
              >
                Set owner: Human
              </button>
            </div>
          </div>
        )}
        {/* Rule expression */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
            Rule expression
          </div>
          <div className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 overflow-x-auto">
            {expression}
          </div>
        </div>

              {/* 🔧 Auto-fix suggestion (C-fix) */}
              {!hideAutoFix && autoRewrite && autoRewrite.rewritten !== autoRewrite.original && (
                <div className="mt-2 border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-700">
                      Auto-fix suggestion
                    </div>
                    {onApplyRewrite && (
                      <button
                        type="button"
                        onClick={() => onApplyRewrite(autoRewrite.rewritten)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Apply auto-fix
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 mb-0.5">
                        Original
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-2 py-1 overflow-x-auto line-through decoration-rose-500">
                        {autoRewrite.original}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 mb-0.5">
                        Rewritten
                      </div>
                      <div className="bg-white border border-emerald-200 rounded-lg px-2 py-1 overflow-x-auto">
                        {autoRewrite.rewritten}
                      </div>
                    </div>
                  </div>

                  {autoRewrite.changes.length > 0 && (
                    <div className="text-[10px] text-slate-600">
                      {autoRewrite.changes.map((c, idx) => (
                        <div key={idx}>
                          <span className="font-mono">{c.from}</span> →{' '}
                          <span className="font-mono">{c.to}</span>{' '}
                          <span className="opacity-70">
                            ({Math.round(c.score * 100)}% match)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}


        {/* Expression with values */}
        {expressionWithValues && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
              With values
            </div>
            <div className="text-[11px] font-mono bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 text-slate-800 overflow-x-auto">
              {expressionWithValues}
            </div>
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
            Why is this rule {statusLabel}?
          </div>
          <p className="text-[11px] text-slate-700">{explanationText}</p>
        </div>

        {/* Explain tree */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
            Explain tree
          </div>
          {renderNode(root)}
        </div>

        {/* Data used in this rule */}
        {!!referencedFields.length && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
              Data used in this rule
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium border-b border-slate-200">
                      Field
                    </th>
                    <th className="text-left px-3 py-1.5 font-medium border-b border-slate-200">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referencedFields.map((f, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="px-3 py-1.5 font-mono text-slate-700">
                        {f.path}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {typeof f.value === 'undefined'
                          ? 'undefined'
                          : JSON.stringify(f.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Potential field issues / suggestions */}
        {!!unknownWithSuggestions.length && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-amber-600 mb-1">
              Potential field issues
            </div>
            <div className="space-y-1.5">
              {unknownWithSuggestions.map((f, idx) => (
                <div
                  key={idx}
                  className="text-[11px] bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 text-amber-800"
                >
                  <div>
                    Unknown field{' '}
                    <span className="font-mono font-semibold">
                      {f.path}
                    </span>{' '}
                    (value is <span className="font-mono">undefined</span>).
                  </div>
                  {f.suggestion ? (
                    <div className="mt-0.5">
                      Maybe you meant{' '}
                      <span className="font-mono font-semibold">
                        {f.suggestion}
                      </span>
                      ?
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      This field is not present in the available data for this
                      rule.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
