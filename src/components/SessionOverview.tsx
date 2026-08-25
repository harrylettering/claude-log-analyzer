import { useMemo } from 'react';
import { MessageCircle, Settings, Clock, FileText, Zap, Database } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { formatDuration, formatTokens } from '../utils/logParser';

interface SessionOverviewProps {
  data: ParsedLogData;
}

interface StatCard {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

export function SessionOverview({ data }: SessionOverviewProps) {
  const { stats } = data;

  // Cache card data with useMemo.
  const cards: StatCard[] = useMemo(() => [
    {
      title: 'Total Messages',
      value: stats.totalMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'User Messages',
      value: stats.userMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-green-500 to-emerald-500',
      subtitle: 'Real user inputs only, excluding tool results',
    },
    {
      title: 'Assistant Messages',
      value: stats.assistantMessages,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Tool Calls',
      value: stats.toolCalls,
      icon: <Settings className="w-5 h-5" />,
      color: 'from-orange-500 to-amber-500',
    },
    {
      title: 'Session Duration',
      value: formatDuration(stats.sessionDuration),
      icon: <Clock className="w-5 h-5" />,
      color: 'from-indigo-500 to-blue-500',
    },
    {
      title: 'Total Tokens',
      value: formatTokens(stats.totalTokens),
      icon: <Zap className="w-5 h-5" />,
      color: 'from-yellow-500 to-orange-500',
      subtitle: 'Input, output and cached tokens combined',
    },
    {
      title: 'Input Tokens',
      value: formatTokens(stats.inputTokens),
      icon: <FileText className="w-5 h-5" />,
      color: 'from-teal-500 to-cyan-500',
      subtitle: 'Uncached input only — see Cached below',
    },
    {
      title: 'Output Tokens',
      value: formatTokens(stats.outputTokens),
      icon: <FileText className="w-5 h-5" />,
      color: 'from-pink-500 to-rose-500',
    },
    {
      // On a long session prompt caching carries almost all of the input, so
      // leaving it off the page made Total Tokens look two orders too small.
      title: 'Cached Tokens',
      value: formatTokens(stats.cacheReadTokens + stats.cacheWriteTokens),
      icon: <Database className="w-5 h-5" />,
      color: 'from-violet-500 to-purple-500',
      subtitle: `${formatTokens(stats.cacheReadTokens)} read · ${formatTokens(stats.cacheWriteTokens)} written`,
    },
  ], [stats]);

  // Helper for choosing the icon color class.
  const getIconColorClass = (color: string) => {
    return color.replace('from-', 'text-').replace(' to-', '-500').split(' ')[0];
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Session Overview</h2>
        <p className="text-slate-400">Complete statistics for this Claude Code session</p>
      </div>

      {/* Summary cards */}
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
            {card.subtitle && (
              <div className="text-slate-500 text-xs mt-1">{card.subtitle}</div>
            )}
          </div>
        ))}
      </div>

      {/* Models used */}
      {stats.modelsUsed.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Models Used</h3>
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
