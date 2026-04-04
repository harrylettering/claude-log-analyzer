import type { LogEntry } from './log';

// 搜索模式类型
export type SearchMode = 'simple' | 'regex' | 'exact';

// 时间范围
export interface TimeRange {
  startTime?: string;
  endTime?: string;
}

// Token 范围
export interface TokenRange {
  minInput?: number;
  maxInput?: number;
  minOutput?: number;
  maxOutput?: number;
  minTotal?: number;
  maxTotal?: number;
}

// 消息类型过滤
export type MessageTypeFilter = 'all' | 'user' | 'assistant' | 'system' | 'tool' | 'file-history-snapshot';

// 高级搜索过滤器
export interface SearchFilters {
  // 基础搜索
  query: string;
  searchMode: SearchMode;
  caseSensitive: boolean;

  // 类型过滤
  messageTypes: MessageTypeFilter[];

  // 工具名称过滤
  toolNames: string[];

  // 时间范围
  timeRange: TimeRange;

  // Token 范围
  tokenRange: TokenRange;

  // 其他标志
  onlyWithErrors: boolean;
  onlyWithTools: boolean;
  onlySidechain: boolean;
}

// 搜索结果
export interface SearchResult {
  entries: LogEntry[];
  totalCount: number;
  filteredCount: number;
  matchCount: number;
}

// 保存的搜索预设
export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: number;
}

// 默认过滤器值
export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  searchMode: 'simple',
  caseSensitive: false,
  messageTypes: ['all'],
  toolNames: [],
  timeRange: {},
  tokenRange: {},
  onlyWithErrors: false,
  onlyWithTools: false,
  onlySidechain: false,
};
