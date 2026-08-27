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

/**
 * The `toolUseResult` payload attached to a tool's result entry.
 *
 * Every field here is optional on purpose: this one key carries a different
 * shape for every tool. A Bash result has `stdout`/`stderr`; a synchronous
 * Task result has `totalDurationMs` and `totalTokens`; an asynchronous Task
 * dispatch has none of those and instead reports `agentId` plus
 * `status: 'async_launched'`. Declaring the synchronous shape as required
 * made four fields look guaranteed that are undefined most of the time.
 */
export interface ToolUseResult {
  /**
   * 'async_launched' means the agent was only dispatched — this record is
   * written at launch and never updated, so it says nothing about whether the
   * agent finished. Real status has to be derived from its transcript.
   */
  status?: 'completed' | 'error' | 'cancelled' | 'async_launched' | string;
  content?: ContentBlock[];

  // Task dispatch (both sync and async).
  agentId?: string;
  agentType?: string;
  description?: string;
  prompt?: string;
  resolvedModel?: string;
  isAsync?: boolean;
  outputFile?: string;
  canReadOutputFile?: boolean;

  // Present only once a synchronous Task has returned.
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolUseCount?: number;
  usage?: UsageInfo;

  // Shell tools.
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;

  [key: string]: unknown;
}

// ============ Message Type ============

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  /**
   * Identifies the API response this entry came from. One response is logged
   * as one entry per content block, all sharing this id — so anything that
   * sums per-response data (usage above all) must group by it.
   */
  id?: string;
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
  /**
   * Set on every entry in a subagent transcript. Those transcripts live in
   * their own file (<project>/<sessionId>/subagents/agent-<agentId>.jsonl),
   * so this — not the entry's position in a stream — is what attributes an
   * entry to the agent that produced it.
   */
  agentId?: string;
  /** The subagent's type, e.g. "general-purpose". Only on assistant entries. */
  attributionAgent?: string;

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
  /**
   * Hooks that ran around this call. `durationMs` above is wall clock and
   * therefore already includes them — keeping the parts lets a slow tool be
   * told apart from a slow hook in front of a fast one.
   */
  hooks?: HookExecution[];
}

// ============ Hooks ============

/**
 * One hook run, as recorded in an `attachment` entry.
 *
 * Hooks are the part of a session nothing currently reports on, and they are
 * not free: a PreToolUse hook runs before every matching tool call, so its cost
 * is paid once per call for the whole session.
 */
export interface HookExecution {
  uuid: string;
  timestamp: string;
  /** Full name as logged, e.g. "PreToolUse:Bash". */
  hookName: string;
  /** The lifecycle event: PreToolUse, PostToolUse, SessionStart, … */
  hookEvent: string;
  /** The half after the colon — the tool or trigger it matched on. */
  matcher?: string;
  /**
   * For PreToolUse/PostToolUse this is the id of the tool call the hook ran
   * around, which is what lets a tool's wall time be split into hook overhead
   * and actual execution. For lifecycle events it is an unrelated id.
   */
  toolUseId?: string;
  command?: string;
  durationMs?: number;
  exitCode?: number;
  /**
   * A hook that failed is still logged with `type: "hook_success"` — the
   * attachment type is not a status. Only the exit code says what happened,
   * which is why a broken hook can fail for months without anyone noticing.
   */
  isError: boolean;
  stdout?: string;
  stderr?: string;
  /** The message a hook asked to surface, from `hook_system_message`. */
  systemMessage?: string;
}

/**
 * Who a hook command belongs to.
 *
 * Resolved by the local server against what is installed on this machine now —
 * a trace recorded elsewhere, or before a plugin was removed, will not match.
 * Treat a miss as "cannot tell", never as "no owner".
 */
export interface HookSource {
  source: 'plugin' | 'settings';
  /** Plugin name, or the settings file path for a hook configured directly. */
  name: string;
  marketplace?: string;
  version?: string;
  root?: string;
  /** Lifecycle events the source declares this command for. */
  events?: string[];
  timeout?: number;
  /** Two sources declare the same command; the log cannot separate them. */
  ambiguous?: boolean;
}

// ============ Subagents ============

/**
 * How far a dispatched agent got, derived from its transcript rather than read
 * from the dispatch record — the dispatch record is written at launch and is
 * never updated, so it reports 'async_launched' forever.
 */
export type SubagentStatus =
  | 'dispatched'   // the parent launched it, but no transcript was loaded
  | 'running'      // the transcript ends on an unanswered tool call
  | 'completed'
  | 'error';       // at least one tool in the transcript returned an error

/** The five counters a response reports, summed over whatever scope. */
export interface TokenCounters {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export type SubagentTokens = TokenCounters;

/** One dispatched agent: what it was asked, what it did, what it cost. */
export interface SubagentRun {
  agentId: string;
  /** From `attributionAgent` on the transcript, e.g. "general-purpose". */
  agentType?: string;
  /** The short label the parent gave the dispatch. */
  description?: string;
  prompt?: string;
  model?: string;
  isAsync?: boolean;
  outputFile?: string;

  // The parent side of the link.
  dispatchedAt?: string;
  dispatchedByUuid?: string;
  dispatchToolUseId?: string;

  // The transcript side.
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  /** Dispatch → the agent's first logged entry. Time spent queued, not working. */
  launchLatencyMs?: number;

  status: SubagentStatus;
  /**
   * False when the parent dispatched an agent whose transcript was never
   * loaded. Distinguishing that from "did nothing" matters: an empty row is
   * otherwise indistinguishable from a missing file.
   */
  hasTranscript: boolean;

  entries: LogEntry[];
  toolCalls: ToolCall[];
  errorCount: number;
  /** The agent's final text reply — what the parent actually received. */
  resultText?: string;
  tokens: SubagentTokens;
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
  /**
   * Dispatched agents, newest last. Their entries are deliberately absent from
   * `entries` above: each transcript is a separate conversation with its own
   * root, so merging them would break the uuid tree and inflate every count.
   */
  subagents: SubagentRun[];
  /** Every hook run in the session, in the order they were logged. */
  hooks: HookExecution[];
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
