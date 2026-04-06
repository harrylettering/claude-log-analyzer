import type { ParsedLogData } from './log';

// 已加载的会话数据
export interface LoadedSession {
  id: string;
  data: ParsedLogData;
  name: string;
  loadedAt: number;
}

// 趋势数据点（用于图表）
export interface TrendDataPoint {
  sessionId: string;
  sessionName: string;
  timestamp: string;
  value: number;
  [key: string]: unknown;
}

// Token 趋势数据点
export interface TokenTrendDataPoint {
  sessionId: string;
  sessionName: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// 工具使用聚合数据
export interface AggregatedToolUsage {
  name: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgDuration?: number;
  sessions: string[]; // 使用了该工具的会话 ID 列表
}

// 聚合统计数据
export interface AggregateStats {
  totalSessions: number;
  totalMessages: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  totalDuration: number;

  // 平均值
  avgMessagesPerSession: number;
  avgTokensPerSession: number;
  avgToolCallsPerSession: number;
  avgCostPerSession: number;
  avgDurationPerSession: number;

  // 极值
  maxMessagesInSession: { sessionId: string; sessionName: string; value: number };
  maxTokensInSession: { sessionId: string; sessionName: string; value: number };
  maxCostInSession: { sessionId: string; sessionName: string; value: number };

  // 模型统计
  allModels: string[];
  modelUsageCount: Record<string, number>;
}

// 会话对比行数据
export interface SessionComparisonRow {
  sessionId: string;
  sessionName: string;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  duration: number;
  models: string[];
}

// 完整的聚合分析结果
export interface AggregateAnalysisResult {
  sessions: LoadedSession[];
  aggregateStats: AggregateStats;
  sessionComparisons: SessionComparisonRow[];
  tokenTrends: TokenTrendDataPoint[];
  aggregatedTools: AggregatedToolUsage[];
}
