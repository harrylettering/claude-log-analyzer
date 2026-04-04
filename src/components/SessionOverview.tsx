import { useMemo } from 'react';
import { MessageCircle, Settings, Clock, FileText, Zap, DollarSign } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { formatDuration, formatTokens } from '../utils/logParser';
import { PRICING } from '../constants';

interface SessionOverviewProps {
  data: ParsedLogData;
}

interface StatCard {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export function SessionOverview({ data }: SessionOverviewProps) {
  const { stats } = data;

  // 使用 useMemo 缓存卡片数据
  const cards: StatCard[] = useMemo(() => [
    {
      title: '总消息数',
      value: stats.totalMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: '用户消息',
      value: stats.userMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: '助手消息',
      value: stats.assistantMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: '工具调用',
      value: stats.toolCalls,
      icon: <Settings className="w-5 h-5" />,
      color: 'from-orange-500 to-amber-500',
    },
    {
      title: '会话时长',
      value: formatDuration(stats.sessionDuration),
      icon: <Clock className="w-5 h-5" />,
      color: 'from-indigo-500 to-blue-500',
    },
    {
      title: '总 Token',
      value: formatTokens(stats.totalTokens),
      icon: <Zap className="w-5 h-5" />,
      color: 'from-yellow-500 to-orange-500',
    },
    {
      title: '输入 Token',
      value: formatTokens(stats.inputTokens),
      icon: <FileText className="w-5 h-5" />,
      color: 'from-teal-500 to-cyan-500',
    },
    {
      title: '输出 Token',
      value: formatTokens(stats.outputTokens),
      icon: <FileText className="w-5 h-5" />,
      color: 'from-pink-500 to-rose-500',
    },
  ], [stats]);

  // 使用 useMemo 缓存成本计算
  const costCalculation = useMemo(() => {
    const inputCost = stats.inputTokens * (PRICING.INPUT_PER_MTOK / 1_000_000);
    const outputCost = stats.outputTokens * (PRICING.OUTPUT_PER_MTOK / 1_000_000);
    const totalCost = inputCost + outputCost;
    return { inputCost, outputCost, totalCost };
  }, [stats.inputTokens, stats.outputTokens]);

  // 辅助函数：获取图标颜色类名
  const getIconColorClass = (color: string) => {
    return color.replace('from-', 'text-').replace(' to-', '-500').split(' ')[0];
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">会话概览</h2>
        <p className="text-slate-400">完整的 Claude Code 会话统计信息</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div key={idx} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.color} opacity-10`}>
                <div className={getIconColorClass(card.color)}>
                  {card.icon}
                </div>
              </div>
            </div>
            <div className="text-2xl font-bold mb-1">{card.value}</div>
            <div className="text-slate-400 text-sm">{card.title}</div>
          </div>
        ))}
      </div>

      {/* 成本估算 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/10">
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold">成本估算</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">输入成本</div>
            <div className="text-xl font-semibold">${costCalculation.inputCost.toFixed(4)}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">输出成本</div>
            <div className="text-xl font-semibold">${costCalculation.outputCost.toFixed(4)}</div>
          </div>
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-4 border border-green-500/30">
            <div className="text-slate-400 text-sm mb-1">总计</div>
            <div className="text-xl font-semibold text-green-400">${costCalculation.totalCost.toFixed(4)}</div>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-3">
          * 基于 Claude 3.5 Sonnet 定价估算 (${PRICING.INPUT_PER_MTOK}/MTok 输入, ${PRICING.OUTPUT_PER_MTOK}/MTok 输出)
        </p>
      </div>

      {/* 使用的模型 */}
      {stats.modelsUsed.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">使用的模型</h3>
          <div className="flex flex-wrap gap-2">
            {stats.modelsUsed.map((model, idx) => (
              <span key={idx} className="px-3 py-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full text-sm border border-blue-500/30">
                {model}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
