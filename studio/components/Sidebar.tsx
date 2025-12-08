
import React from 'react';
import { LayoutDashboard, Network, Users, Terminal, Wrench, Settings, Box, BookOpen, HardDrive } from 'lucide-react';
import { ViewState, AIFlowProject } from '../../core/types';

interface SidebarProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
  project: AIFlowProject;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, project }) => {
  const menuItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.WORKFLOW, label: 'Workflow Builder', icon: Network },
    { id: ViewState.AGENTS, label: 'Agents', icon: Users },
    { id: ViewState.MEMORY, label: 'Memory', icon: HardDrive },
    { id: ViewState.PROMPTS, label: 'Prompts', icon: Terminal },
    { id: ViewState.TOOLS, label: 'Tools', icon: Wrench },
    { id: ViewState.SETTINGS, label: 'Project Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 z-10 shadow-sm">
      <div className="p-6 flex items-center space-x-2 border-b border-slate-100">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
          AI
        </div>
        <span className="text-xl font-bold text-slate-800 tracking-tight">AIFLOW</span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="mb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Studio</div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="mt-8 mb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Resources</div>
        <button
            onClick={() => onViewChange(ViewState.DOCS)}
            className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
            currentView === ViewState.DOCS
                ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
        >
            <BookOpen size={18} className={currentView === ViewState.DOCS ? 'text-indigo-600' : 'text-slate-400'} />
            <span>Documentation</span>
        </button>
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-2 mb-2">
                <Box size={16} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Current Project</span>
            </div>
            <p className="text-sm font-medium text-slate-900 truncate" title={project.metadata.name}>
                {project.metadata.name}.aiflow
            </p>
            <div className="flex items-center mt-2 space-x-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                <span className="text-xs text-slate-500">v{project.metadata.version} • Synced</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;