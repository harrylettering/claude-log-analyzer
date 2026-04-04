import type { SessionStats } from './log';

// 问题严重程度
export type Severity = 'info' | 'warning' | 'error' | 'critical';

// 分析类别
export type AnalysisCategory =
  | 'performance'
  | 'token_usage'
  | 'tool_calls'
  | 'errors'
  | 'patterns'
  | 'suggestions'
  | 'summary';

// 单个发现/建议
export interface Insight {
  id: string;
  category: AnalysisCategory;
  severity: Severity;
  title: string;
  description: string;
  details?: string;
  relatedEntryIds?: string[];
  relatedToolCalls?: string[];
  suggestions?: string[];
  timestamp?: string;
}

// 工具使用统计
export interface ToolStats {
  name: string;
  count: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgDuration?: number;
  minDuration?: number;
  maxDuration?: number;
}

// 性能分析
export interface PerformanceAnalysis {
  avgTurnDuration: number;
  medianTurnDuration: number;
  minTurnDuration: number;
  maxTurnDuration: number;
  slowTurns: Array<{
    index: number;
    duration: number;
    timestamp: string;
  }>;
  avgTurnsPerMinute: number;
}

// Token 分析
export interface TokenAnalysis {
  avgInputTokensPerTurn: number;
  avgOutputTokensPerTurn: number;
  avgTotalTokensPerTurn: number;
  maxInputTokens: { value: number; timestamp: string };
  maxOutputTokens: { value: number; timestamp: string };
  tokenEfficiency: number; // 输出 Token / 输入 Token 比率
  highTokenEntries: Array<{
    id?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    timestamp: string;
  }>;
  estimatedCost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
  };
}

// 会话模式分析
export interface PatternAnalysis {
  userMessageCount: number;
  assistantMessageCount: number;
  toolMessageRatio: number;
  sidechainCount: number;
  hasSidechains: boolean;
  conversationDepth: number;
  avgMessagesPerTurn: number;
  longestMessageChain: string[];
  peakActivityTimes: string[];
}

// 错误分析
export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByTool: Record<string, number>;
  recentErrors: Array<{
    toolName: string;
    timestamp: string;
    details?: string;
  }>;
  frequentErrorTools: string[];
}

// 完整的分析结果
export interface AnalysisResult {
  stats: SessionStats;
  insights: Insight[];
  performance: PerformanceAnalysis;
  tokenAnalysis: TokenAnalysis;
  toolStats: ToolStats[];
  patterns: PatternAnalysis;
  errors: ErrorAnalysis;
  summary: {
    keyPoints: string[];
    strengths: string[];
    improvements: string[];
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  };
}

// 默认的空分析结果
export const DEFAULT_ANALYSIS: AnalysisResult = {
  stats: {
    totalMessages: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    sessionDuration: 0,
    filesModified: 0,
    modelsUsed: [],
  },
  insights: [],
  performance: {
    avgTurnDuration: 0,
    medianTurnDuration: 0,
    minTurnDuration: 0,
    maxTurnDuration: 0,
    slowTurns: [],
    avgTurnsPerMinute: 0,
  },
  tokenAnalysis: {
    avgInputTokensPerTurn: 0,
    avgOutputTokensPerTurn: 0,
    avgTotalTokensPerTurn: 0,
    maxInputTokens: { value: 0, timestamp: '' },
    maxOutputTokens: { value: 0, timestamp: '' },
    tokenEfficiency: 0,
    highTokenEntries: [],
    estimatedCost: {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
    },
  },
  toolStats: [],
  patterns: {
    userMessageCount: 0,
    assistantMessageCount: 0,
    toolMessageRatio: 0,
    sidechainCount: 0,
    hasSidechains: false,
    conversationDepth: 0,
    avgMessagesPerTurn: 0,
    longestMessageChain: [],
    peakActivityTimes: [],
  },
  errors: {
    totalErrors: 0,
    errorRate: 0,
    errorsByTool: {},
    recentErrors: [],
    frequentErrorTools: [],
  },
  summary: {
    keyPoints: [],
    strengths: [],
    improvements: [],
    overallGrade: 'C',
  },
};
