import React, { useState, useEffect } from 'react';
import {
  Bug,
  AlertTriangle,
  ListTree,
  ChevronRight,
  Play,
  Square,
  Search,
  Code,
  X,
} from 'lucide-react';
import { evaluateExpression } from '../../runtime/core/conditionEngineV2';

type TraceRule = {
  id: string;
  from: string;
  to: string;
  condition: string;
  result: boolean;
};

type TraceStep = {
  step: number;
  agentId: string;
  agentName: string;
  role: string;
  inputContext: Record<string, unknown>;
  rawOutput: string;
  parsedOutput: unknown;
  rulesEvaluated?: TraceRule[];
  selectedRuleId?: string | null;
  nextAgentId?: string | null;
};

type TracePayload = {
  __trace?: TraceStep[];
  [key: string]: unknown;
};

type DiffObject = Record<string, unknown>;

const computeContextDiff = (
  prev: Record<string, unknown>,
  curr: Record<string, unknown>
): DiffObject => {
  const diff: DiffObject = {};
  const prevKeys = new Set(Object.keys(prev));
  const currKeys = new Set(Object.keys(curr));

  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      diff[key] = { __change: 'added', value: curr[key] };
    } else {
      const prevVal = prev[key];
      const currVal = curr[key];
      if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
        diff[key] = { __change: 'changed', before: prevVal, after: currVal };
      }
    }
  }

  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      diff[key] = { __change: 'removed', before: prev[key] };
    }
  }

  return diff;
};

interface DebugTraceViewProps {
  onJumpToAgent?: (agentId: string) => void;

  // C.3.2: highlight nodes + edges without view switch (App decides)
  onHighlightPath?: (nodes: string[], edges: { from: string; to: string }[]) => void;

  // Optional: used by "Highlight full path in Workflow" button to ALSO open workflow
  onHighlightPathAndOpen?: (nodes: string[], edges: { from: string; to: string }[]) => void;

  // C.3.1 fallback: focus active agent while staying in Debug view
  onFocusAgent?: (agentId: string) => void;
}

const DebugTraceView: React.FC<DebugTraceViewProps> = ({
  onJumpToAgent,
  onHighlightPath,
  onHighlightPathAndOpen,
  onFocusAgent,
}) => {
  const [rawJson, setRawJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed] = useState(1200); // ms per stap

  // Filters
  const [agentFilter, setAgentFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showRoutingOnly, setShowRoutingOnly] = useState(false);

  const [diffModeByStep, setDiffModeByStep] = useState<Record<number, boolean>>({});

  // Condition Debugger state
  const [isConditionPanelOpen, setIsConditionPanelOpen] = useState(false);
  const [conditionExpression, setConditionExpression] = useState('');
  const [conditionContextJson, setConditionContextJson] = useState('');
  const [conditionResult, setConditionResult] = useState<boolean | null>(null);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [conditionSourceStep, setConditionSourceStep] = useState<number | null>(null);

  const handleParse = () => {
    try {
      const trimmed = rawJson.trim();

      if (!trimmed) {
        setError('Plak eerst de JSON van de CLI-output.');
        setTrace([]);
        setContext(null);
        setSelectedStepIndex(null);
        setIsPlaying(false);
        return;
      }

      const parsed = JSON.parse(trimmed) as TracePayload;
      const steps = Array.isArray(parsed.__trace) ? parsed.__trace : [];

      if (!steps.length) {
        setError(
          'Geen "__trace" array gevonden in de JSON. Zorg dat je de volledige "Final context" plakt.'
        );
        setTrace([]);
        setContext(parsed as Record<string, unknown>);
        setSelectedStepIndex(null);
        setIsPlaying(false);
        return;
      }

      setError(null);
      setTrace(steps);
      setContext(parsed as Record<string, unknown>);
      setSelectedStepIndex(0);
      setIsPlaying(false);
    } catch (e) {
      setError(
        'Kon JSON niet parsen. Controleer of je exact de JSON van "Final context" hebt geplakt.'
      );
      setTrace([]);
      setContext(null);
      setSelectedStepIndex(null);
      setIsPlaying(false);
    }
  };

  const renderJson = (value: unknown) => JSON.stringify(value, null, 2);

  const emitHighlightForStep = (step: TraceStep | undefined | null) => {
    if (!step) return;

    // Prefer combined highlight (nodes + edge) to avoid edges being cleared by onFocusAgent flows.
    if (onHighlightPath) {
      const nodes = new Set<string>();
      const edges: { from: string; to: string }[] = [];

      if (step.agentId) nodes.add(step.agentId);
      if (step.nextAgentId) {
        nodes.add(step.nextAgentId);
        edges.push({ from: step.agentId, to: step.nextAgentId });
      }

      onHighlightPath(Array.from(nodes), edges);
      return;
    }

    // Fallback only
    if (onFocusAgent && step.agentId) onFocusAgent(step.agentId);
  };

  const handleSelectStep = (index: number) => {
    setSelectedStepIndex(index);

    const step = trace[index];
    emitHighlightForStep(step);

    const el = document.getElementById(`trace-step-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Auto-play door de stappen (alleen index + scroll)
  useEffect(() => {
    if (!isPlaying || trace.length === 0) return;

    const interval = setInterval(() => {
      setSelectedStepIndex((prev) => {
        if (prev === null) {
          const nextIndex = 0;
          const elStart = document.getElementById(`trace-step-${nextIndex}`);
          if (elStart) {
            elStart.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return nextIndex;
        }

        const next = prev + 1;
        if (next >= trace.length) {
          setIsPlaying(false);
          return prev;
        }

        const el = document.getElementById(`trace-step-${next}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        return next;
      });
    }, playSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, trace.length, playSpeed]);

  // ✅ Keep graph highlight in sync with selected step (also covers autoplay)
  useEffect(() => {
    if (selectedStepIndex == null) return;
    const step = trace[selectedStepIndex];
    emitHighlightForStep(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStepIndex, trace, onHighlightPath, onFocusAgent]);

  const handleTogglePlay = () => {
    if (trace.length === 0) return;
    if (selectedStepIndex === null) {
      setSelectedStepIndex(0);
    }
    setIsPlaying((prev) => !prev);
  };

  // Condition Debugger handlers
  const handleOpenConditionDebugger = (
    ruleCondition: string | null | undefined,
    stepIndex: number
  ) => {
    if (!trace[stepIndex]) return;

    const step = trace[stepIndex];
    const globalContext = (context ?? {}) as Record<string, unknown>;

    // Zelfde eval-context als in de CLI runtime
    const evalContext = {
      context: globalContext,
      output: step.parsedOutput,
      agentId: step.agentId,
      user: (globalContext as any).user,
    };

    const condition = (ruleCondition ?? '').trim() || 'always';

    setConditionExpression(condition);
    setConditionContextJson(JSON.stringify(evalContext, null, 2));
    setConditionResult(null);
    setConditionError(null);
    setConditionSourceStep(stepIndex);
    setIsConditionPanelOpen(true);
  };

  const handleEvaluateCondition = () => {
    if (!conditionExpression.trim()) {
      setConditionError('Please enter a condition expression.');
      setConditionResult(null);
      return;
    }

    try {
      const ctx = conditionContextJson.trim() ? JSON.parse(conditionContextJson) : {};
      const result = evaluateExpression(conditionExpression, ctx);
      setConditionResult(result);
      setConditionError(null);
    } catch (e: any) {
      console.error(e);
      setConditionError(
        e?.message ?? 'Failed to evaluate condition. Check your JSON context and expression.'
      );
      setConditionResult(null);
    }
  };

  // "Full path" button: prefers open+highlight handler if present
  const handleHighlightFullPath = () => {
    const cb = onHighlightPathAndOpen ?? onHighlightPath;
    if (!cb || trace.length === 0) return;

    const nodes = new Set<string>();
    const edges: { from: string; to: string }[] = [];

    trace.forEach((step) => {
      if (step.agentId) nodes.add(step.agentId);
      if (step.nextAgentId) {
        nodes.add(step.nextAgentId);
        edges.push({ from: step.agentId, to: step.nextAgentId });
      }
    });

    cb(Array.from(nodes), edges);
  };

  // Afgeleide trace op basis van filters
  const normalizedAgentFilter = agentFilter.trim().toLowerCase();
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const visibleTrace = trace.filter((step) => {
    const matchesAgent =
      !normalizedAgentFilter ||
      step.agentName.toLowerCase().includes(normalizedAgentFilter) ||
      step.agentId.toLowerCase().includes(normalizedAgentFilter) ||
      step.role.toLowerCase().includes(normalizedAgentFilter);

    const haystack = JSON.stringify(step).toLowerCase();
    const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);

    const matchesRouting =
      !showRoutingOnly || (step.selectedRuleId != null && step.selectedRuleId !== '');

    return matchesAgent && matchesSearch && matchesRouting;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Bug className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Debug — CLI Trace Viewer</h1>
            <p className="text-sm text-slate-500">
              Plak hier de <span className="font-mono">Final context</span> JSON uit de CLI-run om
              elke stap van je AIFLOW-uitvoering te inspecteren.
            </p>
          </div>
        </div>

        {/* Jump naar Workflow Builder + Highlight path */}
        <div className="flex items-center space-x-2">
          {(onHighlightPath || onHighlightPathAndOpen) && trace.length > 0 && (
            <button
              type="button"
              onClick={handleHighlightFullPath}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-sm"
            >
              Highlight full path in Workflow
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          )}

          {onJumpToAgent && trace.length > 0 && selectedStepIndex !== null && (
            <button
              type="button"
              onClick={() => onJumpToAgent(trace[selectedStepIndex].agentId)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-slate-50 hover:bg-slate-800 shadow-sm"
            >
              Open in Workflow Builder
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* Input + uitleg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              1. Plak hier de JSON van <span className="font-mono">Final context:</span>
            </span>
            <button
              type="button"
              onClick={handleParse}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            >
              Parse trace
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="w-full h-64 border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={`Voorbeeld:\n{\n  "ticket_text": "...",\n  "output_agent1": { ... },\n  "output_agent2": "...",\n  "__trace": [ ... ]\n}`}
          />
          <p className="text-xs text-slate-500">
            ✅ Tip: kopieer alleen het JSON-blok na <span className="font-mono">"Final context:"</span>{' '}
            uit de CLI, niet de volledige terminal-output.
          </p>
          {error && (
            <div className="flex items-start space-x-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Samenvatting context */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center">
            <ListTree className="h-4 w-4 mr-2 text-slate-400" />
            Context overzicht
          </h2>
          {context ? (
            <div className="border border-slate-100 rounded-lg bg-slate-50 max-h-60 overflow-auto">
              <pre className="text-[11px] leading-relaxed text-slate-800 p-3 font-mono whitespace-pre">
                {renderJson(
                  Object.fromEntries(Object.entries(context).filter(([key]) => key !== '__trace'))
                )}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Nog geen context geladen. Klik op <strong>Parse trace</strong> nadat je JSON hebt
              geplakt.
            </p>
          )}
        </div>
      </div>

      {/* Trace timeline + controls */}
      <div className="mt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3 gap-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center">
            Execution Trace
            {trace.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({visibleTrace.length} van {trace.length} steps)
              </span>
            )}
          </h2>

          <div className="flex flex-col md:flex-row md:items-center gap-2">
            {/* Agent-filter */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                placeholder="Filter op agent / role / id"
                className="px-2 py-1 rounded-lg border border-slate-300 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Zoekterm over context + output */}
            <div className="flex items-center gap-1">
              <Search className="h-3 w-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Zoek in context & output"
                className="px-2 py-1 rounded-lg border border-slate-300 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Routing-only toggle */}
            <button
              type="button"
              onClick={() => setShowRoutingOnly((prev) => !prev)}
              disabled={trace.length === 0}
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                trace.length === 0
                  ? 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                  : showRoutingOnly
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showRoutingOnly ? 'Only routing steps' : 'All steps'}
            </button>

            {/* Play-knop */}
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={trace.length === 0}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm ${
                trace.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : isPlaying
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="h-3 w-3 mr-1" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Play trace
                </>
              )}
            </button>
          </div>
        </div>

        {trace.length > 0 && visibleTrace.length > 0 && (
          <div className="mb-5 overflow-x-auto pb-2">
            <div className="flex items-center space-x-2 min-w-max">
              {visibleTrace.map((step) => {
                const originalIndex = trace.indexOf(step);
                const isActive = selectedStepIndex === originalIndex;

                return (
                  <React.Fragment key={step.step ?? originalIndex}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        handleSelectStep(originalIndex);
                      }}
                      className={`flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wide opacity-75 mb-0.5">
                        Step {step.step}
                      </span>
                      <span className="font-semibold truncate max-w-[120px]">
                        {step.agentName}
                      </span>
                      <span className="text-[10px] mt-0.5 opacity-80">
                        {step.role}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {trace.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-500 bg-slate-50">
            Nog geen trace gevonden. Plak de JSON en klik op{' '}
            <span className="font-medium">Parse trace</span> om de stappen te zien.
          </div>
        ) : visibleTrace.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-500 bg-slate-50">
            Geen stappen gevonden voor deze filter/zoekopdracht. Probeer een andere term of maak
            de filters leeg.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTrace.map((step) => {
              const originalIndex = trace.indexOf(step);
              const matchedRule = step.rulesEvaluated?.find((r) => r.id === step.selectedRuleId);
              const isActive = selectedStepIndex === originalIndex;

              const previousStep = originalIndex > 0 ? trace[originalIndex - 1] : undefined;
              const previousInput = previousStep
                ? (previousStep.inputContext as Record<string, unknown>)
                : undefined;
              const isDiffMode = !!diffModeByStep[originalIndex];

              const contextToRender =
                isDiffMode && previousInput
                  ? computeContextDiff(previousInput, step.inputContext as Record<string, unknown>)
                  : step.inputContext;

              return (
                <div
                  key={step.step}
                  id={`trace-step-${originalIndex}`}
                  className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${
                    isActive ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                  }`}
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                          isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        <span className="text-xs font-semibold">{step.step}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {step.agentName}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                            {step.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          {step.agentId}
                          {step.nextAgentId && (
                            <>
                              <span className="mx-2 text-slate-400">→</span>
                              <span className="text-slate-600">Next: {step.nextAgentId}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {matchedRule && (
                      <div className="flex flex-col items-end space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">
                            Rule
                          </span>
                          <span className="px-2 py-1 rounded-full text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {matchedRule.id}
                          </span>
                        </div>
                        {step.nextAgentId && (
                          <p className="text-[11px] text-slate-500">
                            Route selected →{' '}
                            <span className="font-mono text-slate-700">{step.nextAgentId}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                    {/* Input context */}
                    <div className="border-r border-slate-100 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-slate-700">Input Context</h3>
                        <button
                          type="button"
                          disabled={!previousInput}
                          onClick={() =>
                            setDiffModeByStep((prev) => ({
                              ...prev,
                              [originalIndex]: !prev[originalIndex],
                            }))
                          }
                          className={`text-[10px] px-2 py-1 rounded-md border ${
                            !previousInput
                              ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50'
                              : isDiffMode
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {isDiffMode ? 'Toon volledige context' : 'Toon alleen wijzigingen'}
                        </button>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg max-h-56 overflow-auto">
                        <pre className="text-[11px] leading-relaxed text-slate-800 p-3 font-mono whitespace-pre">
                          {renderJson(contextToRender)}
                        </pre>
                      </div>
                    </div>

                    {/* Parsed output */}
                    <div className="border-r border-slate-100 p-4">
                      <h3 className="text-xs font-semibold text-slate-700 mb-2">Parsed Output</h3>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg max-h-56 overflow-auto">
                        <pre className="text-[11px] leading-relaxed text-slate-800 p-3 font-mono whitespace-pre">
                          {renderJson(step.parsedOutput)}
                        </pre>
                      </div>
                    </div>

                    {/* Rules */}
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-slate-700 mb-2">Evaluated Rules</h3>
                      {step.rulesEvaluated && step.rulesEvaluated.length > 0 ? (
                        <div className="space-y-2 max-h-56 overflow-auto">
                          {step.rulesEvaluated.map((rule) => {
                            const isSelectedRoute =
                              !!step.selectedRuleId && rule.id === step.selectedRuleId;

                            return (
                              <div
                                key={rule.id}
                                className={`border rounded-lg px-3 py-2 text-[11px] ${
                                  rule.result
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-mono">{rule.id}</span>
                                  <div className="flex items-center space-x-1">
                                    <span className="font-semibold">{rule.result ? 'TRUE' : 'FALSE'}</span>
                                    {isSelectedRoute && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
                                        ROUTE SELECTED
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenConditionDebugger(rule.condition, originalIndex)}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-300 bg-white text-[10px] text-slate-700 hover:bg-slate-50"
                                      title="Open this condition in the debugger"
                                    >
                                      <Code className="h-3 w-3 mr-1" />
                                      Debug
                                    </button>
                                  </div>
                                </div>
                                <p className="font-mono text-[11px] text-slate-700">
                                  {rule.from} → {rule.to}
                                </p>
                                <p className="mt-1 italic text-[11px]">{rule.condition}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Geen regels geëvalueerd voor deze stap.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Condition Debugger */}
      {isConditionPanelOpen && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Linker paneel: expression + resultaat */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center">
                <Code className="h-4 w-4 mr-2 text-slate-400" />
                Condition Debugger
              </h2>
              <button
                type="button"
                onClick={() => setIsConditionPanelOpen(false)}
                className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Close debugger"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Evaluate a condition with the same context that the CLI used for routing. Click{' '}
              <span className="font-mono">Debug</span> on a rule to autofill this panel.
            </p>

            {conditionSourceStep !== null && trace[conditionSourceStep] && (
              <p className="text-[11px] text-slate-500">
                Source step:{' '}
                <span className="font-mono text-slate-700">
                  #{trace[conditionSourceStep].step} · {trace[conditionSourceStep].agentName} (
                  {trace[conditionSourceStep].agentId})
                </span>
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Condition expression</label>
              <input
                type="text"
                value={conditionExpression}
                onChange={(e) => setConditionExpression(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={`e.g. output.needs_human == false && context.ticket_type == 'technical'`}
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleEvaluateCondition}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
              >
                Evaluate condition
              </button>
              {conditionResult !== null && (
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    conditionResult
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  Result: {conditionResult ? 'TRUE' : 'FALSE'}
                </span>
              )}
            </div>

            {conditionError && (
              <div className="flex items-start space-x-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>{conditionError}</span>
              </div>
            )}
          </div>

          {/* Rechter paneel: JSON context */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Evaluation context (JSON)</h3>
            <p className="text-[11px] text-slate-500">
              This JSON is passed to <span className="font-mono">evaluateExpression</span> as the{' '}
              <span className="font-mono">ctx</span> argument. By default it contains:
              <span className="font-mono"> {'{ context, output, agentId, user }'}</span> for the
              selected step.
            </p>
            <textarea
              value={conditionContextJson}
              onChange={(e) => setConditionContextJson(e.target.value)}
              className="w-full h-56 border border-slate-300 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugTraceView;
