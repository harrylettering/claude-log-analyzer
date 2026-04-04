import { useMemo } from 'react';
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Zap,
  Clock,
  Settings,
  TrendingUp,
  Award,
  Target,
  BarChart3,
} from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import type { AnalysisResult, Insight, Severity, AnalysisCategory } from '../types/analysis';
import { analyzeSession } from '../utils/analysisEngine';
import { formatDuration, formatTokens } from '../utils/logParser';

interface AIAnalysisProps {
  data: ParsedLogData;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  error: 'text-red-400 bg-red-500/10 border-red-500/30',
  critical: 'text-red-500 bg-red-500/15 border-red-500/50',
};

const SEVERITY_ICONS: Record<Severity, React.ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  critical: <AlertTriangle className="w-4 h-4" />,
};

const CATEGORY_LABELS: Record<AnalysisCategory, string> = {
  performance: '性能',
  token_usage: 'Token 使用',
  tool_calls: '工具调用',
  errors: '错误',
  patterns: '模式',
  suggestions: '建议',
  summary: '总结',
};

const GRADE_COLORS: Record<AnalysisResult['summary']['overallGrade'], string> = {
  A: 'text-green-400 bg-green-500/20 border-green-500/50',
  B: 'text-blue-400 bg-blue-500/20 border-blue-500/50',
  C: 'text-amber-400 bg-amber-500/20 border-amber-500/50',
  D: 'text-orange-400 bg-orange-500/20 border-orange-500/50',
  F: 'text-red-400 bg-red-500/20 border-red-500/50',
};

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`p-4 rounded-lg border ${SEVERITY_COLORS[insight.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {SEVERITY_ICONS[insight.severity]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50">
              {CATEGORY_LABELS[insight.category]}
            </span>
            <h4 className="font-semibold">{insight.title}</h4>
          </div>
          <p className="text-sm text-slate-300">{insight.description}</p>
          {insight.details && (
            <p className="text-xs text-slate-400 mt-2">{insight.details}</p>
          )}
          {insight.suggestions && insight.suggestions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-400 mb-1">建议:</p>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {insight.suggestions.map((suggestion, idx) => (
                  <li key={idx}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIAnalysis({ data }: AIAnalysisProps) {
  const analysis = useMemo(() => analyzeSession(data), [data]);

  const insightsBySeverity = useMemo(() => {
    const critical = analysis.insights.filter(i => i.severity === 'critical');
    const errors = analysis.insights.filter(i => i.severity === 'error');
    const warnings = analysis.insights.filter(i => i.severity === 'warning');
    const infos = analysis.insights.filter(i => i.severity === 'info');
    return { critical, errors, warnings, infos };
  }, [analysis.insights]);

  const topTools = analysis.toolStats.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">AI 智能分析</h2>
            <p className="text-slate-400">自动分析会话并提供智能洞察</p>
          </div>
        </div>
      </div>

      {/* 总体评分 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="text-center">
            <div className={`text-6xl font-bold px-6 py-3 rounded-2xl border ${GRADE_COLORS[analysis.summary.overallGrade]}`}>
              {analysis.summary.overallGrade}
            </div>
            <p className="text-slate-400 text-sm mt-2">总体评分</p>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4" /> 关键点
              </h4>
              <ul className="flex flex-wrap gap-2">
                {analysis.summary.keyPoints.map((point, idx) => (
                  <li key={idx} className="px-3 py-1 bg-slate-700/50 rounded-full text-sm">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            {analysis.summary.strengths.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" /> 优势
                </h4>
                <ul className="space-y-1">
                  {analysis.summary.strengths.map((strength, idx) => (
                    <li key={idx} className="text-sm text-green-300 flex items-center gap-2">
                      <span className="text-green-400">•</span> {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.summary.improvements.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" /> 改进建议
                </h4>
                <ul className="space-y-1">
                  {analysis.summary.improvements.map((improvement, idx) => (
                    <li key={idx} className="text-sm text-amber-300 flex items-center gap-2">
                      <span className="text-amber-400">•</span> {improvement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <span className="text-slate-400 text-sm">Token 成本</span>
          </div>
          <div className="text-2xl font-bold">${analysis.tokenAnalysis.estimatedCost.totalCost.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-slate-400 text-sm">平均响应</span>
          </div>
          <div className="text-2xl font-bold">{formatDuration(analysis.performance.avgTurnDuration)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Settings className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-slate-400 text-sm">工具种类</span>
          </div>
          <div className="text-2xl font-bold">{analysis.toolStats.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <span className="text-slate-400 text-sm">错误率</span>
          </div>
          <div className="text-2xl font-bold">{(analysis.errors.errorRate * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* 洞察卡片 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          关键发现
          <span className="text-sm text-slate-400 font-normal">
            ({analysis.insights.length} 条)
          </span>
        </h3>

        {insightsBySeverity.critical.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> 严重问题 ({insightsBySeverity.critical.length})
            </h4>
            {insightsBySeverity.critical.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}

        {insightsBySeverity.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> 错误 ({insightsBySeverity.errors.length})
            </h4>
            {insightsBySeverity.errors.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}

        {insightsBySeverity.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> 警告 ({insightsBySeverity.warnings.length})
            </h4>
            {insightsBySeverity.warnings.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}

        {insightsBySeverity.infos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
              <Info className="w-4 h-4" /> 信息 ({insightsBySeverity.infos.length})
            </h4>
            {insightsBySeverity.infos.slice(0, 5).map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
            {insightsBySeverity.infos.length > 5 && (
              <p className="text-sm text-slate-500 text-center">
                还有 {insightsBySeverity.infos.length - 5} 条信息
              </p>
            )}
          </div>
        )}

        {analysis.insights.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-slate-400">会话表现良好，没有发现问题！</p>
          </div>
        )}
      </div>

      {/* 工具统计 */}
      {topTools.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5" /> 工具使用统计
          </h3>
          <div className="space-y-3">
            {topTools.map((tool, idx) => (
              <div key={tool.name} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-sm w-6">#{idx + 1}</span>
                  <div>
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-xs text-slate-500">
                      {tool.avgDuration && `平均 ${formatDuration(tool.avgDuration)}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">{tool.count} 次</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    tool.successRate >= 0.9 ? 'bg-green-500/20 text-green-400' :
                    tool.successRate >= 0.7 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {(tool.successRate * 100).toFixed(0)}% 成功
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 性能详情 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> 性能详情
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">平均响应时间</span>
              <span>{formatDuration(analysis.performance.avgTurnDuration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">中位数响应</span>
              <span>{formatDuration(analysis.performance.medianTurnDuration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">最快响应</span>
              <span className="text-green-400">{formatDuration(analysis.performance.minTurnDuration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">最慢响应</span>
              <span className="text-red-400">{formatDuration(analysis.performance.maxTurnDuration)}</span>
            </div>
            {analysis.performance.slowTurns.length > 0 && (
              <div className="pt-2 border-t border-slate-700">
                <span className="text-amber-400 text-xs">
                  ⚠️ {analysis.performance.slowTurns.length} 次慢响应
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" /> Token 详情
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">平均输入/轮次</span>
              <span>{formatTokens(Math.round(analysis.tokenAnalysis.avgInputTokensPerTurn))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">平均输出/轮次</span>
              <span>{formatTokens(Math.round(analysis.tokenAnalysis.avgOutputTokensPerTurn))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Token 效率</span>
              <span className={
                analysis.tokenAnalysis.tokenEfficiency > 0.5 ? 'text-green-400' :
                analysis.tokenAnalysis.tokenEfficiency < 0.1 ? 'text-red-400' : 'text-slate-300'
              }>
                {(analysis.tokenAnalysis.tokenEfficiency * 100).toFixed(1)}%
              </span>
            </div>
            <div className="pt-2 border-t border-slate-700 space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>输入成本</span>
                <span>${analysis.tokenAnalysis.estimatedCost.inputCost.toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>输出成本</span>
                <span>${analysis.tokenAnalysis.estimatedCost.outputCost.toFixed(3)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
