// ============ 内容块类型 ============

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

// ============ Token 使用量 ============

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

// ============ 工具执行结果详情 ============

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

// ============ 消息类型 ============

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  model?: string;
  usage?: UsageInfo;
  stop_reason?: string;
  stop_sequence?: string | null;
}

// ============ 日志条目分类 ============

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

// ============ 日志条目 ============

export interface LogEntry {
  // 核心标识
  uuid: string;
  parentUuid: string | null;
  type: string;
  timestamp: string;

  // 消息内容
  message?: Message;

  // 会话元数据
  sessionId?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
  slug?: string;
  entrypoint?: string;
  userType?: string;

  // Agent/Tool 相关
  isSidechain?: boolean;
  promptId?: string;
  toolUseResult?: ToolUseResult;
  sourceToolAssistantUUID?: string;

  // 分类（解析时添加）
  _category?: EntryCategory;

  // 兼容旧版本字段
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

// ============ 解析结果 ============

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

// ============ 向后兼容类型别名 ============

export type UsageData = UsageInfo;
export type MessageContent = ContentBlock;
