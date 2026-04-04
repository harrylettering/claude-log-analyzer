
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { formatDuration } from '../utils/logParser';

interface PerformanceViewProps {
  data: ParsedLogData;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];

export function PerformanceView({ data }: PerformanceViewProps) {
  const { turnDurations } = data;

  // 计算性能统计
  const durations = turnDurations.map(d => d.durationMs);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;

  // 识别慢查询（超过平均2倍的）
  const slowTurns = turnDurations.filter(d => d.durationMs > avgDuration * 2);

  const chartData = turnDurations.map((d, index) => ({
    turn: `轮次 ${index + 1}`,
    duration: d.durationMs,
    messageCount: d.messageCount,
    time: new Date(d.timestamp).toLocaleTimeString(),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-200 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.name === 'duration' ? formatDuration(entry.value) : entry.value}
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
        <h2 className="text-2xl font-bold mb-2">性能分析</h2>
        <p className="text-slate-400">分析响应时间和性能瓶颈</p>
      </div>

      {/* 性能统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-slate-400">平均响应</span>
          </div>
          <div className="text-3xl font-bold text-blue-400">{formatDuration(avgDuration)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Zap className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-slate-400">最快响应</span>
          </div>
          <div className="text-3xl font-bold text-green-400">{formatDuration(minDuration)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-slate-400">最慢响应</span>
          </div>
          <div className="text-3xl font-bold text-red-400">{formatDuration(maxDuration)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-slate-400">总轮次</span>
          </div>
          <div className="text-3xl font-bold text-purple-400">{turnDurations.length}</div>
        </div>
      </div>

      {/* 响应时间图表 */}
      {chartData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">响应时间分布</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="turn" stroke="#94a3b8" angle={-15} textAnchor="end" height={80} />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => `${value / 1000}s`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="duration" name="响应时间" radius={[8, 8, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.duration > avgDuration * 2 ? '#ef4444' : COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 慢查询警告 */}
      {slowTurns.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h3 className="text-lg font-semibold text-red-400">发现 {slowTurns.length} 个慢查询</h3>
          </div>
          <div className="space-y-3">
            {slowTurns.map((turn, index) => (
              <div key={index} className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">轮次 {index + 1}</span>
                    <span className="text-slate-400 text-sm ml-3">
                      {new Date(turn.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-400">{turn.messageCount} 条消息</span>
                    <span className="text-red-400 font-semibold">{formatDuration(turn.durationMs)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-slate-500 text-sm mt-4">
            * 慢查询定义为响应时间超过平均值 2 倍的轮次
          </p>
        </div>
      )}

      {turnDurations.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">此会话中没有性能数据</p>
        </div>
      )}
    </div>
  );
}
