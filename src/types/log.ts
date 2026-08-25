import type { ActionEnhancedEntry } from './agent';

// ============ Content Blocks ============


export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | ImageBlock
  | { type: string; [key: string]: unknown };

// ============ Token Usage ============

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
  cache_creation?: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
}

// ============ Tool Execution Result Details ============

export interface ToolUseResult {
  status: 'completed' | 'error' | 'cancelled';
  prompt: string;
  agentId: string;
  agentType: string;
  content: ContentBlock[];
  totalDurationMs: number;
  totalTokens: number;
  totalToolUseCount: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    server_tool_use?: {
      web_search_requests: number;
      web_fetch_requests: number;
    };
    service_tier: string;
  };
}

// ============ Message Type ============

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  model?: string;
  usage?: UsageInfo;
  stop_reason?: string;
  stop_sequence?: string | null;
}

// ============ Log Entry Categories ============

export type EntryCategory =
  | 'USER_INPUT'
  | 'USER_INPUT_WITH_IMAGE'
  | 'SLASH_COMMAND'
  | 'TOOL_RESULT'
  | 'TOOL_ERROR'
  | 'AGENT_RESULT'
  | 'ASSISTANT_TEXT'
  | 'ASSISTANT_TOOL_CALL'
  | 'ASSISTANT_THINKING_RESPONSE'
  | 'SYSTEM'
  | 'SUMMARY'
  | 'FILE_HISTORY'
  | 'UNKNOWN';

// ============ Log Entry ============

export interface LogEntry extends ActionEnhancedEntry {
  // Core identity fields.
  uuid: string;
  parentUuid: string | null;
  type: string;
  timestamp: string;

  // Message payload.
  message?: Message;

  // Session metadata.
  sessionId?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
  slug?: string;
  entrypoint?: string;
  userType?: string;

  // Agent and tool metadata.
  isSidechain?: boolean;
  promptId?: string;
  toolUseResult?: ToolUseResult;
  sourceToolAssistantUUID?: string;
  requestId?: string;
  effort?: string;

  // Derived category assigned during parsing.
  _category?: EntryCategory;

  // Visual fork metadata.
  isForked?: boolean;
  forkBranchId?: string;

  // Legacy compatibility fields.
  isMeta?: boolean;
  permissionMode?: string;
  snapshot?: {
    trackedFileBackups?: Record<string, unknown>;
    [key: string]: unknown;
  };
  isSnapshotUpdate?: boolean;
  subtype?: string;
  durationMs?: number;
  messageCount?: number;
}

// ============ Parse Result ============

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
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessionDuration: number;
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
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
  }>;
  turnDurations: Array<{
    timestamp: string;
    durationMs: number;
    messageCount: number;
  }>;
}

// ============ Backward-Compatible Type Aliases ============

export type UsageData = UsageInfo;
export type MessageContent = ContentBlock;
