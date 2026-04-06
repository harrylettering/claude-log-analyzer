import type {
  LogEntry,
  ParsedLogData,
  SessionStats,
  ToolCall,
  EntryCategory,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
} from '../types/log';
import {
  MAX_TOKEN_VALUE,
  TOKEN_FORMATTING,
  TIME_FORMATTING,
} from '../constants';

// 解析错误类型
export interface ParseError {
  line: number;
  raw: string;
  error: Error;
}

export interface ParseResult {
  data: ParsedLogData;
  errors: ParseError[];
}

// ============ 分类函数 ============

export function categorizeEntry(entry: LogEntry): EntryCategory {
  // 特殊类型
  if (entry.type === 'summary') return 'SUMMARY';
  if (entry.type === 'system') return 'SYSTEM';
  if (entry.type === 'file_history' || entry.type === 'file-history-snapshot') {
    return 'FILE_HISTORY';
  }

  // Assistant 消息
  if (entry.type === 'assistant') {
    const content = entry.message?.content || [];
    const contentArray = Array.isArray(content) ? content : [];

    const hasThinking = contentArray.some((b) => b.type === 'thinking');
    const hasToolUse = contentArray.some((b) => b.type === 'tool_use');
    const hasText = contentArray.some((b) => b.type === 'text');

    if (hasToolUse) return 'ASSISTANT_TOOL_CALL';
    if (hasThinking && hasText) return 'ASSISTANT_THINKING_RESPONSE';
    return 'ASSISTANT_TEXT';
  }

  // User 消息
  if (entry.type === 'user') {
    const content = entry.message?.content;

    // 纯字符串 content → 真实用户输入
    if (typeof content === 'string') return 'USER_INPUT';

    if (Array.isArray(content)) {
      const hasToolResult = content.some((b) => b.type === 'tool_result');

      if (hasToolResult) {
        // 有 toolUseResult → agent 子任务结果
        if (entry.toolUseResult) return 'AGENT_RESULT';

        // 有 is_error → 工具错误/权限拒绝
        const hasError = content.some(
          (b) => b.type === 'tool_result' && (b as ToolResultBlock).is_error
        );
        if (hasError) return 'TOOL_ERROR';

        return 'TOOL_RESULT';
      }

      // 检查 /model 等斜杠命令
      const textContent = content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (textContent.trim().startsWith('/')) return 'SLASH_COMMAND';

      // 有图片 → 带图用户输入
      const hasImage = content.some((b) => b.type === 'image');
      if (hasImage) return 'USER_INPUT_WITH_IMAGE';

      return 'USER_INPUT';
    }
  }

  return 'UNKNOWN';
}

// ============ 判断是否为真实用户输入 ============

export function isRealUserInput(entry: LogEntry): boolean {
  const category = entry._category || categorizeEntry(entry);
  return category === 'USER_INPUT' || category === 'USER_INPUT_WITH_IMAGE';
}

// ============ 判断是否为用户消息（含工具结果） ============

export function isUserMessage(entry: LogEntry): boolean {
  return entry.type === 'user';
}

// ============ 判断是否为工具结果消息 ============

export function isToolResultMessage(entry: LogEntry): boolean {
  const category = entry._category || categorizeEntry(entry);
  return category === 'TOOL_RESULT' || category === 'TOOL_ERROR' || category === 'AGENT_RESULT';
}

// ============ 从用户消息中提取文本内容 ============

export function extractUserText(entry: LogEntry): string {
  if (!isRealUserInput(entry)) return '';

  const content = entry.message?.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  return '';
}

// ============ Token 处理 ============

function sanitizeTokenValue(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || num < 0) return 0;
  if (num > MAX_TOKEN_VALUE) return 0;
  return num;
}

function extractTokenUsage(entry: LogEntry): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  if (entry.type !== 'assistant') {
    return null;
  }

  const usage = entry.message?.usage;
  if (!usage) return null;

  const inputTokens = sanitizeTokenValue(usage.input_tokens);
  const outputTokens = sanitizeTokenValue(usage.output_tokens);
  const totalTokens = sanitizeTokenValue(
    (usage as any).total_tokens ?? (inputTokens + outputTokens)
  );

  if (inputTokens > 0 || outputTokens > 0) {
    return {
      inputTokens,
      outputTokens,
      totalTokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens,
    };
  }

  return null;
}

function getTimestamp(entry: LogEntry): number {
  const ts = entry.timestamp;
  if (!ts) return NaN;
  return new Date(ts).getTime();
}

// ============ 工具调用处理 ============

function extractToolUseFromContent(contentItem: ContentBlock): { id: string; name: string; input: unknown } | null {
  if (contentItem.type === 'tool_use') {
    const toolUse = contentItem as ToolUseBlock;
    return {
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    };
  }
  return null;
}

function processToolResult(contentItem: ContentBlock): { toolUseId: string; content: unknown; isError: boolean } | null {
  if (contentItem.type === 'tool_result') {
    const result = contentItem as ToolResultBlock;
    return {
      toolUseId: result.tool_use_id,
      content: result.content,
      isError: Boolean(result.is_error),
    };
  }
  return null;
}

// ============ 主解析函数 ============

export function parseLog(content: string): ParseResult {
  const lines = content.split('\n').filter((line) => line.trim());
  const entries: LogEntry[] = [];
  const toolCalls: ToolCall[] = [];
  const tokenUsage: ParsedLogData['tokenUsage'] = [];
  const turnDurations: ParsedLogData['turnDurations'] = [];
  const fileHistory: ParsedLogData['fileHistory'] = [];
  const errors: ParseError[] = [];

  const pendingToolCalls = new Map<string, ToolCall>();
  const validTimestamps: number[] = [];

  lines.forEach((line, lineIndex) => {
    try {
      const entry = JSON.parse(line) as LogEntry;

      // 添加分类
      entry._category = categorizeEntry(entry);

      entries.push(entry);

      // 收集有效时间戳
      const ts = getTimestamp(entry);
      if (!isNaN(ts)) {
        validTimestamps.push(ts);
      }

      // 尝试提取 token 使用量
      const usage = extractTokenUsage(entry);
      if (usage) {
        tokenUsage.push({
          timestamp: entry.timestamp,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        });
      }

      // 处理 assistant 消息中的工具调用
      if (entry.type === 'assistant' && entry.message) {
        const content = entry.message.content;
        const contentArray = Array.isArray(content) ? content : [];

        contentArray.forEach((contentItem) => {
          const toolUse = extractToolUseFromContent(contentItem);
          if (toolUse) {
            const toolCall: ToolCall = {
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
              timestamp: entry.timestamp,
            };
            pendingToolCalls.set(toolCall.id, toolCall);
          }
        });
      }

      // 处理 user 消息中的工具结果
      if (entry.type === 'user' && entry.message) {
        const content = entry.message.content;
        const contentArray = Array.isArray(content) ? content : [];

        contentArray.forEach((contentItem) => {
          const result = processToolResult(contentItem);
          if (result && result.toolUseId) {
            const toolCall = pendingToolCalls.get(result.toolUseId);
            if (toolCall) {
              toolCall.result = result.content;
              toolCall.isError = result.isError;
              toolCalls.push(toolCall);
              pendingToolCalls.delete(result.toolUseId);
            }
          }
        });
      }

      // 处理系统 turn duration
      if (entry.type === 'system' && (entry.subtype === 'turn_duration' || entry.durationMs)) {
        turnDurations.push({
          timestamp: entry.timestamp,
          durationMs: entry.durationMs || 0,
          messageCount: entry.messageCount || 0,
        });
      }

      // 处理文件历史快照
      if (entry.type === 'file-history-snapshot' || entry.snapshot) {
        fileHistory.push({
          timestamp: entry.timestamp,
          messageId: entry.uuid || '',
          files: (entry.snapshot?.trackedFileBackups || entry.snapshot || {}) as Record<string, unknown>,
        });
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      errors.push({
        line: lineIndex + 1,
        raw: line,
        error,
      });
      console.warn(`Failed to parse line ${lineIndex + 1}:`, error);
    }
  });

  // 添加剩余的待处理工具调用
  toolCalls.push(...pendingToolCalls.values());

  const stats = calculateStats(entries, tokenUsage, toolCalls, turnDurations, fileHistory, validTimestamps);

  return {
    data: {
      entries,
      stats,
      toolCalls,
      tokenUsage,
      turnDurations,
      fileHistory,
    },
    errors,
  };
}

// ============ 统计计算 ============

function calculateStats(
  entries: LogEntry[],
  tokenUsage: ParsedLogData['tokenUsage'],
  toolCalls: ToolCall[],
  _turnDurations: ParsedLogData['turnDurations'],
  fileHistory: ParsedLogData['fileHistory'],
  validTimestamps: number[]
): SessionStats {
  const userMessages = entries.filter((e) => isRealUserInput(e)).length;
  const assistantMessages = entries.filter((e) => e.type === 'assistant').length;

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  tokenUsage.forEach((t) => {
    const inTok = t.inputTokens || 0;
    const outTok = t.outputTokens || 0;
    const totTok = t.totalTokens || (inTok + outTok);

    inputTokens += inTok;
    outputTokens += outTok;
    totalTokens += totTok;
  });

  let sessionDuration = 0;
  if (validTimestamps.length >= 2) {
    const firstTime = Math.min(...validTimestamps);
    const lastTime = Math.max(...validTimestamps);
    sessionDuration = lastTime - firstTime;
  }

  const modelsUsed = new Set<string>();
  entries.forEach((entry) => {
    const model = entry.message?.model;
    if (model) {
      modelsUsed.add(String(model));
    }
  });

  return {
    totalMessages: entries.length,
    userMessages,
    assistantMessages,
    toolCalls: toolCalls.length,
    totalTokens,
    inputTokens,
    outputTokens,
    sessionDuration,
    filesModified: fileHistory.length,
    modelsUsed: Array.from(modelsUsed),
  };
}

// ============ 格式化函数 ============

export function formatDuration(ms: number): string {
  if (isNaN(ms) || ms <= 0) return '0m 0s';
  if (ms < TIME_FORMATTING.SECOND_MS) return `${ms}ms`;
  if (ms < TIME_FORMATTING.MINUTE_MS) return `${(ms / TIME_FORMATTING.SECOND_MS).toFixed(1)}s`;
  const minutes = Math.floor(ms / TIME_FORMATTING.MINUTE_MS);
  const seconds = Math.floor((ms % TIME_FORMATTING.MINUTE_MS) / TIME_FORMATTING.SECOND_MS);
  return `${minutes}m ${seconds}s`;
}

export function formatTokens(tokens: number): string {
  if (isNaN(tokens) || tokens < 0) return '0';
  if (tokens >= TOKEN_FORMATTING.MILLION) return `${(tokens / TOKEN_FORMATTING.MILLION).toFixed(2)}M`;
  if (tokens >= TOKEN_FORMATTING.THOUSAND) return `${(tokens / TOKEN_FORMATTING.THOUSAND).toFixed(1)}K`;
  return tokens.toString();
}
