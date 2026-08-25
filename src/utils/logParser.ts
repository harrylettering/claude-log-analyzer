import type {
  LogEntry,
  ParsedLogData,
  SessionStats,
  ToolCall,
  EntryCategory,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../types/log';
import type { AgentAction } from '../types/agent';
import {
  MAX_TOKEN_VALUE,
} from '../constants';
import { saveImage } from './imageStore';

// Parse error type.
export interface ParseError {
  line: number;
  raw: string;
  error: Error;
}

export interface ParseResult {
  data: ParsedLogData;
  errors: ParseError[];
}

// ============ Agent Action Parsing ============

function createInitialAgentAction(toolUse: ToolUseBlock): AgentAction | undefined {
  const name = toolUse.name.toLowerCase();
  const input = toolUse.input as any;

  // 1. Terminal execution.
  if (name === 'bash' || name === 'run' || name === 'execute_command') {
    const cmd = (input.command || input.script || '').trim();
    if (cmd.startsWith('rm ') || cmd.includes(' rm ')) {
       return { type: 'CodeDelete', filePath: cmd.split(' ').pop() || cmd, instruction: 'Executed via terminal' };
    }
    return {
      type: 'TerminalCommand',
      command: cmd,
      exitCode: -1,
      output: '',
    };
  }

  // 2. Write operations.
  if (name === 'edit' || name === 'replace' || name === 'write' || name === 'write_to_file' || name === 'str_replace_editor' || name === 'create' || name === 'save') {
    const isView = input.command === 'view' || input.command === 'list_files';
    if (isView) {
      return {
        type: 'CodeRead',
        filePath: input.path || input.file_path || '',
        tokens: 0,
      };
    }
    return {
      type: 'CodeWrite',
      filePath: input.path || input.file_path || '',
      before: input.old_str || input.old_string || '',
      after: input.new_str || input.new_string || input.content || input.insert_line || '',
      instruction: input.instruction || `Command: ${input.command || 'write'}`
    };
  }

  // 3. Delete operations.
  if (name === 'delete' || name === 'remove' || name === 'rm' || name === 'delete_file') {
    return {
      type: 'CodeDelete',
      filePath: input.path || input.file_path || '',
      instruction: input.reason || ''
    };
  }

  // 4. Move operations.
  if (name === 'move' || name === 'rename' || name === 'mv') {
    return {
      type: 'CodeMove',
      sourcePath: input.source || input.old_path || input.from || '',
      targetPath: input.destination || input.new_path || input.to || ''
    };
  }

  // 5. Search operations.
  if (name === 'grep' || name === 'find' || name === 'search') {
    return {
      type: 'CodeSearch',
      query: input.query || input.pattern || input.regex || '',
      path: input.path || input.dir || ''
    };
  }

  // 6. Read operations.
  if (name === 'view' || name === 'read_file' || name === 'glob' || name === 'list_files' || name === 'ls') {
    return {
      type: 'CodeRead',
      filePath: input.path || input.pattern || input.file_path || input.dir_path || '',
      tokens: 0,
    };
  }

  // 7. Multimodal GUI operations.
  if (name === 'computer' || name === 'computer_use' || input.action) {
    const actionType = input.action || 'unknown';
    if (actionType === 'screenshot') {
       return { type: 'ScreenCapture', imageId: '', description: 'Taking a screenshot' };
    }
    return {
      type: 'ComputerUse',
      actionType,
      coordinate: input.coordinate ? [input.coordinate[0], input.coordinate[1]] : undefined,
      text: input.text || '',
      description: `Action: ${actionType}`
    };
  }

  // 8. Task-management tools.
  if (name === 'TaskCreate') {
    return {
      type: 'TaskCreate',
      subject: input.subject || '',
      description: input.description || '',
      activeForm: input.activeForm
    };
  }

  if (name === 'TaskUpdate') {
    return {
      type: 'TaskUpdate',
      taskId: input.taskId || '',
      status: input.status,
      subject: input.subject
    };
  }

  // Fall back to a generic action for all other tools.
  return {
    type: 'GenericToolCall',
    name: name,
    input: input,
    description: `Tool: ${name}`
  };

}

function setParsedActionWithPriority(entry: LogEntry, newAction: AgentAction) {
  if (!entry.parsedAction) {
    entry.parsedAction = newAction;
    return;
  }
  const priority = { 'CodeWrite': 4, 'CodeDelete': 4, 'CodeMove': 4, 'ComputerUse': 3, 'ScreenCapture': 3, 'TerminalCommand': 2, 'UserImage': 2, 'CodeRead': 1, 'CodeSearch': 1, 'AgentThought': 0 };
  const currentPrio = (priority as any)[entry.parsedAction.type] || 0;
  const newPrio = (priority as any)[newAction.type] || 0;
  if (newPrio >= currentPrio) {
    entry.parsedAction = newAction;
  }
}

function extractExitCodeFromResult(result: unknown): number | null {
  if (typeof result === 'number' && Number.isInteger(result)) {
    return result;
  }

  if (typeof result === 'string') {
    const match = result.match(/exit code\s+(-?\d+)/i) || result.match(/\bexit[_ ]?code\b\s*[:=]?\s*(-?\d+)/i);
    return match ? Number(match[1]) : null;
  }

  if (Array.isArray(result)) {
    for (const item of result) {
      const exitCode = extractExitCodeFromResult(item);
      if (exitCode !== null) return exitCode;
    }
    return null;
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const directCandidates = [record.exitCode, record.exit_code, record.code];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'number' && Number.isInteger(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && /^-?\d+$/.test(candidate.trim())) {
        return Number(candidate);
      }
    }

    for (const value of Object.values(record)) {
      const exitCode = extractExitCodeFromResult(value);
      if (exitCode !== null) return exitCode;
    }
  }

  return null;
}

function stringifyTerminalResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    const stdout = typeof record.stdout === 'string' ? record.stdout : '';
    const stderr = typeof record.stderr === 'string' ? record.stderr : '';
    const combined = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '');
    if (combined) return combined;
  }
  return JSON.stringify(result, null, 2);
}

function updateAgentActionWithResult(action: AgentAction, result: any, isError: boolean, entryId: string) {
  if (Array.isArray(result)) {
     const imageBlock = result.find(b => b.type === 'image' && b.source && b.source.data);
     if (imageBlock && (action.type === 'ScreenCapture' || action.type === 'ComputerUse')) {
        const imageId = `img_${entryId}`;
        saveImage(imageId, imageBlock.source.data).catch(console.error);
        if (action.type === 'ScreenCapture') action.imageId = imageId;
     }
  }
  const resultText = stringifyTerminalResult(result);

  // 1. Terminal command result.
  if (action.type === 'TerminalCommand') {
    action.output = resultText;
    action.exitCode = extractExitCodeFromResult(result) ?? (isError ? 1 : 0);
    if (isError) {
      if (result && typeof result === 'object' && !Array.isArray(result) && typeof (result as Record<string, unknown>).stderr === 'string') {
        action.stderr = (result as Record<string, unknown>).stderr as string;
      } else {
        action.stderr = resultText;
      }
    }
  }

  // 2. File read result.
  if (action.type === 'CodeRead') {
    action.content = resultText;
  }

  // 3. Search result.
  if (action.type === 'CodeSearch') {
    action.results = resultText;
  }
}

// ============ Categorization Helpers ============

export function categorizeEntry(entry: LogEntry): EntryCategory {
  if (entry.type === 'summary') return 'SUMMARY';
  if (entry.type === 'system') return 'SYSTEM';
  if (entry.type === 'file_history' || entry.type === 'file-history-snapshot') return 'FILE_HISTORY';

  if (entry.type === 'assistant') {
    const content = entry.message?.content || [];
    const contentArray = Array.isArray(content) ? content : [];
    if (contentArray.some((b) => b.type === 'tool_use')) return 'ASSISTANT_TOOL_CALL';
    if (contentArray.some((b) => b.type === 'thinking')) return 'ASSISTANT_THINKING_RESPONSE';
    return 'ASSISTANT_TEXT';
  }

  if (entry.type === 'user') {
    const content = entry.message?.content;
    if (typeof content === 'string') return 'USER_INPUT';
    if (Array.isArray(content)) {
      if (content.some((b) => b.type === 'tool_result' && Boolean((b as ToolResultBlock).is_error))) return 'TOOL_ERROR';
      if (content.some((b) => b.type === 'tool_result')) return 'TOOL_RESULT';
      if (content.some((b) => b.type === 'image')) return 'USER_INPUT_WITH_IMAGE';
      return 'USER_INPUT';
    }
  }
  return 'UNKNOWN';
}

export function isRealUserInput(entry: LogEntry): boolean {
  const category = entry._category || categorizeEntry(entry);
  return category === 'USER_INPUT' || category === 'USER_INPUT_WITH_IMAGE';
}

export function extractUserText(entry: LogEntry): string {
  const content = entry.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  }
  return '';
}

function sanitizeTokenValue(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  return (isNaN(num) || num < 0 || num > MAX_TOKEN_VALUE) ? 0 : num;
}

function extractTokenUsage(entry: LogEntry) {
  const usage = entry.message?.usage;
  if (!usage) return null;
  const inputTokens = sanitizeTokenValue(usage.input_tokens);
  const outputTokens = sanitizeTokenValue(usage.output_tokens);
  // Prompt caching moves nearly all of a session's input through these two
  // counters — on a long session they outweigh input_tokens by orders of
  // magnitude, so a total that omits them is not a total.
  const cacheReadTokens = sanitizeTokenValue(usage.cache_read_input_tokens);
  const cacheWriteTokens = sanitizeTokenValue(usage.cache_creation_input_tokens);
  const totalTokens = sanitizeTokenValue(
    (usage as any).total_tokens ?? inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  );
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens };
}

function getTimestamp(entry: LogEntry): number {
  return entry.timestamp ? new Date(entry.timestamp).getTime() : NaN;
}

function extractToolUseFromContent(contentItem: ContentBlock): { id: string; name: string; input: unknown } | null {
  if (contentItem.type === 'tool_use') {
    const toolUse = contentItem as ToolUseBlock;
    return { id: toolUse.id, name: toolUse.name, input: toolUse.input };
  }
  return null;
}

function processToolResult(contentItem: ContentBlock): { toolUseId: string; content: unknown; isError: boolean } | null {
  if (contentItem.type === 'tool_result') {
    const result = contentItem as ToolResultBlock;
    return { toolUseId: result.tool_use_id, content: result.content, isError: Boolean(result.is_error) };
  }
  return null;
}

function stringifyResultContent(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

// ============ Main Parse Function ============

// A session accumulates parse state so that streamed log lines can be folded in
// one at a time. Re-parsing the whole file on every appended entry is O(n^2)
// and dominates everything else in a long live session.
export interface LogSession {
  entries: LogEntry[];
  resolvedToolCalls: ToolCall[];
  pendingToolCalls: Map<string, ToolCall>;
  tokenUsage: ParsedLogData['tokenUsage'];
  turnDurations: ParsedLogData['turnDurations'];
  errors: ParseError[];
  lineNumber: number;
  // Running aggregates, so stats never require a full re-scan.
  userMessages: number;
  assistantMessages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  minTimestamp: number;
  maxTimestamp: number;
  models: Set<string>;
}

export function createLogSession(): LogSession {
  return {
    entries: [],
    resolvedToolCalls: [],
    pendingToolCalls: new Map(),
    tokenUsage: [],
    turnDurations: [],
    errors: [],
    lineNumber: 0,
    userMessages: 0,
    assistantMessages: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    minTimestamp: Infinity,
    maxTimestamp: -Infinity,
    models: new Set(),
  };
}

function ingestLine(session: LogSession, line: string): void {
  const {
    entries,
    resolvedToolCalls: toolCalls,
    pendingToolCalls,
    tokenUsage,
    turnDurations,
    errors,
  } = session;
  const lineIndex = session.lineNumber++;

  try {
    const entry = JSON.parse(line) as LogEntry;
    entry._category = categorizeEntry(entry);
    entries.push(entry);

    if (isRealUserInput(entry)) session.userMessages++;
    if (entry.type === 'assistant') session.assistantMessages++;
    if (entry.message?.model) session.models.add(entry.message.model);

    const ts = getTimestamp(entry);
    if (!isNaN(ts)) {
      if (ts < session.minTimestamp) session.minTimestamp = ts;
      if (ts > session.maxTimestamp) session.maxTimestamp = ts;
    }

    // Assistant message handling.
    if (entry.type === 'assistant' && entry.message) {
      const contentArray = Array.isArray(entry.message.content) ? entry.message.content : [];
      let hasToolUse = false;
      let assistantText = '';

      contentArray.forEach((item) => {
        if (item.type === 'thinking') {
          setParsedActionWithPriority(entry, { type: 'AgentThought', text: (item as any).thinking });
        } else if (item.type === 'text') {
          assistantText += (item as any).text + '\n';
        }
        const toolUse = extractToolUseFromContent(item);
        if (toolUse) {
          hasToolUse = true;
          const toolCall: ToolCall = { id: toolUse.id, name: toolUse.name, input: toolUse.input, timestamp: entry.timestamp };
          pendingToolCalls.set(toolCall.id, toolCall);
          const action = createInitialAgentAction(item as ToolUseBlock);
          if (action) {
            setParsedActionWithPriority(entry, action);
            (toolCall as any).sourceEntry = entry;
          }
        }
      });

      // Pure text assistant replies become AssistantText actions.
      if (!hasToolUse && assistantText.trim()) {
        setParsedActionWithPriority(entry, { type: 'AssistantText', content: assistantText.trim() });
      }
    }

    // Sub-agent task handling.
    if (entry.toolUseResult?.content) {
      entry.toolUseResult.content.forEach((item) => {
        const action = createInitialAgentAction(item as any);
        if (action) setParsedActionWithPriority(entry, action);
      });
    }

    // User message handling.
    if (entry.type === 'user' && entry.message) {
      const contentArray = Array.isArray(entry.message.content) ? entry.message.content : [];
      let userText = '';
      let hasImage = false;
      let hasToolResult = false;

      contentArray.forEach((item) => {
        // User-uploaded image.
        if (item.type === 'image' && (item as any).source?.data) {
          hasImage = true;
          const imageId = `user_img_${entry.uuid}`;
          saveImage(imageId, (item as any).source.data).catch(console.error);
          setParsedActionWithPriority(entry, { type: 'UserImage', imageId, description: 'User upload' });
        } else if (item.type === 'text') {
          userText += (item as any).text + '\n';
        }
        // Match tool results back to their pending tool calls.
        const result = processToolResult(item);
        if (result?.toolUseId) {
          hasToolResult = true;
          setParsedActionWithPriority(entry, {
            type: 'TaskResult',
            toolUseId: result.toolUseId,
            content: stringifyResultContent(result.content),
            isError: result.isError
          });
          const toolCall = pendingToolCalls.get(result.toolUseId);
          if (toolCall) {
            toolCall.result = result.content;
            toolCall.isError = result.isError;
            // Both timestamps are in hand here, and analysisEngine and
            // patternExtractor already report per-tool durations — without
            // this they were averaging a field nothing ever set.
            // Wall clock, so it includes any wait for a permission prompt.
            const startedAt = new Date(toolCall.timestamp).getTime();
            const endedAt = new Date(entry.timestamp).getTime();
            if (!Number.isNaN(startedAt) && !Number.isNaN(endedAt) && endedAt >= startedAt) {
              toolCall.durationMs = endedAt - startedAt;
            }
            toolCalls.push(toolCall);
            pendingToolCalls.delete(result.toolUseId);
            const sourceEntry = (toolCall as any).sourceEntry as LogEntry | undefined;
            if (sourceEntry?.parsedAction) {
              updateAgentActionWithResult(sourceEntry.parsedAction, result.content, result.isError, entry.uuid);
            }
          } else {
            // If no matching tool call is found, emit a standalone TaskResult action.
            setParsedActionWithPriority(entry, {
              type: 'TaskResult',
              toolUseId: result.toolUseId,
              content: stringifyResultContent(result.content),
              isError: result.isError
            });
          }
        }
      });

      // Handle toolUseResult objects attached directly to the entry.
      if (!hasToolResult && entry.toolUseResult) {
        hasToolResult = true;
        // Convert the direct toolUseResult into a TaskResult action.
        const resultContent = entry.toolUseResult.content
          ? (typeof entry.toolUseResult.content === 'string'
            ? entry.toolUseResult.content
            : JSON.stringify(entry.toolUseResult.content, null, 2))
          : JSON.stringify(entry.toolUseResult, null, 2);

        setParsedActionWithPriority(entry, {
          type: 'TaskResult',
          toolUseId: entry.toolUseResult.status === 'error' ? `error-${entry.uuid}` : entry.uuid,
          content: resultContent,
          isError: entry.toolUseResult.status === 'error'
        });
      }

      // Pure user text without images or tool results becomes a UserMessage action.
      if (!hasImage && !hasToolResult && userText.trim()) {
        setParsedActionWithPriority(entry, { type: 'UserMessage', content: userText.trim() });
      }
    }

    // Token accounting and stats.
    const usage = extractTokenUsage(entry);
    if (usage) {
      tokenUsage.push({ timestamp: entry.timestamp, ...usage });
      session.inputTokens += usage.inputTokens;
      session.outputTokens += usage.outputTokens;
      session.cacheReadTokens += usage.cacheReadTokens;
      session.cacheWriteTokens += usage.cacheWriteTokens;
      session.totalTokens += usage.totalTokens;
      if (entry.parsedAction) {
        entry.parsedAction.usage = { input: usage.inputTokens, output: usage.outputTokens, total: usage.totalTokens };
      }
    }

    if (entry.type === 'system' && (entry.subtype === 'turn_duration' || entry.durationMs)) {
      turnDurations.push({ timestamp: entry.timestamp, durationMs: entry.durationMs || 0, messageCount: entry.messageCount || 0 });
    }
  } catch (e) {
    errors.push({ line: lineIndex + 1, raw: line, error: e as Error });
  }
}

// Fold raw JSONL text into the session and return the updated snapshot.
export function appendLogContent(session: LogSession, content: string): ParseResult {
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    ingestLine(session, line);
  }
  return buildParseResult(session);
}

// Snapshots copy the accumulated arrays: consumers rely on reference changes to
// detect updates, and the session keeps mutating its own copies.
function buildParseResult(session: LogSession): ParseResult {
  const toolCalls = session.pendingToolCalls.size > 0
    ? [...session.resolvedToolCalls, ...session.pendingToolCalls.values()]
    : session.resolvedToolCalls.slice();

  const entries = session.entries.slice();
  const tokenUsage = session.tokenUsage.slice();
  const turnDurations = session.turnDurations.slice();

  return {
    data: {
      entries,
      stats: buildStats(session, toolCalls.length),
      toolCalls,
      tokenUsage,
      turnDurations,
    },
    errors: session.errors.slice(),
  };
}

function buildStats(session: LogSession, toolCallCount: number): SessionStats {
  const hasRange = session.maxTimestamp > session.minTimestamp;

  return {
    totalMessages: session.entries.length,
    userMessages: session.userMessages,
    assistantMessages: session.assistantMessages,
    toolCalls: toolCallCount,
    totalTokens: session.totalTokens,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
    sessionDuration: hasRange ? session.maxTimestamp - session.minTimestamp : 0,
    modelsUsed: Array.from(session.models),
  };
}

export function parseLog(content: string): ParseResult {
  return appendLogContent(createLogSession(), content);
}

export function formatDuration(ms: number): string {
  if (isNaN(ms) || ms <= 0) return '0m 0s';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function formatTokens(tokens: number): string {
  if (isNaN(tokens) || tokens < 0) return '0';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

// --- Compress a session for AI analysis ---
export function compressLogEntries(entries: LogEntry[]): string {
  const compressedLines: string[] = [];

  for (const entry of entries) {
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'unknown time';

    // User messages.
    if (entry.type === 'user') {
      let userText = '';
      if (typeof entry.message?.content === 'string') {
        userText = entry.message.content;
      } else if (Array.isArray(entry.message?.content)) {
        userText = entry.message.content
          .filter(block => (block as any).type === 'text')
          .map(block => (block as any).text)
          .join('\n');
      }
      if (userText.trim()) {
        const truncated = userText.trim().slice(0, 300);
        compressedLines.push(`[${timestamp}] User: ${truncated}${userText.length > 300 ? '...' : ''}`);
      }
      continue;
    }

    // Assistant messages.
    if (entry.type === 'assistant') {
      const contentBlocks = Array.isArray(entry.message?.content) ? entry.message.content : [];

      // Extract thinking.
      const thinkingBlock = contentBlocks.find(block => block.type === 'thinking');
      if ((thinkingBlock as any)?.thinking) {
        const shortThinking = (thinkingBlock as any).thinking.slice(0, 200) + ((thinkingBlock as any).thinking.length > 200 ? '...' : '');
        compressedLines.push(`[${timestamp}] Assistant thinking: ${shortThinking}`);
      }

      // Extract tool calls.
      const toolUseBlocks = contentBlocks.filter(block => block.type === 'tool_use');
      for (const toolUse of toolUseBlocks) {
        const toolUseTyped = toolUse as ToolUseBlock;
        const name = toolUseTyped.name.toLowerCase();
        const input = (toolUseTyped.input || {}) as Record<string, unknown>;

        if (name === 'bash' || name === 'execute_command') {
          const cmd = ((input.command as string) || (input.script as string) || '').trim();
          const truncated = cmd.slice(0, 300);
          compressedLines.push(`[${timestamp}] Assistant ran command: ${truncated}${cmd.length > 300 ? '...' : ''}`);
        } else if (name === 'edit' || name === 'write' || name === 'str_replace_editor') {
          const filePath = input.path || input.file_path || 'unknown file';
          const action = input.command === 'view' ? 'viewed file' : 'modified file';
          compressedLines.push(`[${timestamp}] Assistant ${action}: ${filePath}`);
        } else if (name === 'delete' || name === 'remove') {
          const filePath = input.path || input.file_path || 'unknown file';
          compressedLines.push(`[${timestamp}] Assistant deleted file: ${filePath}`);
        } else if (name === 'move' || name === 'rename' || name === 'mv') {
          const from = input.source || input.from || 'old path';
          const to = input.destination || input.to || 'new path';
          compressedLines.push(`[${timestamp}] Assistant renamed/moved: ${from} -> ${to}`);
        } else if (name === 'grep' || name === 'search' || name === 'find') {
          const query = input.query || input.pattern || '';
          compressedLines.push(`[${timestamp}] Assistant searched: ${query}`);
        } else if (name === 'view' || name === 'read_file' || name === 'glob' || name === 'ls') {
          const filePath = input.path || input.pattern || input.file_path || '';
          compressedLines.push(`[${timestamp}] Assistant read/listed files: ${filePath}`);
        } else if (name === 'computer' || name === 'computer_use') {
          const action = input.action || 'unknown action';
          compressedLines.push(`[${timestamp}] Assistant used computer: ${action}`);
        } else {
          compressedLines.push(`[${timestamp}] Assistant called tool: ${name}`);
        }
      }

      // Extract text replies.
      const textBlocks = contentBlocks.filter(block => block.type === 'text');
      if (textBlocks.length > 0) {
        const text = textBlocks.map(block => (block as any).text).join('\n').trim();
        if (text) {
          const truncated = text.slice(0, 500);
          compressedLines.push(`[${timestamp}] Assistant reply: ${truncated}${text.length > 500 ? '...' : ''}`);
        }
      }

      // Record tool results only when they are errors.
      const toolResultBlocks = contentBlocks.filter(block => block.type === 'tool_result' && (block as any).is_error);
      for (const result of toolResultBlocks) {
        const resultTyped = result as ToolResultBlock;
        const errorContent = typeof resultTyped.content === 'string' ? resultTyped.content : JSON.stringify(resultTyped.content);
        const truncated = errorContent.slice(0, 300);
        compressedLines.push(`[${timestamp}] Tool execution error: ${truncated}${errorContent.length > 300 ? '...' : ''}`);
      }
    }
  }

  return compressedLines.join('\n');
}
