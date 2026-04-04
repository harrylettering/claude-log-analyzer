import type { LogEntry, ToolCall, SessionStats, ParsedLogData } from '../types/log';
import type {
  AnalysisResult,
  Insight,
  ToolStats,
  PerformanceAnalysis,
  TokenAnalysis,
  PatternAnalysis,
  ErrorAnalysis,
  Severity,
  AnalysisCategory,
} from '../types/analysis';
import { DEFAULT_ANALYSIS } from '../types/analysis';
import { PRICING } from '../constants';

// 阈值常量
const PERFORMANCE_WARNING_THRESHOLD_MS = 30_000; // 30秒
const PERFORMANCE_CRITICAL_THRESHOLD_MS = 60_000; // 60秒
const HIGH_TOKEN_THRESHOLD = 50_000;
const TOKEN_EFFICIENCY_GOOD = 0.5; // 输出/输入 > 0.5 为好
const TOKEN_EFFICIENCY_POOR = 0.1; // 输出/输入 < 0.1 为差
const ERROR_RATE_WARNING = 0.1; // 10% 错误率
const ERROR_RATE_CRITICAL = 0.25; // 25% 错误率

// 生成唯一 ID
function generateId(): string {
  return `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 创建洞察
function createInsight(
  category: AnalysisCategory,
  severity: Severity,
  title: string,
  description: string,
  options: Partial<Omit<Insight, 'id' | 'category' | 'severity' | 'title' | 'description'>> = {}
): Insight {
  return {
    id: generateId(),
    category,
    severity,
    title,
    description,
    ...options,
  };
}

// 计算中位数
function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 分析性能
function analyzePerformance(data: ParsedLogData): PerformanceAnalysis {
  const durations = data.turnDurations.map((d: any) => d.durationMs).filter((d: any) => d > 0);

  if (durations.length === 0) {
    return {
      avgTurnDuration: 0,
      medianTurnDuration: 0,
      minTurnDuration: 0,
      maxTurnDuration: 0,
      slowTurns: [],
      avgTurnsPerMinute: 0,
    };
  }

  const avgTurnDuration = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
  const medianTurnDuration = median(durations);
  const minTurnDuration = Math.min(...durations);
  const maxTurnDuration = Math.max(...durations);

  const slowTurns = data.turnDurations
    .filter(d => d.durationMs > avgTurnDuration * 2)
    .map((d, index) => ({
      index,
      duration: d.durationMs,
      timestamp: d.timestamp,
    }));

  const sessionDurationMinutes = data.stats.sessionDuration / 60_000;
  const avgTurnsPerMinute = sessionDurationMinutes > 0
    ? durations.length / sessionDurationMinutes
    : 0;

  return {
    avgTurnDuration,
    medianTurnDuration,
    minTurnDuration,
    maxTurnDuration,
    slowTurns,
    avgTurnsPerMinute,
  };
}

// 分析 Token 使用
function analyzeTokens(data: ParsedLogData): TokenAnalysis {
  const { tokenUsage, stats } = data;

  if (tokenUsage.length === 0) {
    return DEFAULT_ANALYSIS.tokenAnalysis;
  }

  const avgInputTokensPerTurn = stats.inputTokens / tokenUsage.length;
  const avgOutputTokensPerTurn = stats.outputTokens / tokenUsage.length;
  const avgTotalTokensPerTurn = stats.totalTokens / tokenUsage.length;

  let maxInputTokens = { value: 0, timestamp: '' };
  let maxOutputTokens = { value: 0, timestamp: '' };
  const highTokenEntries: TokenAnalysis['highTokenEntries'] = [];

  tokenUsage.forEach(t => {
    if (t.inputTokens > maxInputTokens.value) {
      maxInputTokens = { value: t.inputTokens, timestamp: t.timestamp };
    }
    if (t.outputTokens > maxOutputTokens.value) {
      maxOutputTokens = { value: t.outputTokens, timestamp: t.timestamp };
    }
    if (t.totalTokens > HIGH_TOKEN_THRESHOLD) {
      highTokenEntries.push({
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        totalTokens: t.totalTokens,
        timestamp: t.timestamp,
      });
    }
  });

  const tokenEfficiency = stats.inputTokens > 0
    ? stats.outputTokens / stats.inputTokens
    : 0;

  const inputCost = stats.inputTokens * (PRICING.INPUT_PER_MTOK / 1_000_000);
  const outputCost = stats.outputTokens * (PRICING.OUTPUT_PER_MTOK / 1_000_000);

  return {
    avgInputTokensPerTurn,
    avgOutputTokensPerTurn,
    avgTotalTokensPerTurn,
    maxInputTokens,
    maxOutputTokens,
    tokenEfficiency,
    highTokenEntries,
    estimatedCost: {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    },
  };
}

// 分析工具使用
function analyzeTools(toolCalls: ToolCall[]): ToolStats[] {
  const toolMap = new Map<string, { count: number; successCount: number; errorCount: number; durations: number[] }>();

  toolCalls.forEach(call => {
    const existing = toolMap.get(call.name) || { count: 0, successCount: 0, errorCount: 0, durations: [] };
    existing.count++;
    if (call.isError) {
      existing.errorCount++;
    } else {
      existing.successCount++;
    }
    if (call.durationMs) {
      existing.durations.push(call.durationMs);
    }
    toolMap.set(call.name, existing);
  });

  return Array.from(toolMap.entries()).map(([name, stats]) => {
    const avgDuration = stats.durations.length > 0
      ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
      : undefined;
    const minDuration = stats.durations.length > 0 ? Math.min(...stats.durations) : undefined;
    const maxDuration = stats.durations.length > 0 ? Math.max(...stats.durations) : undefined;

    return {
      name,
      count: stats.count,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      successRate: stats.count > 0 ? stats.successCount / stats.count : 1,
      avgDuration,
      minDuration,
      maxDuration,
    };
  }).sort((a, b) => b.count - a.count);
}

// 分析模式
function analyzePatterns(entries: LogEntry[], stats: SessionStats): PatternAnalysis {
  const userMessageCount = entries.filter(e => e.type === 'user' && !e.isMeta).length;
  const assistantMessageCount = entries.filter(e => e.type === 'assistant').length;
  const toolMessageCount = entries.filter(e => {
    const content = e.message?.content;
    return Array.isArray(content) && content.some((c: any) =>
      c.type === 'tool_use' || c.type === 'tool_result'
    );
  }).length;

  const sidechainCount = entries.filter(e => e.isSidechain).length;

  // 计算对话深度
  const depthMap = new Map<string, number>();
  let maxDepth = 0;

  entries.forEach(entry => {
    if (entry.uuid) {
      const parentDepth = entry.parentUuid ? (depthMap.get(entry.parentUuid) || 0) : 0;
      const currentDepth = parentDepth + 1;
      depthMap.set(entry.uuid, currentDepth);
      maxDepth = Math.max(maxDepth, currentDepth);
    }
  });

  const avgMessagesPerTurn = stats.userMessages > 0
    ? stats.totalMessages / stats.userMessages
    : 0;

  return {
    userMessageCount,
    assistantMessageCount,
    toolMessageRatio: stats.totalMessages > 0 ? toolMessageCount / stats.totalMessages : 0,
    sidechainCount,
    hasSidechains: sidechainCount > 0,
    conversationDepth: maxDepth,
    avgMessagesPerTurn,
    longestMessageChain: [],
    peakActivityTimes: [],
  };
}

// 分析错误
function analyzeErrors(toolCalls: ToolCall[], toolStats: ToolStats[]): ErrorAnalysis {
  const totalErrors = toolCalls.filter(t => t.isError).length;
  const errorRate = toolCalls.length > 0 ? totalErrors / toolCalls.length : 0;

  const errorsByTool: Record<string, number> = {};
  toolCalls.forEach(call => {
    if (call.isError) {
      errorsByTool[call.name] = (errorsByTool[call.name] || 0) + 1;
    }
  });

  const recentErrors = toolCalls
    .filter(t => t.isError)
    .slice(-5)
    .map(t => ({
      toolName: t.name,
      timestamp: t.timestamp,
    }));

  const frequentErrorTools = toolStats
    .filter(t => t.errorCount > 0 && t.successRate < 0.8)
    .map(t => t.name);

  return {
    totalErrors,
    errorRate,
    errorsByTool,
    recentErrors,
    frequentErrorTools,
  };
}

// 生成洞察
function generateInsights(
  _data: ParsedLogData,
  performance: PerformanceAnalysis,
  tokenAnalysis: TokenAnalysis,
  toolStats: ToolStats[],
  patterns: PatternAnalysis,
  errors: ErrorAnalysis
): Insight[] {
  const insights: Insight[] = [];

  // 性能相关洞察
  if (performance.maxTurnDuration > PERFORMANCE_CRITICAL_THRESHOLD_MS) {
    insights.push(createInsight(
      'performance',
      'critical',
      '发现极慢的响应',
      `有响应时间超过 ${Math.round(PERFORMANCE_CRITICAL_THRESHOLD_MS / 1000)} 秒的请求`,
      {
        suggestions: ['考虑优化工具调用', '检查网络连接', '减少单次请求的工作量'],
        relatedEntryIds: performance.slowTurns.slice(0, 3).map(t => t.timestamp),
      }
    ));
  } else if (performance.maxTurnDuration > PERFORMANCE_WARNING_THRESHOLD_MS) {
    insights.push(createInsight(
      'performance',
      'warning',
      '存在较慢的响应',
      `部分请求响应时间超过 ${Math.round(PERFORMANCE_WARNING_THRESHOLD_MS / 1000)} 秒`,
      {
        suggestions: ['考虑拆分复杂任务', '优化工具使用'],
      }
    ));
  }

  if (performance.slowTurns.length > 3) {
    insights.push(createInsight(
      'performance',
      'warning',
      '多次慢响应',
      `发现 ${performance.slowTurns.length} 次响应时间超过平均值 2 倍的请求`
    ));
  }

  // Token 相关洞察
  if (tokenAnalysis.highTokenEntries.length > 0) {
    insights.push(createInsight(
      'token_usage',
      'warning',
      '高 Token 使用',
      `有 ${tokenAnalysis.highTokenEntries.length} 次请求 Token 使用超过 ${HIGH_TOKEN_THRESHOLD}`,
      {
        suggestions: ['考虑拆分长对话', '使用更简洁的提示词', '定期清除上下文'],
      }
    ));
  }

  if (tokenAnalysis.tokenEfficiency < TOKEN_EFFICIENCY_POOR) {
    insights.push(createInsight(
      'token_usage',
      'warning',
      'Token 效率较低',
      `输出 Token 与输入 Token 比率较低 (${(tokenAnalysis.tokenEfficiency * 100).toFixed(1)}%)`,
      {
        suggestions: ['优化提示词以获得更简洁的回复', '考虑使用更合适的模型'],
      }
    ));
  } else if (tokenAnalysis.tokenEfficiency > TOKEN_EFFICIENCY_GOOD) {
    insights.push(createInsight(
      'token_usage',
      'info',
      'Token 效率良好',
      `输出 Token 与输入 Token 比率良好 (${(tokenAnalysis.tokenEfficiency * 100).toFixed(1)}%)`
    ));
  }

  if (tokenAnalysis.estimatedCost.totalCost > 1) {
    insights.push(createInsight(
      'token_usage',
      'warning',
      '会话成本较高',
      `本次会话估算成本超过 $${tokenAnalysis.estimatedCost.totalCost.toFixed(2)}`,
      {
        suggestions: ['考虑使用更经济的模型', '优化上下文管理'],
      }
    ));
  }

  // 工具调用相关洞察
  const mostUsedTool = toolStats[0];
  if (mostUsedTool) {
    insights.push(createInsight(
      'tool_calls',
      'info',
      `最常用工具: ${mostUsedTool.name}`,
      `共使用 ${mostUsedTool.count} 次，成功率 ${(mostUsedTool.successRate * 100).toFixed(1)}%`,
    ));
  }

  // 错误相关洞察
  if (errors.errorRate > ERROR_RATE_CRITICAL) {
    insights.push(createInsight(
      'errors',
      'critical',
      '错误率很高',
      `工具调用错误率达到 ${(errors.errorRate * 100).toFixed(1)}%`,
      {
        suggestions: ['检查工具配置', '验证权限设置', '查看错误日志详情'],
      }
    ));
  } else if (errors.errorRate > ERROR_RATE_WARNING) {
    insights.push(createInsight(
      'errors',
      'warning',
      '存在较多错误',
      `工具调用错误率为 ${(errors.errorRate * 100).toFixed(1)}%`,
      {
        suggestions: errors.frequentErrorTools.length > 0
          ? [`关注这些工具的错误: ${errors.frequentErrorTools.join(', ')}`]
          : [],
      }
    ));
  }

  // 模式相关洞察
  if (patterns.hasSidechains) {
    insights.push(createInsight(
      'patterns',
      'info',
      '使用了 Sidechain',
      `会话中包含 ${patterns.sidechainCount} 条 Sidechain 消息`,
    ));
  }

  if (patterns.conversationDepth > 5) {
    insights.push(createInsight(
      'patterns',
      'info',
      '对话层级较深',
      `最大对话深度达到 ${patterns.conversationDepth} 层`,
    ));
  }

  if (patterns.toolMessageRatio > 0.5) {
    insights.push(createInsight(
      'patterns',
      'info',
      '工具使用频繁',
      `工具相关消息占比 ${(patterns.toolMessageRatio * 100).toFixed(1)}%`,
    ));
  }

  return insights;
}

// 生成总结
function generateSummary(
  stats: SessionStats,
  insights: Insight[],
  toolStats: ToolStats[],
  errors: ErrorAnalysis
): AnalysisResult['summary'] {
  const keyPoints: string[] = [];
  const strengths: string[] = [];
  const improvements: string[] = [];

  keyPoints.push(`共 ${stats.totalMessages} 条消息`);
  keyPoints.push(`调用了 ${stats.toolCalls} 次工具`);
  keyPoints.push(`使用了 ${stats.totalTokens.toLocaleString()} Token`);

  // 计算优势
  const criticalErrors = insights.filter(i => i.severity === 'critical');
  const warnings = insights.filter(i => i.severity === 'warning');

  if (errors.errorRate < 0.05) {
    strengths.push('工具调用成功率很高');
  }
  if (stats.modelsUsed.length > 0) {
    strengths.push(`使用了模型: ${stats.modelsUsed.join(', ')}`);
  }
  if (stats.toolCalls > 0 && toolStats.some(t => t.successRate > 0.9)) {
    strengths.push('部分工具使用非常稳定');
  }

  // 改进点
  if (criticalErrors.length > 0) {
    improvements.push(`需要解决 ${criticalErrors.length} 个严重问题`);
  }
  if (warnings.length > 0) {
    improvements.push(`有 ${warnings.length} 个需要注意的警告`);
  }
  if (errors.frequentErrorTools.length > 0) {
    improvements.push(`关注高频出错工具: ${errors.frequentErrorTools.join(', ')}`);
  }

  // 计算等级
  let grade: AnalysisResult['summary']['overallGrade'];
  if (criticalErrors.length === 0 && warnings.length <= 2) {
    grade = 'A';
  } else if (criticalErrors.length === 0 && warnings.length <= 5) {
    grade = 'B';
  } else if (criticalErrors.length <= 1) {
    grade = 'C';
  } else if (criticalErrors.length <= 3) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return {
    keyPoints,
    strengths,
    improvements: improvements.length > 0 ? improvements : ['会话表现良好，继续保持！'],
    overallGrade: grade,
  };
}

// 主分析函数
export function analyzeSession(data: ParsedLogData): AnalysisResult {
  const { stats } = data;

  if (stats.totalMessages === 0) {
    return { ...DEFAULT_ANALYSIS, stats };
  }

  const performance = analyzePerformance(data);
  const tokenAnalysis = analyzeTokens(data);
  const toolStats = analyzeTools(data.toolCalls);
  const patterns = analyzePatterns(data.entries, stats);
  const errors = analyzeErrors(data.toolCalls, toolStats);
  const insights = generateInsights(data, performance, tokenAnalysis, toolStats, patterns, errors);
  const summary = generateSummary(stats, insights, toolStats, errors);

  return {
    stats,
    insights,
    performance,
    tokenAnalysis,
    toolStats,
    patterns,
    errors,
    summary,
  };
}
