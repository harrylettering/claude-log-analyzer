
export interface MessageContent {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  id?: string;
  content?: unknown;
  output?: unknown;
  is_error?: boolean;
  error?: boolean;
  [key: string]: unknown;
}

export interface Message {
  content?: string | MessageContent[];
  model?: string;
  usage?: UsageData;
  [key: string]: unknown;
}

export interface FileSnapshot {
  trackedFileBackups?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LogEntry {
  type: 'user' | 'assistant' | 'system' | 'permission-mode' | 'file-history-snapshot';
  uuid?: string;
  timestamp: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  message?: Message;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  userType?: string;
  entrypoint?: string;
  slug?: string;
  toolUseResult?: boolean;
  sourceToolAssistantUUID?: string;
  isMeta?: boolean;
  permissionMode?: string;
  snapshot?: FileSnapshot;
  isSnapshotUpdate?: boolean;
  subtype?: string;
  durationMs?: number;
  messageCount?: number;
}

export interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  timestamp: string;
  result?: unknown;
  isError?: boolean;
  durationMs?: number;
}

export interface SessionStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  sessionDuration: number;
  filesModified: number;
  modelsUsed: string[];
}

export interface ParsedLogData {
  entries: LogEntry[];
  stats: SessionStats;
  toolCalls: ToolCall[];
  tokenUsage: Array<{
    timestamp: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  turnDurations: Array<{
    timestamp: string;
    durationMs: number;
    messageCount: number;
  }>;
  fileHistory: Array<{
    timestamp: string;
    messageId: string;
    files: Record<string, unknown>;
  }>;
}
