import type { LogEntry } from '../types/log';
import type { SearchFilters, SearchResult, SearchMode, MessageTypeFilter } from '../types/search';

// 检查字符串是否匹配搜索词
function matchesQuery(
  text: string,
  query: string,
  searchMode: SearchMode,
  caseSensitive: boolean
): boolean {
  if (!query) return true;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  switch (searchMode) {
    case 'exact':
      return searchText === searchQuery;
    case 'regex':
      try {
        const regex = new RegExp(query, caseSensitive ? '' : 'i');
        return regex.test(text);
      } catch {
        // 如果正则表达式无效，回退到简单匹配
        return searchText.includes(searchQuery);
      }
    case 'simple':
    default:
      return searchText.includes(searchQuery);
  }
}

// 获取条目的搜索文本
function getEntrySearchText(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// 检查条目类型是否匹配
function matchesMessageType(entry: LogEntry, types: MessageTypeFilter[]): boolean {
  if (types.includes('all')) return true;

  if (types.includes('tool')) {
    // 检查是否包含工具调用
    const content = entry.message?.content;
    const hasTool = Array.isArray(content) && content.some((c: any) =>
      c.type === 'tool_use' || c.type === 'tool_result'
    );
    if (hasTool) return true;
  }

  return types.includes(entry.type as MessageTypeFilter);
}

// 检查工具名称是否匹配
function matchesToolName(entry: LogEntry, toolNames: string[]): boolean {
  if (toolNames.length === 0) return true;

  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;

  return content.some((c: any) => {
    if (c.type === 'tool_use' || c.tool_use) {
      const toolUse = c.tool_use || c;
      const name = toolUse.name || toolUse.tool_name;
      return name && toolNames.includes(name);
    }
    return false;
  });
}

// 检查时间范围
function matchesTimeRange(entry: LogEntry, timeRange: { startTime?: string; endTime?: string }): boolean {
  const entryTime = new Date(entry.timestamp).getTime();

  if (timeRange.startTime) {
    const startTime = new Date(timeRange.startTime).getTime();
    if (entryTime < startTime) return false;
  }

  if (timeRange.endTime) {
    const endTime = new Date(timeRange.endTime).getTime();
    if (entryTime > endTime) return false;
  }

  return true;
}

// 检查 Token 范围
function matchesTokenRange(entry: LogEntry, tokenRange: {
  minInput?: number;
  maxInput?: number;
  minOutput?: number;
  maxOutput?: number;
  minTotal?: number;
  maxTotal?: number;
}): boolean {
  // 如果没有 Token 范围限制，或者条目不是 assistant 类型（没有 Token 数据），则通过
  const hasTokenFilter =
    tokenRange.minInput !== undefined ||
    tokenRange.maxInput !== undefined ||
    tokenRange.minOutput !== undefined ||
    tokenRange.maxOutput !== undefined ||
    tokenRange.minTotal !== undefined ||
    tokenRange.maxTotal !== undefined;

  if (!hasTokenFilter) return true;

  // 从条目中提取 Token 数据
  const usage = entry.message?.usage || (entry as any).usage;
  if (!usage) return false;

  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens :
    typeof usage.inputTokens === 'number' ? usage.inputTokens : 0;
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens :
    typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens :
    typeof usage.totalTokens === 'number' ? usage.totalTokens : (inputTokens + outputTokens);

  if (tokenRange.minInput !== undefined && inputTokens < tokenRange.minInput) return false;
  if (tokenRange.maxInput !== undefined && inputTokens > tokenRange.maxInput) return false;
  if (tokenRange.minOutput !== undefined && outputTokens < tokenRange.minOutput) return false;
  if (tokenRange.maxOutput !== undefined && outputTokens > tokenRange.maxOutput) return false;
  if (tokenRange.minTotal !== undefined && totalTokens < tokenRange.minTotal) return false;
  if (tokenRange.maxTotal !== undefined && totalTokens > tokenRange.maxTotal) return false;

  return true;
}

// 检查是否有错误
function hasErrors(entry: LogEntry): boolean {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;

  return content.some((c: any) => {
    if (c.type === 'tool_result' || c.tool_result) {
      const result = c.tool_result || c;
      return result.is_error || result.error;
    }
    return false;
  });
}

// 检查是否有工具调用
function hasTools(entry: LogEntry): boolean {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;

  return content.some((c: any) =>
    c.type === 'tool_use' || c.tool_use || c.type === 'tool_result' || c.tool_result
  );
}

// 主过滤函数
export function filterEntries(
  entries: LogEntry[],
  filters: SearchFilters
): SearchResult {
  const filtered: LogEntry[] = [];
  let matchCount = 0;

  for (const entry of entries) {
    // 类型过滤
    if (!matchesMessageType(entry, filters.messageTypes)) continue;

    // 工具名称过滤
    if (!matchesToolName(entry, filters.toolNames)) continue;

    // 时间范围过滤
    if (!matchesTimeRange(entry, filters.timeRange)) continue;

    // Token 范围过滤
    if (!matchesTokenRange(entry, filters.tokenRange)) continue;

    // 错误过滤
    if (filters.onlyWithErrors && !hasErrors(entry)) continue;

    // 工具过滤
    if (filters.onlyWithTools && !hasTools(entry)) continue;

    // Sidechain 过滤
    if (filters.onlySidechain && !entry.isSidechain) continue;

    // 搜索词匹配
    const searchText = getEntrySearchText(entry);
    const matches = matchesQuery(
      searchText,
      filters.query,
      filters.searchMode,
      filters.caseSensitive
    );

    if (!matches) continue;

    if (filters.query) matchCount++;
    filtered.push(entry);
  }

  return {
    entries: filtered,
    totalCount: entries.length,
    filteredCount: filtered.length,
    matchCount: filters.query ? matchCount : filtered.length,
  };
}

// 获取所有工具名称
export function getToolNames(entries: LogEntry[]): string[] {
  const toolNames = new Set<string>();

  for (const entry of entries) {
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      const item = c as any;
      if (item.type === 'tool_use' || item.tool_use) {
        const toolUse = item.tool_use || item;
        const name = toolUse.name || toolUse.tool_name;
        if (name) {
          toolNames.add(name);
        }
      }
    }
  }

  return Array.from(toolNames).sort();
}

// 验证正则表达式
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// 高亮匹配的文本
export function highlightText(
  text: string,
  query: string,
  searchMode: SearchMode,
  caseSensitive: boolean
): { parts: Array<{ text: string; highlight: boolean }> } {
  if (!query) return { parts: [{ text, highlight: false }] };

  const parts: Array<{ text: string; highlight: boolean }> = [];
  let lastIndex = 0;

  try {
    const flags = caseSensitive ? 'g' : 'gi';
    let regex: RegExp;

    switch (searchMode) {
      case 'regex':
        regex = new RegExp(query, flags);
        break;
      case 'exact':
        regex = new RegExp(`^${escapeRegex(query)}$`, flags);
        break;
      case 'simple':
      default:
        regex = new RegExp(escapeRegex(query), flags);
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
      }
      parts.push({ text: match[0], highlight: true });
      lastIndex = match.index + match[0].length;

      // 防止无限循环
      if (match[0].length === 0) break;
    }
  } catch {
    // 如果正则表达式失败，不进行高亮
    return { parts: [{ text, highlight: false }] };
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  if (parts.length === 0) {
    parts.push({ text, highlight: false });
  }

  return { parts };
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
