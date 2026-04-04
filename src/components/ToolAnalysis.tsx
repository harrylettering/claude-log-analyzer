
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Settings, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { formatDuration } from '../utils/logParser';

interface ToolAnalysisProps {
  data: ParsedLogData;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function ToolAnalysis({ data }: ToolAnalysisProps) {
  const { toolCalls } = data;
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // 统计工具使用频率
  const toolStats = toolCalls.reduce((acc, tool) => {
    const existing = acc.find(t => t.name === tool.name);
    if (existing) {
      existing.count++;
      existing.totalDuration += tool.durationMs || 0;
      if (tool.isError) existing.errors++;
    } else {
      acc.push({
        name: tool.name,
        count: 1,
        totalDuration: tool.durationMs || 0,
        errors: tool.isError ? 1 : 0,
      });
    }
    return acc;
  }, [] as Array<{ name: string; count: number; totalDuration: number; errors: number }>);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTools(newExpanded);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-200 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">工具使用分析</h2>
        <p className="text-slate-400">详细的工具调用统计和分析</p>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Settings className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-slate-400">总调用次数</span>
          </div>
          <div className="text-3xl font-bold text-blue-400">{toolCalls.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Settings className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-slate-400">工具种类</span>
          </div>
          <div className="text-3xl font-bold text-purple-400">{toolStats.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-slate-400">成功</span>
          </div>
          <div className="text-3xl font-bold text-green-400">{toolCalls.filter(t => !t.isError).length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-slate-400">失败</span>
          </div>
          <div className="text-3xl font-bold text-red-400">{toolCalls.filter(t => t.isError).length}</div>
        </div>
      </div>

      {/* 工具使用频率图表 */}
      {toolStats.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">工具使用频率</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={toolStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" angle={-15} textAnchor="end" height={80} />
              <YAxis stroke="#94a3b8" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="count" name="调用次数" radius={[8, 8, 0, 0]}>
                {toolStats.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 工具调用列表 */}
      {toolCalls.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">工具调用详情</h3>
          <div className="space-y-3">
            {toolCalls.map((tool, index) => (
              <div key={tool.id || index} className="border border-slate-700 rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 bg-slate-700/50 cursor-pointer"
                  onClick={() => toggleExpand(tool.id || index.toString())}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${tool.isError ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                      {tool.isError ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">{tool.name}</div>
                      <div className="text-slate-400 text-sm">
                        {new Date(tool.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {tool.durationMs && (
                      <span className="text-slate-400 text-sm">{formatDuration(tool.durationMs)}</span>
                    )}
                    {expandedTools.has(tool.id || index.toString()) ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>
                {expandedTools.has(tool.id || index.toString()) && (
                  <div className="p-4 border-t border-slate-700 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-400 mb-2">输入</h4>
                      <pre className="bg-slate-900 p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(tool.input, null, 2)}
                      </pre>
                    </div>
                    {tool.result !== undefined && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-400 mb-2">输出</h4>
                        <pre className="bg-slate-900 p-3 rounded text-xs overflow-auto max-h-48">
                          {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {toolCalls.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <Settings className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">此会话中没有工具调用</p>
        </div>
      )}
    </div>
  );
}
