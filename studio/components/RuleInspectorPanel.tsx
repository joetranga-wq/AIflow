import React from 'react';
import { X } from 'lucide-react';

interface RuleInspectorPanelProps {
  link: any;
  fromAgent?: { id: string; name: string } | null;
  toAgent?: { id: string; name: string } | null;
  onClose?: () => void;
  onDebugRule?: () => void;
}

export const RuleInspectorPanel: React.FC<RuleInspectorPanelProps> = ({
  link,
  fromAgent,
  toAgent,
  onClose,
  onDebugRule,
}) => {
  if (!link) return null;

  const condition = link.condition || link.label || '(no condition)';
  const mapping = link.mapping ?? link.map ?? null;

  const renderMapping = () => {
    if (!mapping) return null;

    let pretty: string;
    if (typeof mapping === 'string') {
      pretty = mapping;
    } else {
      try {
        pretty = JSON.stringify(mapping, null, 2);
      } catch {
        pretty = String(mapping);
      }
    }

    return (
      <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-700 overflow-auto max-h-40">
        {pretty}
      </pre>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Rule Inspector
          </span>
          <span className="text-xs text-slate-500">
            Edge conditions for this connection
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onDebugRule && (
            <button
              onClick={onDebugRule}
              className="px-2 py-1 rounded-full text-[11px] font-medium bg-slate-900 text-slate-50 hover:bg-slate-800 transition-colors"
            >
              Debug rule
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close inspector"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 text-xs text-slate-700 overflow-auto">
        {/* From → To */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              From
            </span>
            <span className="text-[13px] font-medium text-slate-800">
              {fromAgent?.name ?? link.from ?? 'Unknown'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">→</div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
              To
            </span>
            <span className="text-[13px] font-medium text-slate-800">
              {toAgent?.name ?? link.to ?? 'Unknown'}
            </span>
          </div>
        </div>

        <div className="h-px bg-slate-100 my-1" />

        {/* Condition */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
            Rule expression
          </div>
          <div className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 overflow-x-auto">
            {condition}
          </div>
        </div>

        {/* Description (optioneel) */}
        {link.description && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
              Description
            </div>
            <p className="text-[11px] text-slate-700">{link.description}</p>
          </div>
        )}

        {/* Mapping */}
        {mapping && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mb-1">
              Input mapping
            </div>
            {renderMapping()}
          </div>
        )}

        {/* Meta */}
        <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between">
          <span>ID: {link.id ?? '–'}</span>
          <span>Condition debugger preview</span>
        </div>
      </div>
    </div>
  );
};
