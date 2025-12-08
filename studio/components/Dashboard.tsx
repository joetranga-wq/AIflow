import React from 'react';
import { AIFlowProject } from '../../core/types';
import { 
  Activity, 
  Zap, 
  Clock, 
  DollarSign, 
  ArrowUpRight, 
  Folder, 
  Plus, 
  FileText, 
  Calendar 
} from 'lucide-react';

interface DashboardProps {
  project: AIFlowProject;
  allProjects?: { id: string; name: string; version: string; lastModified: Date; }[];
  onSwitchProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onCreateFromTemplate?: () => void; // ✅ nieuw
  onExport: () => void;
}

const data = [
  { name: 'Mon', calls: 4000, cost: 2400 },
  { name: 'Tue', calls: 3000, cost: 1398 },
  { name: 'Wed', calls: 2000, cost: 9800 },
  { name: 'Thu', calls: 2780, cost: 3908 },
  { name: 'Fri', calls: 1890, cost: 4800 },
  { name: 'Sat', calls: 2390, cost: 3800 },
  { name: 'Sun', calls: 3490, cost: 4300 },
];

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-2">{value}</h3>
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-sm">
      <span className="text-emerald-500 font-medium flex items-center">
        <ArrowUpRight size={14} className="mr-1" /> {sub}
      </span>
      <span className="text-slate-400 ml-2">vs last week</span>
    </div>
  </div>
);

const SimpleBarChart = ({ data }: { data: any[] }) => {
  const maxVal = Math.max(...data.map(d => d.calls));
  return (
    <div className="w-full h-full flex items-end justify-between space-x-2 pt-4">
      {data.map((d, i) => {
        const height = (d.calls / maxVal) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center group">
            <div className="relative w-full flex items-end justify-center h-48 bg-slate-50 rounded-t-sm">
              <div
                style={{ height: `${height}%` }}
                className="w-4/5 bg-indigo-500 rounded-t-md transition-all duration-500 group-hover:bg-indigo-600"
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                  {d.calls}
                </div>
              </div>
            </div>
            <span className="text-xs text-slate-500 mt-2">{d.name}</span>
          </div>
        );
      })}
    </div>
  );
};

const SimpleLineChart = ({ data }: { data: any[] }) => {
  const maxVal = Math.max(...data.map(d => d.cost));
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.cost / maxVal) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="w-full h-full pt-4 relative">
      <div className="absolute inset-0 flex flex-col justify-between text-xs text-slate-300 pointer-events-none">
        {[100, 75, 50, 25, 0].map(p => (
          <div key={p} className="w-full border-b border-dashed border-slate-100 h-0" />
        ))}
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-48 overflow-visible"
      >
        <polyline
          fill="none"
          stroke="#10B981"
          strokeWidth="2"
          points={points}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * 100;
          const y = 100 - (d.cost / maxVal) * 100;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="1.5"
              fill="#10B981"
              stroke="white"
              strokeWidth="0.5"
              className="hover:r-2 transition-all"
            />
          );
        })}
      </svg>
      <div className="flex justify-between mt-2">
        {data.map((d, i) => (
          <span key={i} className="text-xs text-slate-500">
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({
  project,
  allProjects,
  onSwitchProject,
  onCreateProject,
  onCreateFromTemplate,
  onExport,
}) => {
  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-2">
            Overview of {project.metadata.name}
          </p>
        </div>
        <button
          onClick={onExport}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center"
        >
          <Zap size={16} className="mr-2" />
          Export .aiflow
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Executions"
          value="12,450"
          sub="12%"
          icon={Activity}
          color="bg-blue-500"
        />
        <StatCard
          title="Avg Latency"
          value="1.2s"
          sub="4%"
          icon={Clock}
          color="bg-indigo-500"
        />
        <StatCard
          title="Token Usage"
          value="8.4M"
          sub="2.1%"
          icon={Zap}
          color="bg-amber-500"
        />
        <StatCard
          title="Cost"
          value="$432.20"
          sub="0.8%"
          icon={DollarSign}
          color="bg-emerald-500"
        />
      </div>

      {allProjects && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center">
              <Folder size={20} className="mr-2 text-indigo-500" />
              My Projects
            </h3>
            <div className="flex items-center space-x-2">
              {onCreateFromTemplate && (
                <button
                  onClick={onCreateFromTemplate}
                  className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg"
                >
                  <FileText size={16} className="mr-1" />
                  New from template
                </button>
              )}
              {onCreateProject && (
                <button
                  onClick={onCreateProject}
                  className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  <Plus size={16} className="mr-1" /> New Project
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allProjects.map(p => (
              <div
                key={p.id}
                onClick={() => onSwitchProject && onSwitchProject(p.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                  p.id === project.metadata.name
                    ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg ${
                        p.id === project.metadata.name
                          ? 'bg-indigo-200 text-indigo-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <FileText size={18} />
                    </div>
                    <div>
                      <h4
                        className={`font-semibold text-sm ${
                          p.id === project.metadata.name
                            ? 'text-indigo-900'
                            : 'text-slate-800'
                        }`}
                      >
                        {p.name}
                      </h4>
                      <p className="text-xs text-slate-500">v{p.version}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs text-slate-400">
                  <Calendar size={12} className="mr-1" />
                  {p.lastModified.toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            Execution Volume
          </h3>
          <div className="flex-1">
            <SimpleBarChart data={data} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            Token Consumption
          </h3>
          <div className="flex-1">
            <SimpleLineChart data={data} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">
            Active Agents Status
          </h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Agent Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Model
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {project.agents.map(agent => (
              <tr
                key={agent.id}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {agent.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {agent.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {agent.model.name}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center">
                    <div
                      className={`h-2.5 w-2.5 rounded-full mr-2 ${
                        agent.executionStatus === 'running'
                          ? 'bg-blue-500 animate-pulse'
                          : agent.executionStatus === 'error'
                          ? 'bg-red-500'
                          : 'bg-emerald-500'
                      }`}
                    ></div>
                    <span
                      className={`font-medium ${
                        agent.executionStatus === 'running'
                          ? 'text-blue-700'
                          : agent.executionStatus === 'error'
                          ? 'text-red-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {agent.executionStatus === 'running'
                        ? 'Running'
                        : agent.executionStatus === 'error'
                        ? 'Error'
                        : 'Ready'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
