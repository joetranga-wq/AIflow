
import React, { useEffect, useRef } from 'react';
import { X, Terminal, ChevronDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { LogEntry } from '../../runtime/browser/WorkflowRunner';

interface ConsolePanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
}

const ConsolePanel: React.FC<ConsolePanelProps> = ({ logs, isOpen, onToggle, onClear }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const getIcon = (level: string) => {
    switch (level) {
      case 'info': return <Info size={14} className="text-blue-400" />;
      case 'success': return <CheckCircle size={14} className="text-emerald-400" />;
      case 'warn': return <AlertTriangle size={14} className="text-amber-400" />;
      case 'error': return <X size={14} className="text-red-400" />;
      default: return <Terminal size={14} className="text-slate-400" />;
    }
  };

  const getTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date(ts).getMilliseconds().toString().padStart(3, '0');
  };

  if (!isOpen) {
    return (
      <button 
        onClick={onToggle}
        className="absolute bottom-6 right-6 bg-slate-900 text-white p-3 rounded-full shadow-lg hover:bg-slate-800 transition-all flex items-center z-40 border border-slate-700"
      >
        <Terminal size={20} />
        {logs.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border border-slate-900">
                {logs.length}
            </span>
        )}
      </button>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 h-72 bg-slate-950 text-slate-300 font-mono text-xs border-t border-slate-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-bottom-10 duration-200">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Terminal size={14} className="text-indigo-400" />
          <span className="font-bold text-slate-200">Execution Console</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px]">{logs.length} events</span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={onClear} className="px-2 py-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">Clear</button>
          <button onClick={onToggle} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <p>Ready to run.</p>
                <p className="text-[10px] mt-1">Click the "Run" button in the workflow builder.</p>
            </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="group">
            <div className="flex items-start space-x-3 hover:bg-slate-900/50 p-1 -mx-1 rounded">
                <span className="text-slate-600 flex-shrink-0 w-20 pt-0.5">{getTime(log.timestamp)}</span>
                <div className="pt-0.5">{getIcon(log.level)}</div>
                <div className="flex-1 break-words">
                    <div className="flex items-baseline">
                        {log.agentId && <span className="text-indigo-400 font-bold mr-2">[{log.agentId}]</span>}
                        <span className={log.level === 'error' ? 'text-red-300' : log.level === 'success' ? 'text-emerald-300' : 'text-slate-300'}>
                            {log.message}
                        </span>
                    </div>
                    {log.details && (
                        <pre className="mt-2 bg-slate-900 p-2 rounded border border-slate-800 text-slate-400 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default ConsolePanel;
