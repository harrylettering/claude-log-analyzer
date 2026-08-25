import type { LogEntry } from './log';

// Search mode type
export type SearchMode = 'simple' | 'regex' | 'exact';

// Time range
export interface TimeRange {
  startTime?: string;
  endTime?: string;
}

// Token range
export interface TokenRange {
  minInput?: number;
  maxInput?: number;
  minOutput?: number;
  maxOutput?: number;
  minTotal?: number;
  maxTotal?: number;
}

// Message type filter
export type MessageTypeFilter =
  | 'all'
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool'
  | 'attachment'
  | 'file-history'
  // Catch-all for entry types no other option claims, so nothing in a log is
  // reachable only through 'all'.
  | 'other';

// Advanced search filters
export interface SearchFilters {
  // Basic search
  query: string;
  searchMode: SearchMode;
  caseSensitive: boolean;

  // Type filters
  messageTypes: MessageTypeFilter[];

  // Tool name filter
  toolNames: string[];

  // Time range
  timeRange: TimeRange;

  // Token range
  tokenRange: TokenRange;

  // Other flags
  onlyWithErrors: boolean;
  onlyWithTools: boolean;
  onlySidechain: boolean;
}

// Search result
export interface SearchResult {
  entries: LogEntry[];
  totalCount: number;
  filteredCount: number;
  matchCount: number;
}

// Saved search preset
export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: number;
}

// Default filter values
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
