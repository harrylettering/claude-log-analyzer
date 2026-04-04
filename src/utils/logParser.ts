import type { LogEntry, ParsedLogData, SessionStats, ToolCall, MessageContent } from '../types/log';
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

// Sanitize token values - cap at reasonable max to prevent anomalies
function sanitizeTokenValue(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num) || num < 0) return 0;
  // Cap at MAX_TOKEN_VALUE - anything larger is likely a parsing error
  if (num > MAX_TOKEN_VALUE) return 0;
  return num;
}

// Helper to extract token usage from any nested location in the entry
function extractTokenUsage(entry: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  // Only extract from assistant messages - this is where token usage should be
  const entryObj = entry as Record<string, unknown>;
  if (entryObj.type !== 'assistant') {
    return null;
  }

  // Try common locations for token usage
  const message = entryObj.message as Record<string, unknown> | undefined;
  const locations = [
    message?.usage,
    entryObj.usage,
  ];

  for (const usage of locations) {
    if (usage && typeof usage === 'object') {
      const usageObj = usage as Record<string, unknown>;
      const inputTokens = sanitizeTokenValue(
        usageObj.input_tokens ?? usageObj.inputTokens ?? usageObj.input ?? 0
      );
      const outputTokens = sanitizeTokenValue(
        usageObj.output_tokens ?? usageObj.outputTokens ?? usageObj.output ?? 0
      );
      const totalTokens = sanitizeTokenValue(
        usageObj.total_tokens ?? usageObj.totalTokens ?? usageObj.total ?? (inputTokens + outputTokens)
      );

      if (inputTokens > 0 || outputTokens > 0) {
        return {
          inputTokens,
          outputTokens,
          totalTokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens,
        };
      }
    }
  }

  return null;
}

// Helper to get a valid timestamp from an entry
function getTimestamp(entry: Record<string, unknown>): number {
  const ts = entry.timestamp || entry.time || entry.created_at || entry.created;
  if (!ts) return NaN;

  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  return NaN;
}

function extractToolUseFromContent(contentItem: MessageContent): { id: string; name: string; input: unknown } | null {
  if (contentItem && (contentItem.type === 'tool_use' || contentItem.tool_use)) {
    const toolUse = contentItem.tool_use || contentItem;
    if (toolUse && typeof toolUse === 'object') {
      const toolUseObj = toolUse as Record<string, unknown>;
      return {
        id: String(toolUseObj.id || toolUseObj.tool_use_id || Math.random().toString()),
        name: String(toolUseObj.name || toolUseObj.tool_name || 'unknown'),
        input: toolUseObj.input || toolUseObj.tool_input || {},
      };
    }
  }
  return null;
}

function processToolResult(contentItem: MessageContent): { toolUseId: string; content: unknown; isError: boolean } | null {
  if (contentItem && (contentItem.type === 'tool_result' || contentItem.tool_result)) {
    const result = contentItem.tool_result || contentItem;
    if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>;
      return {
        toolUseId: String(resultObj.tool_use_id || resultObj.id || ''),
        content: resultObj.content || resultObj.output || result,
        isError: Boolean(resultObj.is_error || resultObj.error || false),
      };
    }
  }
  return null;
}

export function parseLog(content: string): ParseResult {
  const lines = content.split('\n').filter(line => line.trim());
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
      entries.push(entry);
      const entryObj = entry as unknown as Record<string, unknown>;

      // Collect valid timestamps
      const ts = getTimestamp(entryObj);
      if (!isNaN(ts)) {
        validTimestamps.push(ts);
      }

      // Try to extract token usage from this entry
      const usage = extractTokenUsage(entry);
      if (usage) {
        tokenUsage.push({
          timestamp: entry.timestamp || new Date().toISOString(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        });
      }

      // Process assistant messages for tool calls
      if (entry.type === 'assistant' && entry.message) {
        const msg = entry.message;
        const contentArray = msg.content || msg;
        if (Array.isArray(contentArray)) {
          contentArray.forEach((contentItem: unknown) => {
            const toolUse = extractToolUseFromContent(contentItem as MessageContent);
            if (toolUse) {
              const toolCall: ToolCall = {
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input,
                timestamp: entry.timestamp || new Date().toISOString(),
              };
              pendingToolCalls.set(toolCall.id, toolCall);
            }
          });
        }
      }

      // Process user messages for tool results
      if (entry.type === 'user' && entry.message) {
        const msg = entry.message;
        const contentArray = msg.content || msg;
        if (Array.isArray(contentArray)) {
          contentArray.forEach((contentItem: unknown) => {
            const result = processToolResult(contentItem as MessageContent);
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
      }

      // Process system turn duration
      if (entry.type === 'system' && (entry.subtype === 'turn_duration' || entry.durationMs)) {
        const entryRecord = entry as unknown as Record<string, unknown>;
        turnDurations.push({
          timestamp: entry.timestamp || new Date().toISOString(),
          durationMs: entry.durationMs || (entryRecord.duration as number) || 0,
          messageCount: entry.messageCount || 0,
        });
      }

      // Process file history snapshots
      if (entry.type === 'file-history-snapshot' || entry.snapshot) {
        const entryRecord = entry as unknown as Record<string, unknown>;
        fileHistory.push({
          timestamp: entry.timestamp || new Date().toISOString(),
          messageId: entry.uuid || (entryRecord.messageId as string) || '',
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

  // Add any remaining pending tool calls
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

function calculateStats(
  entries: LogEntry[],
  tokenUsage: ParsedLogData['tokenUsage'],
  toolCalls: ToolCall[],
  _turnDurations: ParsedLogData['turnDurations'],
  fileHistory: ParsedLogData['fileHistory'],
  validTimestamps: number[]
): SessionStats {
  const userMessages = entries.filter(e => e.type === 'user' && !e.isMeta).length;
  const assistantMessages = entries.filter(e => e.type === 'assistant').length;

  // Calculate token totals - make sure to handle cases where totalTokens isn't provided
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  tokenUsage.forEach(t => {
    const inTok = t.inputTokens || 0;
    const outTok = t.outputTokens || 0;
    const totTok = t.totalTokens || (inTok + outTok);

    inputTokens += inTok;
    outputTokens += outTok;
    totalTokens += totTok;
  });

  // Calculate session duration from valid timestamps
  let sessionDuration = 0;
  if (validTimestamps.length >= 2) {
    const firstTime = Math.min(...validTimestamps);
    const lastTime = Math.max(...validTimestamps);
    sessionDuration = lastTime - firstTime;
  }

  // Get unique models
  const modelsUsed = new Set<string>();
  entries.forEach(entry => {
    const entryRecord = entry as unknown as Record<string, unknown>;
    const model = entry.message?.model || entryRecord.model;
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
