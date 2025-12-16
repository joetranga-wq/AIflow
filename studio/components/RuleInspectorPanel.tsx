import React, { useState, useEffect } from 'react';
import { autoRewriteExpression } from '../runtime/autoRewriteExpression';

interface RuleInspectorPanelProps {
  link: any;
  onClose?: () => void;
  onUpdateCondition?: (newCondition: string) => void;
  onUpdateDecisionOwner?: (owner: 'ai' | 'human') => void;
  onDebugRule?: () => void;
  context?: any; // debugContext or agent context
}

export const RuleInspectorPanel: React.FC<RuleInspectorPanelProps> = ({
  link,
  onClose,
  onUpdateCondition,
  onUpdateDecisionOwner,
  onDebugRule,
  context = {},
}) => {
  const [condition, setCondition] = useState(link?.condition || '');
  const [autoFix, setAutoFix] = useState<any>(null);

  // Flatten context → canonical fields
  const collectPaths = (obj: any, prefix = ''): string[] => {
    if (!obj || typeof obj !== 'object') return [];
    const res: string[] = [];
    for (const k of Object.keys(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      res.push(full);
      res.push(...collectPaths(obj[k], full));
    }
    return res;
  };

  // Build KnownFields for rewrite engine
  const buildKnownFields = (paths: string[]) => {
    const uniq = Array.from(new Set(paths));
    return uniq.map((p) => {
      const isSnake = p.includes('_') && !p.includes('.');
      const canonical = isSnake ? p.replace(/_/g, '.') : p;
      const last = canonical.split('.').pop()!;
      const snake = canonical.replace(/\./g, '_');
      return {
        id: canonical,
        path: canonical,
        label: canonical,
        aliases: [canonical, snake, last, p],
      };
    });
  };

  // AutoFix PREPASS on rule change
  useEffect(() => {
    try {
      const paths = collectPaths(context || {});
      const knownFields = buildKnownFields(paths);
      const rewrite = autoRewriteExpression(condition, knownFields);
      setAutoFix(rewrite);
    } catch (err) {
      console.warn('Inline autofix failed:', err);
      setAutoFix(null);
    }
  }, [condition, context]);

  const applyRewrite = () => {
    if (!autoFix?.rewritten) return;
    setCondition(autoFix.rewritten);
    onUpdateCondition?.(autoFix.rewritten);
  };

  if (!link) return null;

  const trimmed = (condition ?? '').toString().trim();
  const isDecisionPoint = trimmed.length > 0 && trimmed !== 'always';
  const needsOwner = isDecisionPoint && !link?.decisionOwner;

  return (
    <div className="bg-white border-l border-slate-200 w-[360px] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            Rule Inspector
          </div>
          <div className="text-xs font-medium text-slate-700">
            {link.from} → {link.to}
          </div>
        </div>
        {onClose && (
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Rule editor */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-1">
              Condition
            </div>
            {onDebugRule && (
              <button
                type="button"
                onClick={onDebugRule}
                className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
              >
                Debug
              </button>
            )}
          </div>
          <textarea
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value);
              onUpdateCondition?.(e.target.value);
            }}
            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[12px] font-mono text-slate-800 focus:ring-2 focus:ring-indigo-400 outline-none resize-none h-[90px]"
          />

          {/* ✅ Missing owner helper + quick set buttons */}
          {needsOwner && (
            <div className="mt-2 border border-amber-200 bg-amber-50 rounded-xl p-3">
              <div className="text-[11px] text-amber-900">
                This is a decision point. Choose who owns this decision.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateDecisionOwner?.('ai')}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
                >
                  Set owner: AI
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateDecisionOwner?.('human')}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-900 hover:bg-amber-100"
                >
                  Set owner: Human
                </button>
              </div>
            </div>
          )}
        </div>

        {/* INLINE AUTOFIX BLOCK */}
        {autoFix && autoFix.original !== autoFix.rewritten && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">
                Auto-fix available
              </div>

              <button
                onClick={applyRewrite}
                className="text-[11px] font-medium bg-emerald-600 text-white px-2.5 py-1 rounded-full hover:bg-emerald-700"
              >
                Apply auto-fix
              </button>
            </div>

            {/* Original / Rewritten */}
            <div className="grid grid-cols-1 gap-2 text-[11px] font-mono">
              <div>
                <div className="text-[10px] uppercase text-slate-500">
                  Original
                </div>
                <div className="bg-white border border-slate-200 rounded-lg px-2 py-1 line-through decoration-rose-500 break-all">
                  {autoFix.original}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">
                  Rewritten
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg px-2 py-1 break-all">
                  {autoFix.rewritten}
                </div>
              </div>
            </div>

            {/* Change list */}
            {autoFix.changes.length > 0 && (
              <div className="text-[10px] mt-1 text-slate-600">
                {autoFix.changes.map((c: any, i: number) => (
                  <div key={i}>
                    {c.from} → {c.to} ({Math.round(c.score * 100)}%)
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
