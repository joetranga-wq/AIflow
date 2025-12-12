import React, { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import WorkflowGraph from './components/WorkflowGraph';
import AgentEditor from './components/AgentEditor';
import ToolNodeEditor from './components/ToolNodeEditor';
import ConsolePanel from './components/ConsolePanel';
import Documentation from './components/Documentation';
import DebugTraceView from './components/DebugTraceView';
import ValidationPanel from './components/ValidationPanel';
import { ConditionDebuggerPanel } from './components/ConditionDebuggerPanel';
import { RuleInspectorPanel } from './components/RuleInspectorPanel';
import { evaluateConditionWithTrace, buildAutoContextForExpression } from './runtime/conditionEngineV2';
import { autoRewriteExpression } from './runtime/autoRewriteExpression';
import { validateProject, hasValidationErrors, ValidationIssue } from '../runtime/core/validator';
import { WorkflowRunner, LogEntry } from '../runtime/browser/WorkflowRunner';
import { ViewState, AIFlowProject, Agent, ToolDefinition } from '../core/types';
import { INITIAL_PROJECT, MARKETING_PROJECT, TOOL_TEMPLATES } from '../core/constants';

import { 
  Play, Save, Plus, Wrench, Undo, Redo, Box, Database, Zap, 
  FileText, Trash2, Globe, Calculator, Code, Terminal, Check,
  Download, Upload, Network, Link, AlertTriangle, Square, HardDrive, Key, X
} from 'lucide-react';


interface ProjectSession {
    id: string; 
    history: AIFlowProject[];
    historyIndex: number;
    lastModified: Date;
}

// ✅ Templates voor "New from template"
type TemplateKey = 'customer_support' | 'lead_qualification' | 'marketing_content';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // State
  const [sessions, setSessions] = useState<ProjectSession[]>([
      { id: INITIAL_PROJECT.metadata.name, history: [INITIAL_PROJECT], historyIndex: 0, lastModified: new Date() },
      { id: MARKETING_PROJECT.metadata.name, history: [MARKETING_PROJECT], historyIndex: 0, lastModified: new Date(Date.now() - 86400000) }
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(INITIAL_PROJECT.metadata.name);
  const [globalApiKey, setGlobalApiKey] = useState("");
  
  // Execution
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const runnerRef = useRef<WorkflowRunner | null>(null);

  // Dirty State (Unsaved Changes)
  const [isDirty, setIsDirty] = useState(false);

  // UI State
const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
const [selectedConditionTrace, setSelectedConditionTrace] = useState<any | null>(null);
const [selectedLogicLinkId, setSelectedLogicLinkId] = useState<string | null>(null);
const [editingLink, setEditingLink] = useState<{id: string, condition: string, mapping?: string} | null>(null);
const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
const [highlightedEdges, setHighlightedEdges] = useState<{ from: string; to: string }[]>([]);

// NEW: Edge status (ok | autofix | error)
const [edgeStatusByLinkId, setEdgeStatusByLinkId] = useState<
  Record<string, 'ok' | 'autofix' | 'error'>
>({});

  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  const [activePromptFile, setActivePromptFile] = useState<string | null>(null);
  const [promptContent, setPromptContent] = useState("");
  const [isPromptDirty, setIsPromptDirty] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolType, setNewToolType] = useState<'http' | 'builtin' | 'python'>('http');
  const [newToolTemplate, setNewToolTemplate] = useState<string>("");
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");

  // ✅ Template modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // ✅ Validation Panel state
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[] | null>(null);
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolTemplates = TOOL_TEMPLATES;

  // Derived
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const project = activeSession.history[activeSession.historyIndex];
  const historyIndex = activeSession.historyIndex;

    // Selected logic link (edge) for Rule Inspector
  const selectedLogicLink = useMemo(() => {
    if (!selectedLogicLinkId) return null;
    return (project.flow.logic as any[]).find((l) => l.id === selectedLogicLinkId) ?? null;
  }, [project.flow.logic, selectedLogicLinkId]);

  const selectedLinkFromAgent = useMemo(() => {
    if (!selectedLogicLink) return null;
    return project.agents.find((a) => a.id === (selectedLogicLink as any).from) ?? null;
  }, [project.agents, selectedLogicLink]);

  const selectedLinkToAgent = useMemo(() => {
    if (!selectedLogicLink) return null;
    return project.agents.find((a) => a.id === (selectedLogicLink as any).to) ?? null;
  }, [project.agents, selectedLogicLink]);

  // ✅ Map validator issues → per-agent error/warning counts
const validationByAgentId = useMemo(() => {
  const map: Record<string, { errors: number; warnings: number }> = {};

  if (!validationIssues || !Array.isArray(validationIssues)) {
    return map;
  }

  validationIssues.forEach((issue) => {
    if (!issue.path) return;

    const agentId = issue.path[0];
    if (!map[agentId]) {
      map[agentId] = { errors: 0, warnings: 0 };
    }

    if (issue.level === "error") {
      map[agentId].errors += 1;
    } else {
      map[agentId].warnings += 1;
    }
  });

  return map;
}, [validationIssues]);




  // Initialize run inputs from project defaults
  useEffect(() => {
      const defaults: Record<string, string> = {};
      Object.entries(project.flow.variables).forEach(([k, v]) => {
          defaults[k] = String(v);
      });
      setRunInputs(defaults);
  }, [project.flow.variables]);

  // Sync prompt content when file changes
  useEffect(() => {
      if (activePromptFile && project.prompts[activePromptFile] !== undefined) {
          setPromptContent(project.prompts[activePromptFile]);
          setIsPromptDirty(false);
      } else {
          setPromptContent("");
          setIsPromptDirty(false);
      }
  }, [activePromptFile, project.prompts]);

  // --- Navigation Guard ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const navigate = (view: ViewState) => {
      if (isDirty && view !== currentView) {
          if (window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
              setCurrentView(view);
              setSelectedAgentId(null);
          }
      } else {
          setCurrentView(view);
          setSelectedAgentId(null);
      }
  };

  const handleNavigateToPrompt = (filename: string) => {
      setActivePromptFile(filename);
      setCurrentView(ViewState.PROMPTS);
  };

  const handleNavigateToTools = () => {
      setCurrentView(ViewState.TOOLS);
  };

  const handleJumpToAgentFromTrace = (agentId: string) => {
    setHighlightedNodeIds([]);
    setHighlightedEdges([]);
    setSelectedAgentId(agentId);
    setCurrentView(ViewState.WORKFLOW);
  };

  const handleFocusAgentFromTrace = (agentId: string) => {
  setHighlightedNodeIds([agentId]);
  setHighlightedEdges([]);
  // ✅ bewust NIET: setCurrentView(...)
  // We blijven in Debug view, alleen graph state wordt voorbereid.
};


const handleHighlightPathFromTrace = (
  nodes: string[],
  edges: { from: string; to: string }[]
) => {
  setHighlightedNodeIds(nodes);
  setHighlightedEdges(edges);
  // bewust: GEEN view switch, GEEN selection
};

const handleHighlightPathAndOpenFromTrace = (
  nodes: string[],
  edges: { from: string; to: string }[]
) => {
  setHighlightedNodeIds(nodes);
  setHighlightedEdges(edges);
  setCurrentView(ViewState.WORKFLOW);
};


    // 👉 Wanneer een edge (logic link) in de graph wordt aangeklikt
  const handleSelectLogicLinkFromGraph = (linkId: string) => {
    setSelectedLogicLinkId(linkId);

    // Zoek de bijbehorende link in het project
    const link = (project.flow.logic as any[]).find((l) => l.id === linkId);
    if (!link) return;

    // Selecteer de FROM-agent zodat rechts de juiste Agent Configuration zichtbaar is
    const fromAgent = project.agents.find((a) => a.id === link.from);
    if (fromAgent) {
      setSelectedAgentId(fromAgent.id);
    }

    // Zorg dat we in de Workflow view zitten
    setCurrentView(ViewState.WORKFLOW);
  };

  // Haal alle veldpaden op uit een genest context-object, bv.
// { ticket: { type: "technical", priority: "high" } }
//  -> ["ticket", "ticket.type", "ticket.priority"]
const collectFieldPathsForContext = (obj: any, prefix = ''): string[] => {
  if (obj == null || typeof obj !== 'object') return [];
  const paths: string[] = [];

  for (const key of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    paths.push(full);
    paths.push(...collectFieldPathsForContext(obj[key], full));
  }

  return paths;
};

// Bouw canonical + alias veldnamen uit een context
const buildKnownFieldsFromContext = (context: any) => {
  const allPaths = collectFieldPathsForContext(context);
  const uniquePaths = Array.from(new Set(allPaths));

  return uniquePaths.map((p) => {
    const isSnakeOnly = p.includes("_") && !p.includes(".");
    const canonical = isSnakeOnly ? p.replace(/_/g, ".") : p;
    const last = canonical.split(".").pop()!;
    const snake = canonical.replace(/\./g, "_");

    return {
      id: canonical,
      path: canonical,
      label: canonical,
      aliases: [
        canonical,  // ticket.type
        snake,      // ticket_type
        last,       // type
        p           // original path
      ],
    };
  });
};


// Condition Debugger – edge debugging with AutoRewrite PREPASS
const handleDebugRuleFromLink = (link: any) => {
  if (!link) return;

  const expression = link.condition || String(link.label || "true");

  // Always jump to workflow view
  setCurrentView(ViewState.WORKFLOW);

  // Select FROM agent for UI accuracy
  const fromAgent = project.agents.find((a) => a.id === link.from);
  if (fromAgent) {
    setSelectedAgentId(fromAgent.id);
  }

  // 1) Build debug context (design-time auto context)
  const context = buildAutoContextForExpression(expression);

  // 2) Discover canonical field paths
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

  const allPaths = collectFieldPaths(context);
  const uniquePaths = Array.from(new Set(allPaths));

  const knownFields = uniquePaths.map((p) => {
    const last = p.split('.').pop()!;
    return {
      id: p,
      path: p,                     // canonical version
      label: p,
      aliases: [
        p,                         // canonical
        p.replace(/\./g, "_"),     // snake_case
        last,                      // short field name
      ],
    };
  });

  // 3) AutoRewrite PREPASS — happens BEFORE evaluation
  try {
    const rewrite = autoRewriteExpression(expression, knownFields);
    if (rewrite) {
      // Deliver rewrite result directly to debugger
      setSelectedConditionTrace({
        conditionId: link.id || "edge",
        runId: "design-preview",
        expression: rewrite.original,
        rewrittenExpression: rewrite.rewritten,
        autoRewrite: rewrite,
        debugContext: context,
        result: null,
        referencedFields: [],
        root: {
          id: "root",
          type: "ERROR",
          raw: rewrite.original,
          value: null,
          children: [],
          error: "Rule contains invalid or unknown fields (AutoFix available).",
        },
      });
      return; // STOP HERE — show autofix instead of parsing error
    }
  } catch (err) {
    console.warn("AutoRewrite PREPASS failed:", err);
  }

  // 4) Normal ConditionEngine evaluation if no rewrite
  let trace: any;
  try {
    trace = evaluateConditionWithTrace(expression, context);
  } catch (err: any) {
    trace = {
      conditionId: link.id || "edge",
      runId: "design-preview",
      expression,
      expressionWithValues: expression,
      result: null,
      referencedFields: [],
      root: {
        id: "root",
        type: "ERROR",
        raw: expression,
        value: null,
        children: [],
        error: err?.message || "Failed to evaluate condition",
      },
    };
  }

  // Add debug context regardless
  setSelectedConditionTrace({
    ...trace,
    debugContext: context,
  });
};


  // 👉 Auto-fix uit Condition Debugger toepassen op de echte rule
  const handleApplyRuleRewrite = (rewrittenExpression: string) => {
    if (!selectedConditionTrace) return;

    const linkId = selectedConditionTrace.conditionId as string | undefined;
    if (!linkId) return;

    // Update de rule in flow.logic
    const updatedLogic = (project.flow.logic || []).map((l: any) => {
      if (l.id === linkId) {
        return {
          ...l,
          condition: rewrittenExpression, // nieuwe rule
        };
      }
      return l;
    });

    updateProject({
      ...project,
      flow: {
        ...project.flow,
        logic: updatedLogic,
      },
    });

    // Debugger direct updaten zodat UI meteen klopt
    setSelectedConditionTrace({
      ...selectedConditionTrace,
      expression: rewrittenExpression,
      expressionWithValues: rewrittenExpression,
    });
  };


  // --- Helpers ---


  const updateProject = (newProject: AIFlowProject, transient = false) => {
    setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
            let newHistory = [...s.history];
            let newIndex = s.historyIndex;
            
            if (!transient) {
                newHistory = newHistory.slice(0, newIndex + 1);
                newHistory.push(newProject);
                newIndex++;
            } else {
                newHistory[newIndex] = newProject;
            }
            return { ...s, history: newHistory, historyIndex: newIndex, lastModified: new Date() };
        }
        return s;
    }));
    if (!transient) {
        setIsDirty(true);
    }
  };

  // --- File I/O ---
  const handleSave = () => {
    downloadProject(project.metadata.name);
    setIsDirty(false);
  };

  const handleSaveAs = () => {
      if (saveAsName) {
          downloadProject(saveAsName);
          setIsDirty(false);
          setShowSaveAsModal(false);
      }
  };

  const downloadProject = (filename: string) => {
    const version = project.metadata.version || '1.0.0';
    const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const finalFilename = `${safeName}_v${version}.aiflow`;

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadClick = () => {
      if (isDirty) {
          if (!confirm("You have unsaved changes. Loading a new project will overwrite them. Continue?")) {
              return;
          }
      }
      fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target?.result as string;
              const loadedProject = JSON.parse(content) as AIFlowProject;
              
              if (!loadedProject.metadata || !loadedProject.flow || !loadedProject.agents) {
                  throw new Error("Invalid .aiflow file structure");
              }

              const loadedSessionId = loadedProject.metadata.name + "_" + Date.now();
              const newSession: ProjectSession = {
                  id: loadedSessionId,
                  history: [loadedProject],
                  historyIndex: 0,
                  lastModified: new Date()
              };

              setSessions(prev => [...prev, newSession]);
              setActiveSessionId(loadedSessionId);
              setIsDirty(false);
              setCurrentView(ViewState.DASHBOARD);
              alert(`Project "${loadedProject.metadata.name}" loaded successfully!`);

          } catch (error) {
              console.error(error);
              alert("Failed to load project: Invalid file format.");
          }
      };
      reader.readAsText(file);
      event.target.value = ''; 
  };

  // --- Run Actions ---
  const handleRunClick = () => {
      setRunModalOpen(true);
  };

  const handleStartExecution = async () => {
      setRunModalOpen(false);
      setIsConsoleOpen(true);
      setLogs([]);
      
      const resetAgents = project.agents.map(a => ({...a, executionStatus: 'idle' as const}));
      updateProject({ ...project, agents: resetAgents }, true);

      setIsRunning(true);
      
      runnerRef.current = new WorkflowRunner(
          project,
          globalApiKey,
          runInputs,
          (log) => setLogs(prev => [...prev, log]),
          (agentId, status) => {
              setSessions(prev => prev.map(s => {
                  if (s.id === activeSessionId) {
                      const curr = s.history[s.historyIndex];
                      const updatedAgents = curr.agents.map(a => a.id === agentId ? { ...a, executionStatus: status } : a);
                      const newHist = [...s.history];
                      newHist[s.historyIndex] = { ...curr, agents: updatedAgents };
                      return { ...s, history: newHist };
                  }
                  return s;
              }));
          }
      );

      try {
          await runnerRef.current.start();
      } catch (e) {
          console.error(e);
      } finally {
          setIsRunning(false);
      }
  };

  const handleStopWorkflow = () => {
      if (runnerRef.current) {
          runnerRef.current.stop();
          setIsRunning(false);
      }
  };

  const handleSwitchProject = (projectId: string) => {
      if (isDirty) {
          if(!confirm("You have unsaved changes in the current project. Switch anyway?")) return;
      }
      setActiveSessionId(projectId);
      setIsDirty(false);
      setCurrentView(ViewState.DASHBOARD);
  };

  const handleCreateProject = () => {
      const name = `NewProject_${Date.now()}`;
      const newProject: AIFlowProject = {
          ...INITIAL_PROJECT,
          metadata: { ...INITIAL_PROJECT.metadata, name: "Untitled Project", version: "0.1.0" },
          agents: [],
          flow: { ...INITIAL_PROJECT.flow, agents: [], logic: [] },
          tools: {}
      };
      
      const newSession: ProjectSession = {
          id: name,
          history: [newProject],
          historyIndex: 0,
          lastModified: new Date()
      };

      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(name);
      setIsDirty(false);
      setCurrentView(ViewState.WORKFLOW);
  };

  // ✅ Open template modal (Dashboard → New from template)
  const handleOpenTemplateModal = () => {
    if (isDirty) {
      if (!confirm("You have unsaved changes in the current project. Create from template anyway?")) {
        return;
      }
    }
    setIsTemplateModalOpen(true);
  };

  // ✅ Maak nieuwe sessie op basis van template
  const handleCreateProjectFromTemplate = (templateKey: TemplateKey) => {
    let base: AIFlowProject;
    let name: string;

    switch (templateKey) {
      case 'customer_support':
        base = INITIAL_PROJECT;
        name = 'Customer Support Flow';
        break;
      case 'lead_qualification':
        base = INITIAL_PROJECT;
        name = 'Lead Qualification Flow';
        break;
      case 'marketing_content':
        base = MARKETING_PROJECT;
        name = 'Marketing Content Flow';
        break;
      default:
        base = INITIAL_PROJECT;
        name = 'New Template Flow';
    }

    const cloned: AIFlowProject = JSON.parse(JSON.stringify(base));
    cloned.metadata = {
      ...cloned.metadata,
      name,
      version: cloned.metadata.version || '1.0.0',
    };

    const sessionId = `${name.replace(/\s+/g, '_')}_${Date.now()}`;
    const newSession: ProjectSession = {
      id: sessionId,
      history: [cloned],
      historyIndex: 0,
      lastModified: new Date(),
    };

    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(sessionId);
    setIsDirty(false);
    setCurrentView(ViewState.WORKFLOW);
    setSelectedAgentId(null);
    setIsTemplateModalOpen(false);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, historyIndex: s.historyIndex - 1 } : s));
          setIsDirty(true);
      }
  };
  const handleRedo = () => {
      if (historyIndex < activeSession.history.length - 1) {
          setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, historyIndex: s.historyIndex + 1 } : s));
          setIsDirty(true);
      }
  };

  // --- Logic Editor ---
  const handleLinkCreate = (sourceId: string, targetId: string) => {
      const newLink = {
          id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          from: sourceId,
          to: targetId,
          condition: "always",
          description: "Direct link"
      };
      
      const newLogic = [...project.flow.logic, newLink];
      updateProject({ ...project, flow: { ...project.flow, logic: newLogic } });
      
      setIsLinkingMode(false);
      setLinkingSourceId(null);
  };

  const handleNodeClick = (nodeId: string) => {
      if (isLinkingMode) {
          if (!linkingSourceId) {
              setLinkingSourceId(nodeId);
          } else {
              if (linkingSourceId === nodeId) {
                  setLinkingSourceId(null); 
                  return;
              }
              handleLinkCreate(linkingSourceId, nodeId);
          }
      } else {
          setSelectedAgentId(nodeId);
      }
  };

  const handleAddAgentNode = () => {
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newAgent: Agent = {
        id,
        name: "New Agent",
        role: "Worker",
        model: { provider: "openai", name: "gpt-4-turbo", temperature: 0.7, max_tokens: 1000 },
        prompt: "new_prompt.txt",
        instructions: "instructions.md",
        tools: [],
        memory: "memory/schema.json",
        output_format: "json",
        executionStatus: 'idle'
    };
    
    updateProject({
        ...project,
        agents: [...project.agents, newAgent],
        flow: { ...project.flow, agents: [...project.flow.agents, id] }
    });
  };

  const handleAddToolNode = () => {
    const id = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newToolAgent: Agent = {
        id,
        name: "New Tool",
        role: "Tool",
        model: { provider: "system", name: "tool-executor", temperature: 0, max_tokens: 0 },
        prompt: "",
        instructions: "",
        tools: ["web_search"], 
        memory: "",
        output_format: "raw",
        executionStatus: 'idle'
    };

    updateProject({
        ...project,
        agents: [...project.agents, newToolAgent],
        flow: { ...project.flow, agents: [...project.flow.agents, id] }
    });
  };

  const handleRemoveNode = (id: string) => {
      if (!confirm("Delete this node?")) return;
      
      const newAgents = project.agents.filter(a => a.id !== id);
      const newFlowAgents = project.flow.agents.filter(aid => aid !== id);
      const newLogic = project.flow.logic.filter(l => l.from !== id && l.to !== id);

      updateProject({
          ...project,
          agents: newAgents,
          flow: { ...project.flow, agents: newFlowAgents, logic: newLogic }
      });
      setSelectedAgentId(null);
  };

        const saveCondition = () => {
        if (!editingLink) return;

        // 1) Mapping netjes als JSON-parsed object opslaan (of undefined)
        let parsedMapping: any = undefined;
        if (editingLink.mapping && editingLink.mapping.trim() !== '') {
            try {
            parsedMapping = JSON.parse(editingLink.mapping);
            } catch (err) {
            // Hier kun je later nog een nette toast of error state van maken
            console.error('Invalid JSON in data mapping:', err);
            alert('Data mapping is geen geldige JSON. Controleer het even.');
            return;
            }
        }

        // 2) Condition mag ALLES zijn wat onze ConditionEngine v2 aankan
        const updatedLogic = (project.flow.logic || []).map((l: any) => {
            if (l.id === editingLink.id) {
            return {
                ...l,
                condition: editingLink.condition, // bijv. ticket.type == 'technical'
                mapping: parsedMapping,          // als object opgeslagen
            };
            }
            return l;
        });

        // 3) Project updaten
        updateProject({
            ...project,
            flow: {
            ...project.flow,
            logic: updatedLogic,
            },
        });

        // 4) Modal sluiten
        setEditingLink(null);
        };

  // --- Tool Templates Logic ---
  const handleApplyTemplate = (templateKey: string) => {
      setNewToolTemplate(templateKey);
      setNewToolName(templateKey);
      if (toolTemplates[templateKey]) {
          setNewToolType(toolTemplates[templateKey].type);
      }
  };

  const handleCreateTool = () => {
      if (!newToolName) return;
      
      let newTool: ToolDefinition;
      if (newToolTemplate && toolTemplates[newToolTemplate]) {
          newTool = { ...toolTemplates[newToolTemplate] };
      } else {
          newTool = {
            type: newToolType,
            description: "New tool description",
            operations: [],
            endpoint: newToolType === 'http' ? "https://api.example.com" : undefined
        };
      }
      
      const newTools = { ...project.tools, [newToolName]: newTool };
      updateProject({ ...project, tools: newTools });
      
      setIsToolModalOpen(false);
      setNewToolName("");
      setNewToolTemplate("");
      
      if (currentView !== ViewState.TOOLS) {
          setCurrentView(ViewState.TOOLS);
      }
  };

  const handleToolNodeSave = (toolName: string, definition: ToolDefinition) => {
      const newTools = { ...project.tools, [toolName]: definition };
      const newAgents = project.agents.map(a => 
          (selectedAgentId && a.id === selectedAgentId) ? { ...a, name: toolName, tools: [toolName] } : a
      );
      updateProject({ ...project, tools: newTools, agents: newAgents });
  };

  const handleAgentSave = (updatedAgent: Agent) => {
      const newAgents = project.agents.map(ag => ag.id === updatedAgent.id ? updatedAgent : ag);
      updateProject({ ...project, agents: newAgents });
  };

  const handleDeleteTool = (toolName: string) => {
      if(confirm(`Delete tool ${toolName}?`)) {
          const newTools = { ...project.tools };
          delete newTools[toolName];
          updateProject({ ...project, tools: newTools });
      }
  };

  // --- Prompt Handlers ---
  const handleCreatePrompt = () => {
      const filename = `prompt_${Date.now()}.txt`;
      const newPrompts = { ...project.prompts, [filename]: "Enter system instructions here..." };
      updateProject({ ...project, prompts: newPrompts });
      setActivePromptFile(filename);
  };

  const handleDeletePrompt = (filename: string) => {
      if(!confirm(`Are you sure you want to delete ${filename}?`)) return;
      const newPrompts = { ...project.prompts };
      delete newPrompts[filename];
      updateProject({ ...project, prompts: newPrompts });
      if (activePromptFile === filename) {
          setActivePromptFile(null);
      }
  };

  const handleSavePrompt = () => {
      if (activePromptFile) {
          updateProject({
              ...project,
              prompts: { ...project.prompts, [activePromptFile]: promptContent }
          });
          setIsPromptDirty(false);
      }
  };

  const handleUpdateMetadata = (field: string, value: string) => {
      updateProject({
          ...project,
          metadata: { ...project.metadata, [field]: value }
      });
  };

  
  
  // ✅ Validation handler (handmatige knop)
  const handleValidateProject = () => {
    const issues = validateProject(project);
    setValidationIssues(issues);
    setIsValidationPanelOpen(true);

    if (!hasValidationErrors(issues) && issues.length === 0) {
      alert('✅ Project is valid. No structural issues found.');
    }
  };

  // ✅ Klik op validation issue -> jump naar juiste agent/node
  const handleSelectValidationIssue = (issue: ValidationIssue) => {
    if (!issue.path) return;

    // Paden als "agents[3].prompt", "agents[1].tools[0]" etc.
    const match = issue.path.match(/^agents\[(\d+)\]/);
    if (!match) return;

    const index = Number(match[1]);
    const agent = project.agents[index];
    if (!agent) return;

    // Zorg dat we in de Workflow Builder zitten
    setCurrentView(ViewState.WORKFLOW);

    // Selecteer de node/agent in graph + rechterpaneel
    setSelectedAgentId(agent.id);
  };

  // ✅ Live Validator – automatisch tijdens editen in Workflow view
  useEffect(() => {
    if (currentView !== ViewState.WORKFLOW) return;

    const timeout = setTimeout(() => {
      const issues = validateProject(project);
      setValidationIssues(issues);
      // Panel niet forceren; alleen data updaten
    }, 400);

    return () => clearTimeout(timeout);
  }, [currentView, project]);

  // ------------------------------------------------------
// ⭐ NEW: Compute per-edge rule status (ok | autofix | error)
useEffect(() => {
  if (!project?.flow?.logic) {
    setEdgeStatusByLinkId({});
    return;
  }

  const next: Record<string, 'ok' | 'autofix' | 'error'> = {};

  for (const link of project.flow.logic) {
    const expression = link.condition || String(link.label || 'true');

    try {
      const context = buildAutoContextForExpression(expression);
      const knownFields = buildKnownFieldsFromContext(context);

      const rewrite = autoRewriteExpression(expression, knownFields);
      if (rewrite && rewrite.rewritten !== rewrite.original) {
        next[link.id] = 'autofix';
        continue;
      }

      try {
        evaluateConditionWithTrace(expression, context);
        next[link.id] = 'ok';
      } catch {
        next[link.id] = 'error';
      }
    } catch {
      next[link.id] = 'error';
    }
  }

  setEdgeStatusByLinkId(next);
}, [project]);





  // --- Render Views ---
  const renderContent = () => {
      if (currentView === ViewState.MEMORY) {
          return (
            <div className="p-8 max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-slate-900 mb-8">Memory Explorer</h1>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                     <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                         <h3 className="font-bold text-slate-800">Vector Store</h3>
                         <button className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add Mock Chunk</button>
                     </div>
                     <table className="w-full text-sm text-left">
                         <thead className="bg-slate-50 text-slate-500 font-semibold">
                             <tr>
                                 <th className="px-6 py-3">ID</th>
                                 <th className="px-6 py-3">Content Preview</th>
                                 <th className="px-6 py-3">Vector Dim.</th>
                                 <th className="px-6 py-3">Action</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                             <tr>
                                 <td className="px-6 py-4 font-mono text-xs">mem_8f92a</td>
                                 <td className="px-6 py-4">"Customer mentioned error code 503..."</td>
                                 <td className="px-6 py-4 text-slate-400">1536</td>
                                 <td className="px-6 py-4"><button className="text-red-500 hover:text-red-700">Delete</button></td>
                             </tr>
                             <tr>
                                 <td className="px-6 py-4 font-mono text-xs">mem_1b3d9</td>
                                 <td className="px-6 py-4">"Refund policy states 30 days..."</td>
                                 <td className="px-6 py-4 text-slate-400">1536</td>
                                 <td className="px-6 py-4"><button className="text-red-500 hover:text-red-700">Delete</button></td>
                             </tr>
                         </tbody>
                     </table>
                </div>
            </div>
          )
      }
      
      if (currentView === ViewState.SETTINGS) {
          return (
            <div className="p-8 max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-slate-900 mb-8">Settings</h1>
                <div className="bg-white rounded-xl border-slate-200 shadow-sm p-6 space-y-6 border">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Global API Key (Gemini)</label>
                        <div className="flex space-x-2">
                            <div className="relative flex-1">
                                <Key size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input 
                                    type="password" 
                                    value={globalApiKey}
                                    onChange={e => setGlobalApiKey(e.target.value)}
                                    placeholder="Enter API Key to enable execution..."
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Required to run agents in the Workflow Builder.</p>
                    </div>
                </div>
            </div>
          )
      }

      if (currentView === ViewState.WORKFLOW) {
          const selectedNode = project.agents.find(a => a.id === selectedAgentId);
          const issues = validationIssues ?? [];
          const errorCount = issues.filter(i => i.level === 'error').length;
          const warningCount = issues.filter(i => i.level === 'warning').length;

          return (
            <div className="p-6 h-screen flex flex-col relative">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Workflow Builder</h1>
                            <p className="text-slate-500">Visual logic editor for <span className="font-mono text-indigo-600">{project.metadata.name}</span></p>
                        </div>
                        {isDirty && (
                            <div className="flex items-center px-3 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200 animate-pulse">
                                <AlertTriangle size={12} className="mr-1" /> Unsaved Changes
                            </div>
                        )}

                        {issues.length > 0 && (
                          <div className="flex items-center px-3 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            <AlertTriangle size={12} className="mr-1" />
                            {errorCount > 0 && (
                              <span>
                                {errorCount} error{errorCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {errorCount > 0 && warningCount > 0 && <span className="mx-1">·</span>}
                            {warningCount > 0 && (
                              <span>
                                {warningCount} warning{warningCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                    <div className="flex space-x-2">
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg mr-2 shadow-sm">
                            <button 
                                onClick={handleRunClick}
                                disabled={isRunning}
                                className={`flex items-center px-3 py-2 text-sm font-medium ${isRunning ? 'text-slate-400 bg-slate-50 cursor-not-allowed' : 'text-emerald-700 hover:bg-emerald-50'}`}
                            >
                                <Play size={16} className={`mr-2 ${isRunning ? 'opacity-50' : ''}`} fill="currentColor" />
                                Run
                            </button>
                            {isRunning && (
                                <button 
                                    onClick={handleStopWorkflow}
                                    className="flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border-l border-slate-200"
                                >
                                    <Square size={16} className="mr-2" fill="currentColor" />
                                    Stop
                                </button>
                            )}
                        </div>

                        {/* ✅ Validate button */}
                        <button 
                          onClick={handleValidateProject}
                          className="flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm font-medium text-sm"
                          title="Validate flow structure"
                        >
                          <Check size={16} className="mr-2" />
                          Validate
                        </button>

                        {/* ✅ Demo button voor Condition Debugger */}
                        <button
                          onClick={() => {
                            const demoTrace = {
                              conditionId: "demo",
                              runId: "demo-run",
                              expression: "(customer.age >= 18 && country == 'NL')",
                              result: "true",
                              root: {
                                id: "root",
                                type: "AND",
                                operator: "&&",
                                value: true,
                                raw: "(customer.age >= 18 && country == 'NL')",
                                children: [
                                  {
                                    id: "age-compare",
                                    type: "COMPARE",
                                    operator: ">=",
                                    value: true,
                                    raw: "customer.age >= 18",
                                    children: [
                                      { id: "age-field", type: "FIELD", raw: "customer.age", value: 21 },
                                      { id: "age-literal", type: "LITERAL", raw: "18", value: 18 },
                                    ],
                                  },
                                  {
                                    id: "country-compare",
                                    type: "COMPARE",
                                    operator: "==",
                                    value: true,
                                    raw: "country == 'NL'",
                                    children: [
                                      { id: "country-field", type: "FIELD", raw: "country", value: "NL" },
                                      { id: "country-literal", type: "LITERAL", raw: "'NL'", value: "NL" },
                                    ],
                                  },
                                ],
                              },
                              referencedFields: [
                                { path: "customer.age", value: 21, sourceNodeId: selectedAgentId ?? "agent_1" },
                                { path: "country", value: "NL", sourceNodeId: selectedAgentId ?? "agent_1" },
                              ],
                              expressionWithValues: "(21 >= 18 && 'NL' == 'NL')",
                            };
                            setSelectedConditionTrace(demoTrace);
                          }}
                          className="flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm font-medium text-sm"
                          title="Open Condition Debugger met demo rule"
                        >
                          <Code size={16} className="mr-2" />
                          Debug demo rule
                        </button>

                        <div className="h-8 w-px bg-slate-300 mx-2"></div>

                            <button
                            className="inline-flex items-center px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 gap-2"
                            onClick={() => {
                                const links = project.flow.logic as any[];
                                if (!Array.isArray(links) || links.length === 0) return;

                                const firstLink = links[0];
                                setSelectedLogicLinkId(firstLink.id);
                                handleDebugRuleFromLink(firstLink);
                            }}
                            >
                            <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px]">
                                ?
                            </span>
                            Debug first rule
                            </button>

                        <button 
                            onClick={() => setIsLinkingMode(!isLinkingMode)}
                            className={`flex items-center px-3 py-2 rounded-lg border shadow-sm transition-all font-medium ${
                                isLinkingMode 
                                ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200' 
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                            title="Connect Nodes Mode"
                        >
                            <Link size={18} className={isLinkingMode ? "animate-pulse" : ""} />
                            <span className="ml-2">{isLinkingMode ? "Connecting..." : "Connect"}</span>
                        </button>

                        <div className="flex items-center bg-white border border-slate-300 rounded-lg mx-2 shadow-sm">
                            <button 
                              onClick={handleUndo} 
                              disabled={historyIndex === 0} 
                              className={`p-2 border-r border-slate-300 hover:bg-slate-50 ${historyIndex === 0 ? 'text-slate-300' : 'text-slate-600'}`}
                            >
                              <Undo size={18} />
                            </button>
                            <button 
                              onClick={handleRedo} 
                              disabled={historyIndex === activeSession.history.length - 1} 
                              className={`p-2 hover:bg-slate-50 ${historyIndex === activeSession.history.length - 1 ? 'text-slate-300' : 'text-slate-600'}`}
                            >
                              <Redo size={18} />
                            </button>
                        </div>

                        <div className="relative group">
                            <button 
                                onClick={handleSave}
                                className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm font-medium"
                            >
                                <Save size={18} className="mr-2" />
                                Save
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 hidden group-hover:block z-20 overflow-hidden">
                                <button onClick={handleSave} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 font-medium border-b border-slate-50">
                                    Save Project
                                </button>
                                <button onClick={() => { setSaveAsName(project.metadata.name); setShowSaveAsModal(true); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm text-slate-700 font-medium">
                                    Save As...
                                </button>
                            </div>
                        </div>

                        <button 
                            onClick={handleLoadClick}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm font-medium"
                        >
                            <Upload size={18} className="mr-2" />
                            Load
                        </button>

                        <div className="h-8 w-px bg-slate-300 mx-2"></div>

                        <button onClick={handleAddToolNode} className="flex items-center px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 shadow-sm font-medium text-sm"><Zap size={16} className="mr-2" /> Tool</button>
                        <button onClick={handleAddAgentNode} className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm font-medium text-sm"><Plus size={16} className="mr-2" /> Agent</button>
                    </div>
                </div>

                <div className="flex flex-1 gap-6 min-h-0 relative">
                    {/* Linker deel: graph + agent editor */}
                    <div className="flex-1 flex gap-6 min-h-0">
                      <div className="flex-1">
                        <WorkflowGraph 
                        project={project} 
                        onSelectAgent={setSelectedAgentId}
                        onEditCondition={(id, c) => setEditingLink({ id, condition: c })}
                        onNavigateToPrompt={handleNavigateToPrompt}
                        onNavigateToTools={handleNavigateToTools}
                        isLinkingMode={isLinkingMode}
                        linkingSourceId={linkingSourceId}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedAgentId}
                        onLinkCreate={handleLinkCreate}
                        highlightedNodeIds={highlightedNodeIds}
                        highlightedEdges={highlightedEdges}
                        validationByAgentId={validationByAgentId}
                        // 🆕 Edge selection vanuit de graph
                        selectedLinkId={selectedLogicLinkId}
                        onSelectLink={handleSelectLogicLinkFromGraph}
                        edgeStatusByLinkId={edgeStatusByLinkId}
                        />

                      </div>
                      {selectedNode && (
                        <div className="w-1/3 min-w-[400px]">
                            {selectedNode.role === 'Tool' ? (
                                <ToolNodeEditor 
                                    agent={selectedNode} 
                                    tools={project.tools} 
                                    onSave={handleToolNodeSave}
                                    onDelete={() => handleRemoveNode(selectedAgentId!)}
                                />
                            ) : (
                                <AgentEditor 
                                    agent={selectedNode}
                                    availableTools={Object.keys(project.tools)}
                                    onSave={handleAgentSave}
                                />
                            )}
                        </div>
                      )}
                    </div>

                    {/* Rechter deel: Validation Panel + Condition Debugger */}
                    {(isValidationPanelOpen || selectedConditionTrace) && (
                        <div className="w-[360px] h-full flex flex-col gap-3">
                        {/* Validation */}
                        {isValidationPanelOpen && (
                            <div className="flex-none">
                            <ValidationPanel
                                issues={validationIssues ?? []}
                                isOpen={isValidationPanelOpen}
                                onClose={() => setIsValidationPanelOpen(false)}
                                onSelectIssue={handleSelectValidationIssue}
                            />
                            </div>
                        )}

                        {/* Rule Inspector – toont info over de geselecteerde edge */}
                        {selectedLogicLink && (
                            <div className="flex-none">
                                <RuleInspectorPanel
                                    link={selectedLogicLink as any}
                                    onClose={() => setSelectedLogicLinkId(null)}

                                    // NEW: update the rule in the project when typing or applying autofix
                                    onUpdateCondition={(newCondition: string) => {
                                        const updatedLogic = (project.flow.logic || []).map((l: any) =>
                                            l.id === selectedLogicLink?.id
                                                ? { ...l, condition: newCondition }
                                                : l
                                        );

                                        updateProject({
                                            ...project,
                                            flow: {
                                                ...project.flow,
                                                logic: updatedLogic,
                                            },
                                        });
                                    }}

                                    // NEW: canonical context for rewrite suggestions
                                    context={buildAutoContextForExpression(selectedLogicLink?.condition || '')}
                                    
                                    // Debug rule (existing)
                                    onDebugRule={() => handleDebugRuleFromLink(selectedLogicLink)}
                                />

                            </div>
                        )}

                        {/* Condition Debugger – toont uitleg waarom TRUE/FALSE */}
                                        {selectedConditionTrace && (
                                        <div className="flex-1 min-h-[260px]">
<ConditionDebuggerPanel
    trace={selectedConditionTrace}
    onClose={() => setSelectedConditionTrace(null)}
    onApplyRewrite={handleApplyRuleRewrite}
    hideAutoFix={Boolean(selectedLogicLink)} // 👈 HET BELANGRIJKE STUK
/>


                                        </div>
                                        )}

                        </div>
                    )}
                </div>

                <ConsolePanel logs={logs} isOpen={isConsoleOpen} onToggle={() => setIsConsoleOpen(!isConsoleOpen)} onClear={() => setLogs([])} />

                {editingLink && (
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-xl shadow-xl w-96 animate-in zoom-in-95 duration-200">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Logic Link</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Condition</label>
                                    <input 
                                        type="text" 
                                        value={editingLink.condition}
                                        onChange={(e) => setEditingLink({...editingLink, condition: e.target.value})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                                        placeholder="variable == 'value'"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data Mapping (JSON)</label>
                                    <textarea
                                        value={editingLink.mapping || ''}
                                        onChange={(e) => setEditingLink({...editingLink, mapping: e.target.value})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm h-24"
                                        placeholder='{ "output.summary": "input.context" }'
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end space-x-2 mt-6">
                                <button onClick={() => setEditingLink(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                                <button onClick={saveCondition} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Apply</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          );
      }

      if (currentView === ViewState.AGENTS) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900">Agents</h1>
                    <button onClick={handleAddAgentNode} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        <Plus size={18} className="mr-2" /> Create Agent
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {project.agents.map(agent => (
                        <div key={agent.id} onClick={() => { setSelectedAgentId(agent.id); navigate(ViewState.WORKFLOW); }} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                             <div className="flex justify-between items-start mb-4">
                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-lg ${agent.role === 'Tool' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {agent.role === 'Tool' ? <Zap size={20} /> : agent.name.charAt(0)}
                                </div>
                                <span className="px-2 py-1 text-xs rounded-md font-medium border bg-slate-100 text-slate-600 border-slate-200">
                                    {agent.role}
                                </span>
                             </div>
                             <h3 className="text-lg font-bold text-slate-900">{agent.name}</h3>
                             <p className="text-sm text-slate-500 mb-4">{agent.model.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
      }

      if (currentView === ViewState.PROMPTS) {
        return (
            <div className="flex h-screen bg-slate-50">
                <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-bold text-slate-800">Prompt Files</h2>
                        <button onClick={handleCreatePrompt} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Plus size={18} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {Object.keys(project.prompts).map(filename => (
                            <div key={filename} onClick={() => setActivePromptFile(filename)} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer group ${activePromptFile === filename ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center truncate">
                                    <FileText size={16} className="mr-2 flex-shrink-0" />
                                    <span className="truncate">{filename}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeletePrompt(filename); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 flex flex-col">
                    {activePromptFile ? (
                        <>
                            <div className="h-14 bg-white border-b border-slate-200 flex justify-between items-center px-6">
                                <div className="flex items-center text-sm breadcrumbs text-slate-500">
                                    <span>prompts</span><span className="mx-2">/</span><span className="font-medium text-slate-900">{activePromptFile}</span>
                                    {isPromptDirty && <span className="ml-2 text-amber-500 text-xs font-medium">● Unsaved</span>}
                                </div>
                                <button onClick={handleSavePrompt} disabled={!isPromptDirty} className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isPromptDirty ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                                    <Save size={16} className="mr-2" /> Save Changes
                                </button>
                            </div>
                            <textarea className="flex-1 p-6 bg-white outline-none font-mono text-sm leading-relaxed text-slate-800 resize-none" value={promptContent} onChange={(e) => { setPromptContent(e.target.value); setIsPromptDirty(true); }} spellCheck={false} />
                        </>
                    ) : <div className="flex-1 flex items-center justify-center text-slate-400"><p>Select a file to edit</p></div>}
                </div>
            </div>
        );
      }

      if (currentView === ViewState.TOOLS) {
        return (
            <div className="p-8 max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900">Tool Registry</h1>
                    <button onClick={() => setIsToolModalOpen(true)} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm"><Plus size={18} className="mr-2" /> Register Tool</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.entries(project.tools).map(([key, tool]) => {
                        const t = tool as ToolDefinition;
                        return (
                        <div key={key} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">{t.type === 'http' ? <Globe size={20} /> : <Calculator size={20} />}</div>
                                <button onClick={() => handleDeleteTool(key)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">{key}</h3>
                            <p className="text-sm text-slate-600 mb-4">{t.description}</p>
                            {t.endpoint && <div className="text-xs font-mono text-slate-400 bg-slate-50 p-2 rounded truncate">{t.endpoint}</div>}
                        </div>
                    )})}
                </div>
                {isToolModalOpen && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-xl shadow-xl w-96">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Register New Tool</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Start from Template (Optional)</label>
                                    <select 
                                        value={newToolTemplate} 
                                        onChange={(e) => handleApplyTemplate(e.target.value)} 
                                        className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 text-slate-600"
                                    >
                                        <option value="">-- Manual Configuration --</option>
                                        <option value="weather_api">Weather API (HTTP)</option>
                                        <option value="calculator">Calculator (Builtin)</option>
                                        <option value="database_query">Database Query (HTTP)</option>
                                    </select>
                                </div>
                                <div className="border-t border-slate-100 my-2"></div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tool Name</label>
                                    <input value={newToolName} onChange={e => setNewToolName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. my_custom_tool" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                    <select value={newToolType} onChange={(e: any) => setNewToolType(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                                        <option value="http">HTTP API</option>
                                        <option value="builtin">Built-in</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end space-x-2 mt-6">
                                <button onClick={() => setIsToolModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button onClick={handleCreateTool} disabled={!newToolName} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">Create</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
      }

      if (currentView === ViewState.DEBUG) {
        return (
<DebugTraceView
  onJumpToAgent={handleJumpToAgentFromTrace}
  onHighlightPath={handleHighlightPathFromTrace}
  onHighlightPathAndOpen={handleHighlightPathAndOpenFromTrace}
  onFocusAgent={handleFocusAgentFromTrace}
/>

        );
      }

      if (currentView === ViewState.DOCS) {
          return <Documentation />;
      }

      // Default → Dashboard
      return (
            <Dashboard 
                project={project} 
                allProjects={sessions.map(s => {
                    const latest = s.history[s.historyIndex];
                    return { id: s.id, name: latest.metadata.name, version: latest.metadata.version, lastModified: s.lastModified };
                })}
                onSwitchProject={handleSwitchProject}
                onCreateProject={handleCreateProject}
                onCreateFromTemplate={handleOpenTemplateModal}
                onExport={handleSave}
            />
        );
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json,.aiflow" />
      <Sidebar currentView={currentView} onViewChange={navigate} project={project} />
      <main className="flex-1 ml-64 overflow-auto">
        {renderContent()}
      </main>

      {/* Save As Modal */}
      {showSaveAsModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-xl shadow-xl w-96 animate-in zoom-in-95">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Save Project As</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Filename (without extension)</label>
                          <input 
                              value={saveAsName} 
                              onChange={e => setSaveAsName(e.target.value)} 
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500" 
                              placeholder="MyNewFlow"
                              autoFocus
                          />
                      </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-6">
                      <button onClick={() => setShowSaveAsModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">Cancel</button>
                      <button onClick={handleSaveAs} disabled={!saveAsName} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50">Download</button>
                  </div>
              </div>
          </div>
      )}

      {/* ✅ Template Modal */}
      {isTemplateModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <FileText size={18} className="mr-2 text-indigo-500" />
                Create Project from Template
              </h3>
              <button onClick={() => setIsTemplateModalOpen(false)}>
                <X size={18} className="text-slate-400 hover:text-slate-700" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Choose a starter workflow. You can customize everything afterwards in the Workflow Builder.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => handleCreateProjectFromTemplate('customer_support')}
                className="border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all bg-slate-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                    <Box size={18} />
                  </div>
                  <span className="text-xs font-semibold text-indigo-600">
                    Recommended
                  </span>
                </div>
                <h4 className="font-semibold text-slate-900 text-sm mb-1">
                  Customer Support Flow
                </h4>
                <p className="text-xs text-slate-500">
                  Multi-agent support triage + response flow for tickets.
                </p>
              </button>

              <button
                onClick={() => handleCreateProjectFromTemplate('lead_qualification')}
                className="border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                    <Database size={18} />
                  </div>
                </div>
                <h4 className="font-semibold text-slate-900 text-sm mb-1">
                  Lead Qualification Flow
                </h4>
                <p className="text-xs text-slate-500">
                  Score and prioritize leads with multi-step logic.
                </p>
              </button>

              <button
                onClick={() => handleCreateProjectFromTemplate('marketing_content')}
                className="border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                    <Zap size={18} />
                  </div>
                </div>
                <h4 className="font-semibold text-slate-900 text-sm mb-1">
                  Marketing Content Flow
                </h4>
                <p className="text-xs text-slate-500">
                  Generate campaign ideas and drafts with structured agents.
                </p>
              </button>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Run Configuration Modal */}
      {runModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-900 flex items-center"><Play size={18} className="mr-2 text-emerald-600"/> Run Configuration</h3>
                      <button onClick={() => setRunModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      {!globalApiKey && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start">
                              <AlertTriangle size={14} className="mr-2 mt-0.5 flex-shrink-0" />
                              <p>No Global API Key found. You can enter one here for this session, or set it permanently in Settings.</p>
                          </div>
                      )}
                      
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                          <input 
                            type="password" 
                            value={globalApiKey} 
                            onChange={e => setGlobalApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-500 outline-none font-mono text-sm"
                          />
                      </div>

                      <div className="border-t border-slate-100 pt-4">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Input Variables</label>
                          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                              {Object.keys(runInputs).length === 0 && <p className="text-sm text-slate-400 italic">No variables defined in flow.json</p>}
                              {Object.entries(runInputs).map(([key, val]) => (
                                  <div key={key}>
                                      <label className="block text-xs text-slate-600 mb-1 font-mono">{key}</label>
                                      <input 
                                        value={val}
                                        onChange={e => setRunInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                      />
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2">
                      <button onClick={() => setRunModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-white rounded-lg transition-colors font-medium">Cancel</button>
                      <button onClick={handleStartExecution} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-bold flex items-center">
                          Start Execution
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
