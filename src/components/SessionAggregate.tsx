import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  Plus,
  X,
  BarChart3,
  Zap,
  Settings,
  Clock,
  FileText,
  DollarSign,
  MessageSquare,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import type { ParsedLogData } from '../types/log';
import type { LoadedSession, AggregateAnalysisResult } from '../types/aggregate';
import { parseLog, formatTokens, formatDuration } from '../utils/logParser';
import { createLoadedSession, aggregateSessions } from '../utils/aggregateEngine';
import { useBudgetContext } from '../contexts/BudgetContext';
import { BudgetProgress } from './BudgetProgress';
import { PRICING } from '../constants';

interface SessionAggregateProps {
  defaultSession?: ParsedLogData;
}

// 格式化成本显示
function formatCost(cost: number): string {
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}

// 统计卡片组件
function AggregateStatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-slate-400">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-sm text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

// 会话列表项组件
function SessionListItem({
  session,
  onRemove,
}: {
  session: LoadedSession;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{session.name}</div>
          <div className="text-xs text-slate-500">
            {session.data.stats.totalMessages} 条消息 · {formatTokens(session.data.stats.totalTokens)} Tokens
          </div>
        </div>
      </div>
      <button
        onClick={() => onRemove(session.id)}
        className="p-1 hover:bg-slate-700 rounded flex-shrink-0"
      >
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>
  );
}

// 会话对比表格
function SessionComparisonTable({ result }: { result: AggregateAnalysisResult }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          各会话详情对比
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="text-left p-3 text-slate-400 font-medium">会话</th>
              <th className="text-right p-3 text-slate-400 font-medium">消息</th>
              <th className="text-right p-3 text-slate-400 font-medium">工具调用</th>
              <th className="text-right p-3 text-slate-400 font-medium">Tokens</th>
              <th className="text-right p-3 text-slate-400 font-medium">成本</th>
              <th className="text-right p-3 text-slate-400 font-medium">时长</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {result.sessionComparisons.map((row) => (
              <tr key={row.sessionId} className="hover:bg-slate-700/30">
                <td className="p-3 font-medium truncate max-w-[200px]">{row.sessionName}</td>
                <td className="p-3 text-right text-slate-300">{row.totalMessages}</td>
                <td className="p-3 text-right text-slate-300">{row.toolCalls}</td>
                <td className="p-3 text-right text-slate-300">{formatTokens(row.totalTokens)}</td>
                <td className="p-3 text-right text-slate-300">{formatCost(row.estimatedCost)}</td>
                <td className="p-3 text-right text-slate-300">{formatDuration(row.duration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Token 趋势图表
function TokenTrendChart({ result }: { result: AggregateAnalysisResult }) {
  const chartData = result.tokenTrends.map((t) => ({
    name: t.sessionName.length > 15 ? t.sessionName.slice(0, 15) + '...' : t.sessionName,
    输入: t.inputTokens,
    输出: t.outputTokens,
    总计: t.totalTokens,
    sessionId: t.sessionId,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-200 font-semibold mb-2">{label}</p>
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

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5" />
        Token 使用趋势
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94a3b8" angle={-15} textAnchor="end" height={80} />
          <YAxis stroke="#94a3b8" tickFormatter={(value) => formatTokens(value)} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="总计" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} name="总计" />
          <Bar dataKey="输入" stackId="b" fill="#3b82f6" radius={[4, 4, 0, 0]} name="输入" />
          <Bar dataKey="输出" stackId="b" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="输出" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 工具使用聚合图表
function ToolUsageChart({ result }: { result: AggregateAnalysisResult }) {
  const chartData = result.aggregatedTools.slice(0, 10).map((tool) => ({
    name: tool.name.length > 12 ? tool.name.slice(0, 12) + '...' : tool.name,
    调用次数: tool.totalCalls,
    成功率: Math.round(tool.successRate * 100),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-200 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.name === '成功率' ? `${entry.value}%` : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Settings className="w-5 h-5" />
        工具使用统计 (Top 10)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94a3b8" angle={-15} textAnchor="end" height={80} />
          <YAxis stroke="#94a3b8" yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar yAxisId="left" dataKey="调用次数" fill="#3b82f6" radius={[4, 4, 0, 0]} name="调用次数" />
          <Bar yAxisId="right" dataKey="成功率" fill="#10b981" radius={[4, 4, 0, 0]} name="成功率(%)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 成本趋势图表
function CostTrendChart({ result }: { result: AggregateAnalysisResult }) {
  const chartData = result.tokenTrends.map((t) => ({
    name: t.sessionName.length > 15 ? t.sessionName.slice(0, 15) + '...' : t.sessionName,
    成本: t.estimatedCost,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
          <p className="text-slate-200 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatCost(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5" />
        成本趋势
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" tickFormatter={(value) => formatCost(value)} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="成本" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" name="成本" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 计算单个会话成本
function calculateSessionCost(stats: { inputTokens: number; outputTokens: number }): number {
  const inputCost = stats.inputTokens * (PRICING.INPUT_PER_MTOK / 1_000_000);
  const outputCost = stats.outputTokens * (PRICING.OUTPUT_PER_MTOK / 1_000_000);
  return inputCost + outputCost;
}

export function SessionAggregate({ defaultSession }: SessionAggregateProps) {
  const [sessions, setSessions] = useState<LoadedSession[]>(() => {
    if (defaultSession) {
      return [createLoadedSession(defaultSession, '当前会话')];
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const { updateSessionCost, removeSessionCost, budgetUsage, currentBudget } = useBudgetContext();

  // 聚合分析结果（缓存）
  const aggregateResult = useMemo(() => {
    if (sessions.length === 0) return null;
    return aggregateSessions(sessions);
  }, [sessions]);

  // 更新会话成本到预算管理器
  useEffect(() => {
    sessions.forEach(session => {
      const cost = calculateSessionCost(session.data.stats);
      updateSessionCost(session.id, cost);
    });
    return () => {
      sessions.forEach(session => {
        removeSessionCost(session.id);
      });
    };
  }, [sessions, updateSessionCost, removeSessionCost]);

  // 处理文件上传
  const handleFileUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.log';
    input.multiple = true;

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      setLoading(true);

      try {
        const newSessions: LoadedSession[] = [];

        for (const file of Array.from(files)) {
          try {
            const content = await file.text();
            const result = parseLog(content);
            newSessions.push(createLoadedSession(result.data, file.name));
          } catch (err) {
            console.error(`Failed to parse ${file.name}:`, err);
          }
        }

        if (newSessions.length > 0) {
          setSessions((prev) => [...prev, ...newSessions]);
        }
      } finally {
        setLoading(false);
      }
    };

    input.click();
  }, []);

  // 移除会话
  const handleRemoveSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // 清空所有会话
  const handleClearAll = useCallback(() => {
    setSessions([]);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <TrendingUp className="w-6 h-6" />
          多会话聚合分析
        </h2>
        <p className="text-slate-400">加载多个会话进行聚合分析，发现趋势和模式</p>
      </div>

      {/* 会话管理区域 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            已加载会话 ({sessions.length})
          </h3>
          <div className="flex gap-2">
            {sessions.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-slate-600 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
                清空全部
              </button>
            )}
            <button
              onClick={handleFileUpload}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              添加会话
            </button>
          </div>
        </div>

        {sessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                onRemove={handleRemoveSession}
              />
            ))}
          </div>
        ) : (
          <button
            onClick={handleFileUpload}
            disabled={loading}
            className="w-full py-12 border-2 border-dashed border-slate-600 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="text-slate-400">加载中...</div>
            ) : (
              <div className="text-slate-400">
                <Plus className="w-8 h-8 mx-auto mb-2" />
                点击或拖拽上传会话文件
              </div>
            )}
          </button>
        )}
      </div>

      {/* 聚合分析结果 */}
      {aggregateResult && sessions.length > 0 && (
        <div className="space-y-6">
          {/* 聚合概览卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AggregateStatCard
              label="总会话数"
              value={aggregateResult.aggregateStats.totalSessions}
              icon={FileText}
              colorClass="bg-blue-500/10"
            />
            <AggregateStatCard
              label="总消息数"
              value={aggregateResult.aggregateStats.totalMessages}
              icon={MessageSquare}
              colorClass="bg-purple-500/10"
              subtitle={`平均 ${aggregateResult.aggregateStats.avgMessagesPerSession.toFixed(1)} 条/会话`}
            />
            <AggregateStatCard
              label="总 Tokens"
              value={formatTokens(aggregateResult.aggregateStats.totalTokens)}
              icon={Zap}
              colorClass="bg-amber-500/10"
              subtitle={`平均 ${formatTokens(aggregateResult.aggregateStats.avgTokensPerSession)}/会话`}
            />
            <AggregateStatCard
              label="总成本"
              value={formatCost(aggregateResult.aggregateStats.totalEstimatedCost)}
              icon={DollarSign}
              colorClass="bg-green-500/10"
              subtitle={`平均 ${formatCost(aggregateResult.aggregateStats.avgCostPerSession)}/会话`}
            />
          </div>

          {/* 预算进度 */}
          {currentBudget > 0 && (
            <BudgetProgress usage={budgetUsage} />
          )}

          {/* 第二行统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AggregateStatCard
              label="总工具调用"
              value={aggregateResult.aggregateStats.totalToolCalls}
              icon={Settings}
              colorClass="bg-slate-500/10"
              subtitle={`平均 ${aggregateResult.aggregateStats.avgToolCallsPerSession.toFixed(1)} 次/会话`}
            />
            <AggregateStatCard
              label="总时长"
              value={formatDuration(aggregateResult.aggregateStats.totalDuration)}
              icon={Clock}
              colorClass="bg-pink-500/10"
              subtitle={`平均 ${formatDuration(aggregateResult.aggregateStats.avgDurationPerSession)}/会话`}
            />
            <AggregateStatCard
              label="使用模型"
              value={aggregateResult.aggregateStats.allModels.length}
              icon={Settings}
              colorClass="bg-cyan-500/10"
              subtitle={aggregateResult.aggregateStats.allModels.join(', ')}
            />
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TokenTrendChart result={aggregateResult} />
            <ToolUsageChart result={aggregateResult} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CostTrendChart result={aggregateResult} />
            {/* 极值信息卡片 */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                关键指标
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div>
                    <div className="text-sm text-slate-400">最多消息</div>
                    <div className="text-sm font-medium truncate max-w-[150px]">
                      {aggregateResult.aggregateStats.maxMessagesInSession.sessionName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-400">
                      {aggregateResult.aggregateStats.maxMessagesInSession.value}
                    </div>
                    <div className="text-xs text-slate-500">条</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div>
                    <div className="text-sm text-slate-400">最多 Tokens</div>
                    <div className="text-sm font-medium truncate max-w-[150px]">
                      {aggregateResult.aggregateStats.maxTokensInSession.sessionName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-amber-400">
                      {formatTokens(aggregateResult.aggregateStats.maxTokensInSession.value)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div>
                    <div className="text-sm text-slate-400">最高成本</div>
                    <div className="text-sm font-medium truncate max-w-[150px]">
                      {aggregateResult.aggregateStats.maxCostInSession.sessionName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-400">
                      {formatCost(aggregateResult.aggregateStats.maxCostInSession.value)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 会话对比表格 */}
          <SessionComparisonTable result={aggregateResult} />
        </div>
      )}
    </div>
  );
}
