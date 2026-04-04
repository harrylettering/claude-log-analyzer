import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Zap, ArrowUp, ArrowDown } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { formatTokens } from '../utils/logParser';

interface TokenDashboardProps {
  data: ParsedLogData;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
        <p className="text-slate-400 text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatTokens(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function TokenDashboard({ data }: TokenDashboardProps) {
  const { tokenUsage, stats } = data;

  // 使用 useMemo 缓存累计数据计算
  const cumulativeData = useMemo(() => {
    return tokenUsage.reduce((acc, curr, index) => {
      const prev = acc[index - 1] || { cumulativeInput: 0, cumulativeOutput: 0, cumulativeTotal: 0 };
      acc.push({
        ...curr,
        time: new Date(curr.timestamp).toLocaleTimeString(),
        cumulativeInput: prev.cumulativeInput + curr.inputTokens,
        cumulativeOutput: prev.cumulativeOutput + curr.outputTokens,
        cumulativeTotal: prev.cumulativeTotal + curr.totalTokens,
      });
      return acc;
    }, [] as Array<any>);
  }, [tokenUsage]);

  // 使用 useMemo 缓存每次请求的数据
  const perRequestData = useMemo(() => {
    return tokenUsage.map(d => ({ ...d, time: new Date(d.timestamp).toLocaleTimeString() }));
  }, [tokenUsage]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Token 使用统计</h2>
        <p className="text-slate-400">详细的 Token 消耗分析</p>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <ArrowDown className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-slate-400">输入 Token</span>
          </div>
          <div className="text-3xl font-bold text-blue-400">{formatTokens(stats.inputTokens)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <ArrowUp className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-slate-400">输出 Token</span>
          </div>
          <div className="text-3xl font-bold text-purple-400">{formatTokens(stats.outputTokens)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-slate-400">总计 Token</span>
          </div>
          <div className="text-3xl font-bold text-amber-400">{formatTokens(stats.totalTokens)}</div>
        </div>
      </div>

      {/* 每次请求的 Token 使用 */}
      {tokenUsage.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">每次请求的 Token 使用</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perRequestData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => formatTokens(value)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="inputTokens" stroke="#3b82f6" strokeWidth={2} name="输入" />
              <Line type="monotone" dataKey="outputTokens" stroke="#8b5cf6" strokeWidth={2} name="输出" />
              <Line type="monotone" dataKey="totalTokens" stroke="#f59e0b" strokeWidth={2} name="总计" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 累计 Token 使用 */}
      {cumulativeData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">累计 Token 使用</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeData}>
              <defs>
                <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => formatTokens(value)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="cumulativeInput" stroke="#3b82f6" fillOpacity={1} fill="url(#colorInput)" name="累计输入" />
              <Area type="monotone" dataKey="cumulativeOutput" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorOutput)" name="累计输出" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {tokenUsage.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">此会话中没有找到 Token 使用数据</p>
        </div>
      )}
    </div>
  );
}
