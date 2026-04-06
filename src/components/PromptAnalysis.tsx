import { useMemo } from 'react';
import { AlertCircle, CheckCircle2, TrendingUp, MessageSquare } from 'lucide-react';
import type { PromptAnalysis as PromptAnalysisType } from '../types/prompt';
import { ISSUE_TYPE_LABELS, SEVERITY_COLORS, SEVERITY_LABELS } from '../types/prompt';

interface PromptAnalysisProps {
  analysis: PromptAnalysisType;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function PromptAnalysis({ analysis }: PromptAnalysisProps) {
  const { stats, issues, bestPractices, score } = analysis;

  const issueGroups = useMemo(() => {
    const groups: Record<string, typeof issues> = {};
    issues.forEach((issue) => {
      if (!groups[issue.severity]) {
        groups[issue.severity] = [];
      }
      groups[issue.severity].push(issue);
    });
    return groups;
  }, [issues]);

  return (
    <div className="space-y-6">
      {/* 总体评分卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-4">
            {/* 评分圆环 */}
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#334155"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke={`url(#score-gradient-${score})`}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${score * 2.2} 220`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id={`score-gradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444'} />
                    <stop offset="100%" stopColor={score >= 80 ? '#10b981' : score >= 60 ? '#eab308' : score >= 40 ? '#ef4444' : '#dc2626'} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                  {score}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold">提示词质量</h3>
              <p className="text-slate-400 text-sm">
                {score >= 80 ? '优秀' : score >= 60 ? '良好' : score >= 40 ? '需改进' : '较差'}
              </p>
            </div>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-3">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold">提示词统计</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">总提示词数</span>
              <span className="font-medium">{stats.totalPrompts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">平均长度</span>
              <span className="font-medium">{stats.avgPromptLength} 字符</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">总 Token 估算</span>
              <span className="font-medium">{stats.totalTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 成功率 */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold">交互效率</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">成功率</span>
              <span className={`font-medium ${stats.successRate >= 80 ? 'text-green-400' : stats.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {stats.successRate}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">平均重试</span>
              <span className="font-medium">{stats.avgRetries.toFixed(2)} 次</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">工具调用成功率</span>
              <span className={`font-medium ${stats.toolCallSuccessRate >= 90 ? 'text-green-400' : stats.toolCallSuccessRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                {stats.toolCallSuccessRate}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 问题列表 */}
      {issues.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold">发现的问题</h3>
            <span className="px-2 py-0.5 bg-slate-700 rounded-full text-sm text-slate-300">
              {issues.length}
            </span>
          </div>

          <div className="space-y-4">
            {(['critical', 'high', 'medium', 'low'] as const).map((severity) => {
              const severityIssues = issueGroups[severity];
              if (!severityIssues || severityIssues.length === 0) return null;

              return (
                <div key={severity} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[severity]}`}>
                      {SEVERITY_LABELS[severity]}
                    </span>
                    <span className="text-slate-400 text-sm">{severityIssues.length} 个问题</span>
                  </div>
                  <div className="space-y-2 ml-2">
                    {severityIssues.map((issue) => (
                      <div key={issue.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium">{issue.title}</span>
                              <span className="text-xs text-slate-400">
                                {ISSUE_TYPE_LABELS[issue.type]}
                              </span>
                            </div>
                            <p className="text-slate-300 text-sm mb-2">{issue.description}</p>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3">
                              <p className="text-blue-300 text-sm">
                                <span className="font-medium">建议：</span>
                                {issue.suggestion}
                              </p>
                            </div>
                          </div>
                          <div className="text-sm text-slate-500 shrink-0">
                            #{issue.location.entryIndex + 1}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 最佳实践 */}
      {bestPractices.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold">最佳实践建议</h3>
          </div>
          <ul className="space-y-2">
            {bestPractices.map((practice, index) => (
              <li key={index} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <span className="text-slate-300">{practice}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
