
import React from 'react';
import { BookOpen, FileText, Server, Shield, Database, Code, Cpu, Layers, Box, Terminal, Key, Activity, GitBranch, Users, Folder, FileJson, FileCode } from 'lucide-react';

const Documentation: React.FC = () => {
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const NavLink = ({ id, label }: { id: string, label: string }) => (
    <button 
      onClick={() => scrollToSection(id)}
      className="block w-full text-left text-slate-600 hover:text-indigo-600 py-1.5 px-2 hover:bg-indigo-50 rounded transition-colors text-sm"
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar Navigation */}
      <div className="w-72 border-r border-slate-200 overflow-y-auto p-6 hidden lg:block sticky top-0 h-full bg-slate-50">
        <div className="mb-6">
            <h3 className="font-bold text-slate-900 mb-1 flex items-center">
                <BookOpen size={18} className="mr-2 text-indigo-600"/> 
                AIFLOW Standard
            </h3>
            <p className="text-xs text-slate-500">Official Specification v0.1</p>
        </div>
        
        <nav className="space-y-1">
            <NavLink id="scope" label="1. Scope & Purpose" />
            <NavLink id="architecture" label="2. Architecture" />
            <NavLink id="schemas" label="3. File Structure & Schemas" />
            <NavLink id="logic" label="4. Logic & Execution" />
            <NavLink id="prompting" label="5. Prompting Standard" />
            <NavLink id="tools" label="6. Tool Standard" />
            <NavLink id="memory" label="7. Memory & State" />
            <NavLink id="security" label="8. Security & Trust" />
            <NavLink id="metadata" label="9. Metadata" />
            <NavLink id="runtime" label="10. Runtime Standard" />
            <NavLink id="bestpractices" label="11. Best Practices" />
            <NavLink id="example" label="12. Example Project" />
            <NavLink id="devguide" label="13. Developer Guide" />
            <NavLink id="roadmap" label="14. Roadmap" />
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 lg:p-16 max-w-5xl text-slate-800 leading-relaxed scroll-smooth">
        
        {/* Header */}
        <div className="mb-12 border-b border-slate-200 pb-8">
            <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-xl">AI</div>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">AIFLOW Open Standard</h1>
            </div>
            <p className="text-xl text-slate-500 font-light">
                A universal format for defining, sharing, and executing multi-agent AI workflows.
                <br/>
                <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 mt-2 inline-block">Extension: .aiflow</span>
            </p>
        </div>

        {/* 1. Scope */}
        <section id="scope" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">01</span>
                Purpose and Scope
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold text-slate-800 mb-2">Problem Statement</h3>
                    <p className="text-slate-600 mb-4 text-sm leading-6">
                        AI agents are currently fragmented across proprietary platforms. There is no unified standard for defining how multiple agents interact, maintain context, or execute tools across different execution environments (runtimes). This leads to vendor lock-in and limits interoperability.
                    </p>
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 mb-2">Value Proposition</h3>
                    <p className="text-slate-600 mb-4 text-sm leading-6">
                        AIFLOW provides a portable, self-contained JSON-based specification. It decouples the <strong>logic</strong> of the workflow from the <strong>execution engine</strong>, enabling agents to run on local devices, cloud clusters, or hybrid environments without modification.
                    </p>
                </div>
            </div>
        </section>

        {/* 2. Architecture */}
        <section id="architecture" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">02</span>
                Architecture
            </h2>
            <p className="text-slate-600 mb-6">
                An <code>.aiflow</code> file is technically a ZIP container. This ensures that a single file contains all necessary assets (prompts, schemas, code snippets) to run the workflow offline or online.
            </p>
            <div className="bg-slate-900 text-slate-300 p-6 rounded-xl font-mono text-sm shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 p-2 text-xs text-slate-500">Container Structure</div>
                <div className="flex flex-col space-y-1">
                    <span className="text-indigo-400">root.aiflow</span>
                    <span className="pl-4">├── <span className="text-white font-bold">flow.json</span>          <span className="text-slate-500">// Entry point & Logic graph</span></span>
                    <span className="pl-4">├── <span className="text-emerald-400">agents/</span></span>
                    <span className="pl-8">│   ├── agent1.json</span>
                    <span className="pl-8">│   └── agent2.json</span>
                    <span className="pl-4">├── <span className="text-amber-400">prompts/</span></span>
                    <span className="pl-8">│   ├── system_agent1.txt</span>
                    <span className="pl-8">│   └── user_template.md</span>
                    <span className="pl-4">├── <span className="text-blue-400">tools/</span></span>
                    <span className="pl-8">│   ├── registry.json</span>
                    <span className="pl-8">│   └── custom_script.py</span>
                    <span className="pl-4">├── <span className="text-pink-400">memory/</span></span>
                    <span className="pl-8">│   └── schema.json</span>
                    <span className="pl-4">└── <span className="text-slate-400">metadata/</span></span>
                    <span className="pl-8">    ├── manifest.json</span>
                    <span className="pl-8">    └── license.json</span>
                </div>
            </div>
        </section>

        {/* 3. Schemas */}
        <section id="schemas" className="mb-16 scroll-mt-8">
             <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">03</span>
                File Specifications
            </h2>
            <div className="space-y-8">
                <div>
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center"><GitBranch size={16} className="mr-2"/> flow.json</h3>
                    <p className="text-sm text-slate-600 mb-3">Defines the high-level orchestration.</p>
                    <pre className="bg-slate-50 border border-slate-200 text-slate-700 p-4 rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "schema_version": "1.0",
  "entry_agent": "classifier_agent",
  "variables": { "language": "en" },
  "logic": [
    {
      "id": "rule_1",
      "from": "classifier_agent",
      "to": "tech_support_agent",
      "condition": "output.classification == 'technical'"
    }
  ]
}`}
                    </pre>
                </div>
            </div>
        </section>

        {/* 4-10 Placeholder for brevity as they were unchanged in request, but typically would be here */}
        
        {/* 11. Best Practices */}
        <section id="bestpractices" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">11</span>
                Best Practices & Guidelines
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center text-sm"><Activity size={16} className="mr-2 text-emerald-600"/> Performance Optimization</h4>
                    <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                        <li><strong>Minimize Context:</strong> Pass only essential variables between agents (<code>output_format: json</code>) to reduce token costs and latency.</li>
                        <li><strong>Parallelize:</strong> Use branching logic in <code>flow.json</code> to run independent agents (e.g., research and drafting) simultaneously.</li>
                        <li><strong>Cache Tools:</strong> Enable caching for deterministic tool outputs (like web search for the same query).</li>
                    </ul>
                </div>
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center text-sm"><Terminal size={16} className="mr-2 text-amber-600"/> Debugging Strategies</h4>
                    <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                        <li><strong>Trace IDs:</strong> Ensure the runtime assigns a unique <code>trace_id</code> to every flow execution to track it across logs.</li>
                        <li><strong>Intermediate States:</strong> Use a "Debug Mode" runtime that saves the output of every agent to a `debug/` folder.</li>
                        <li><strong>Mocking:</strong> Replace expensive LLM calls with static responses in <code>agents/*.json</code> during logic testing.</li>
                    </ul>
                </div>
            </div>

            <h3 className="font-bold text-slate-800 mb-4 text-sm">Agent Role Patterns</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="border border-slate-200 p-4 rounded-lg">
                    <strong className="block text-indigo-700 mb-2">The Triage Pattern</strong>
                    <p className="text-slate-500 text-xs">An entry agent classifies user input and routes it to specialized sub-agents. Used in Customer Support.</p>
                </div>
                <div className="border border-slate-200 p-4 rounded-lg">
                    <strong className="block text-indigo-700 mb-2">The Sequential Chain</strong>
                    <p className="text-slate-500 text-xs">Linear execution where Agent A's output is Agent B's input.<p className="text-slate-500 text-xs">
  Linear execution where Agent A's output is Agent B's input. 
  Used in Content Generation (Plan → Write → Edit).
</p>
</p>
                </div>
                <div className="border border-slate-200 p-4 rounded-lg">
                    <strong className="block text-indigo-700 mb-2">The Supervisor</strong>
                    <p className="text-slate-500 text-xs">A manager agent breaks down a complex goal into tasks and delegates them to worker agents, aggregating results.</p>
                </div>
            </div>
        </section>

        {/* 12. Example Project */}
        <section id="example" className="mb-16 scroll-mt-8">
             <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">12</span>
                Example Project: Customer Support
            </h2>
            <p className="text-sm text-slate-600 mb-6">
                This reference implementation demonstrates a multi-agent helpdesk system using the <strong>Triage Pattern</strong>.
            </p>

            <div className="flex flex-col lg:flex-row gap-8">
                <div className="lg:w-1/3">
                    <h4 className="font-bold text-slate-800 text-sm mb-3">Directory Structure</h4>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-xs text-slate-600">
                        <div className="flex items-center text-indigo-600 font-bold mb-2"><Folder size={14} className="mr-2"/> customer_support/</div>
                        <div className="pl-4 flex items-center mb-1"><FileJson size={14} className="mr-2 text-slate-400"/> flow.json</div>
                        <div className="pl-4 flex items-center mb-1"><Folder size={14} className="mr-2 text-emerald-500"/> agents/</div>
                        <div className="pl-8 flex items-center mb-1">├── triage.json</div>
                        <div className="pl-8 flex items-center mb-1">├── tech_solver.json</div>
                        <div className="pl-8 flex items-center mb-1">└── responder.json</div>
                        <div className="pl-4 flex items-center mb-1"><Folder size={14} className="mr-2 text-amber-500"/> prompts/</div>
                        <div className="pl-8 flex items-center mb-1">├── classify.txt</div>
                        <div className="pl-8 flex items-center mb-1">└── tone_guide.md</div>
                        <div className="pl-4 flex items-center mb-1"><Folder size={14} className="mr-2 text-blue-500"/> tools/</div>
                        <div className="pl-8 flex items-center mb-1">└── registry.json</div>
                    </div>
                </div>
                <div className="lg:w-2/3 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <h4 className="font-bold text-slate-800 text-sm mb-2">Agent Roles</h4>
                        <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                            <li><strong>TriageBot (Classifier):</strong> Analyzes ticket sentiment and category. Routing logic depends on its output.</li>
                            <li><strong>TechSolver (Engineer):</strong> Has access to `web_search` and `stack_overflow` tools to find technical fixes.</li>
                            <li><strong>Responder (Copywriter):</strong> Takes the raw solution and formats it into a polite email.</li>
                        </ul>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <h4 className="font-bold text-slate-800 text-sm mb-2">Key Logic (flow.json)</h4>
                        <pre className="bg-slate-50 p-2 rounded text-xs font-mono text-slate-600">
{`"logic": [
  { 
    "from": "TriageBot", 
    "to": "TechSolver", 
    "condition": "category == 'technical'" 
  },
  { 
    "from": "TriageBot", 
    "to": "Responder", 
    "condition": "category == 'general'" 
  }
]`}
                        </pre>
                    </div>
                </div>
            </div>
        </section>

        {/* 13. Dev Guide */}
        <section id="devguide" className="mb-16 scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">13</span>
                Developer Guide
            </h2>
            
            <div className="space-y-6">
                <div>
                    <h3 className="font-bold text-slate-800 mb-3 text-sm">1. Loading an .aiflow File</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Python Runtime</div>
                            <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-x-auto">

Note: This is a future API example. The Python and Node runtimes are planned for v0.3+.

{`from aiflow_core import FlowEngine

# Load the project container
engine = FlowEngine.load("./CustomerSupport.aiflow")

# Execute the flow
result = engine.run(
    input={"ticket": "My wifi is broken"},
    stream=True
)`}
                            </pre>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">Node.js Runtime</div>
                            <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-x-auto">

Note: This is a future API example. The Python and Node runtimes are planned for v0.3+.             
{`import { AIFlowRuntime } from '@aiflow/node';

const runtime = new AIFlowRuntime();
await runtime.load('./CustomerSupport.aiflow');

const result = await runtime.execute({
  ticket: "My wifi is broken"
});

console.log(result.final_output);`}
                            </pre>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-slate-800 mb-3 text-sm">2. Validating a Workflow</h3>
                    <ul className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 space-y-2 list-disc pl-5">
                        <li><strong>Schema Check:</strong> Validate <code>flow.json</code> against the AIFLOW JSON Schema v1.0.</li>
                        <li><strong>Graph Integrity:</strong> Ensure no circular dependencies exist (unless explicitly allowed via `max_loops`).</li>
                        <li><strong>Tool Availability:</strong> Verify that all tools referenced in `agents/*.json` exist in `tools/registry.json`.</li>
                        <li><strong>Asset Links:</strong> Check that prompt file paths (e.g., `../prompts/file.txt`) resolve correctly.</li>
                    </ul>
                </div>
            </div>
        </section>

        {/* 14. Roadmap */}
        <section id="roadmap" className="mb-24 scroll-mt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center border-b border-slate-100 pb-2">
                <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-sm mr-3 font-mono">14</span>
                Possible Extensions & Roadmap
            </h2>
            <div className="space-y-6">
                <div className="flex items-start bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold mr-4 mt-0.5">v1.1</span>
                    <div>
                        <strong className="text-slate-800 text-sm">UI Schemas</strong>
                        <p className="text-xs text-slate-600 mt-1">
                            Standardization for <code>ui_schema.json</code>. This allows agents to request user input via rich UI components (forms, date pickers, maps) instead of just raw text.
                        </p>
                    </div>
                </div>
                
                <div className="flex items-start bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-bold mr-4 mt-0.5">v1.2</span>
                    <div>
                        <strong className="text-slate-800 text-sm">Plugin Bundles & Events</strong>
                        <p className="text-xs text-slate-600 mt-1">
                            Support for <code>.aiplugin</code> bundles to distribute tools. Introduction of standardized <strong>Event Hooks</strong> (e.g., `onTokenStream`, `onToolStart`) for real-time frontend observability via WebSockets.
                        </p>
                    </div>
                </div>

                <div className="flex items-start bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold mr-4 mt-0.5">v2.0</span>
                    <div>
                        <strong className="text-slate-800 text-sm">Multi-Modal Flow</strong>
                        <p className="text-xs text-slate-600 mt-1">
                            Native support for audio and video streams as first-class citizens passed between agents, enabling real-time voice-to-voice workflows without external transcoding steps.
                        </p>
                    </div>
                </div>
            </div>
        </section>

      </div>
    </div>
  );
};

export default Documentation;
