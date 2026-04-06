import type { ParsedLogData, ToolCall } from '../types/log';
import type {
  LoadedSession,
  AggregateStats,
  AggregateAnalysisResult,
  TokenTrendDataPoint,
  AggregatedToolUsage,
  SessionComparisonRow,
} from '../types/aggregate';
import { PRICING } from '../constants';

// 生成唯一会话 ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 估算单个会话成本
function estimateSessionCost(stats: { inputTokens: number; outputTokens: number }): number {
  const inputCost = stats.inputTokens * (PRICING.INPUT_PER_MTOK / 1_000_000);
  const outputCost = stats.outputTokens * (PRICING.OUTPUT_PER_MTOK / 1_000_000);
  return inputCost + outputCost;
}

// 创建已加载会话
export function createLoadedSession(data: ParsedLogData, name: string): LoadedSession {
  return {
    id: generateSessionId(),
    data,
    name,
    loadedAt: Date.now(),
  };
}

// 计算聚合统计
function calculateAggregateStats(sessions: LoadedSession[]): AggregateStats {
  let totalMessages = 0;
  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let totalToolCalls = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCost = 0;
  let totalDuration = 0;

  let maxMessagesInSession = { sessionId: '', sessionName: '', value: 0 };
  let maxTokensInSession = { sessionId: '', sessionName: '', value: 0 };
  let maxCostInSession = { sessionId: '', sessionName: '', value: 0 };

  const modelUsageCount: Record<string, number> = {};
  const allModelsSet = new Set<string>();

  sessions.forEach(session => {
    const stats = session.data.stats;
    const cost = estimateSessionCost(stats);

    totalMessages += stats.totalMessages;
    totalUserMessages += stats.userMessages;
    totalAssistantMessages += stats.assistantMessages;
    totalToolCalls += stats.toolCalls;
    totalTokens += stats.totalTokens;
    totalInputTokens += stats.inputTokens;
    totalOutputTokens += stats.outputTokens;
    totalEstimatedCost += cost;
    totalDuration += stats.sessionDuration;

    // 检查最大值
    if (stats.totalMessages > maxMessagesInSession.value) {
      maxMessagesInSession = {
        sessionId: session.id,
        sessionName: session.name,
        value: stats.totalMessages,
      };
    }
    if (stats.totalTokens > maxTokensInSession.value) {
      maxTokensInSession = {
        sessionId: session.id,
        sessionName: session.name,
        value: stats.totalTokens,
      };
    }
    if (cost > maxCostInSession.value) {
      maxCostInSession = {
        sessionId: session.id,
        sessionName: session.name,
        value: cost,
      };
    }

    // 统计模型使用
    stats.modelsUsed.forEach(model => {
      allModelsSet.add(model);
      modelUsageCount[model] = (modelUsageCount[model] || 0) + 1;
    });
  });

  const sessionCount = sessions.length;

  return {
    totalSessions: sessionCount,
    totalMessages,
    totalUserMessages,
    totalAssistantMessages,
    totalToolCalls,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost,
    totalDuration,

    avgMessagesPerSession: sessionCount > 0 ? totalMessages / sessionCount : 0,
    avgTokensPerSession: sessionCount > 0 ? totalTokens / sessionCount : 0,
    avgToolCallsPerSession: sessionCount > 0 ? totalToolCalls / sessionCount : 0,
    avgCostPerSession: sessionCount > 0 ? totalEstimatedCost / sessionCount : 0,
    avgDurationPerSession: sessionCount > 0 ? totalDuration / sessionCount : 0,

    maxMessagesInSession,
    maxTokensInSession,
    maxCostInSession,

    allModels: Array.from(allModelsSet),
    modelUsageCount,
  };
}

// 生成 Token 趋势数据
function generateTokenTrends(sessions: LoadedSession[]): TokenTrendDataPoint[] {
  return sessions.map(session => {
    const stats = session.data.stats;
    return {
      sessionId: session.id,
      sessionName: session.name,
      timestamp: session.data.entries[0]?.timestamp || new Date().toISOString(),
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      totalTokens: stats.totalTokens,
      estimatedCost: estimateSessionCost(stats),
    };
  }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// 聚合工具使用数据
function aggregateToolUsage(sessions: LoadedSession[]): AggregatedToolUsage[] {
  const toolMap = new Map<string, {
    totalCalls: number;
    successCount: number;
    errorCount: number;
    durations: number[];
    sessions: Set<string>;
  }>();

  sessions.forEach(session => {
    const toolCallMap = new Map<string, ToolCall[]>();

    // 按工具名称分组
    session.data.toolCalls.forEach(call => {
      const existing = toolCallMap.get(call.name) || [];
      existing.push(call);
      toolCallMap.set(call.name, existing);
    });

    // 统计每个工具
    toolCallMap.forEach((calls, toolName) => {
      const existing = toolMap.get(toolName) || {
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        durations: [],
        sessions: new Set<string>(),
      };

      calls.forEach(call => {
        existing.totalCalls++;
        if (call.isError) {
          existing.errorCount++;
        } else {
          existing.successCount++;
        }
        if (call.durationMs) {
          existing.durations.push(call.durationMs);
        }
      });
      existing.sessions.add(session.id);

      toolMap.set(toolName, existing);
    });
  });

  return Array.from(toolMap.entries()).map(([name, stats]) => {
    const avgDuration = stats.durations.length > 0
      ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
      : undefined;

    return {
      name,
      totalCalls: stats.totalCalls,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      successRate: stats.totalCalls > 0 ? stats.successCount / stats.totalCalls : 1,
      avgDuration,
      sessions: Array.from(stats.sessions),
    };
  }).sort((a, b) => b.totalCalls - a.totalCalls);
}

// 生成会话对比数据
function generateSessionComparisons(sessions: LoadedSession[]): SessionComparisonRow[] {
  return sessions.map(session => ({
    sessionId: session.id,
    sessionName: session.name,
    totalMessages: session.data.stats.totalMessages,
    userMessages: session.data.stats.userMessages,
    assistantMessages: session.data.stats.assistantMessages,
    toolCalls: session.data.stats.toolCalls,
    totalTokens: session.data.stats.totalTokens,
    inputTokens: session.data.stats.inputTokens,
    outputTokens: session.data.stats.outputTokens,
    estimatedCost: estimateSessionCost(session.data.stats),
    duration: session.data.stats.sessionDuration,
    models: session.data.stats.modelsUsed,
  }));
}

// 主聚合函数
export function aggregateSessions(sessions: LoadedSession[]): AggregateAnalysisResult {
  return {
    sessions,
    aggregateStats: calculateAggregateStats(sessions),
    sessionComparisons: generateSessionComparisons(sessions),
    tokenTrends: generateTokenTrends(sessions),
    aggregatedTools: aggregateToolUsage(sessions),
  };
}
