import type { LogEntry, ParsedLogData, ToolCall } from '../types/log';
import type {
  SessionPattern,
  PatternType,
  SuccessRating,
  ToolUsagePattern,
  PromptPattern,
  PatternExtractionConfig,
} from '../types/sessionPattern';
import { isRealUserInput, extractUserText } from './logParser';

const DEFAULT_CONFIG: PatternExtractionConfig = {
  minTokenEfficiency: 30,
  minSteps: 3,
  includeManualPatterns: true,
};

// 分析会话的成功度
function analyzeSuccessRating(data: ParsedLogData): SuccessRating {
  const { stats, toolCalls } = data;

  let score = 50;

  // 工具调用成功率
  if (stats.toolCalls > 0) {
    const successRate = toolCalls.filter(t => !t.isError).length / stats.toolCalls;
    score += (successRate - 0.5) * 30;
  } else {
    score += 10;
  }

  // Token 效率（假设更短的对话达成目标更好）
  const tokenPerMessage = stats.totalTokens / Math.max(stats.totalMessages, 1);
  if (tokenPerMessage < 500) score += 15;
  else if (tokenPerMessage < 1000) score += 10;
  else if (tokenPerMessage < 2000) score += 5;

  // 工具调用成功率加分
  const toolSuccessRate = stats.toolCalls > 0
    ? toolCalls.filter(t => !t.isError).length / stats.toolCalls
    : 1;
  if (toolSuccessRate >= 0.9) score += 15;
  else if (toolSuccessRate >= 0.7) score += 10;
  else if (toolSuccessRate >= 0.5) score += 5;

  // 根据分数返回评级
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'moderate';
  return 'needs_improvement';
}

// 计算 Token 效率分数（0-100）
function calculateTokenEfficiency(data: ParsedLogData): number {
  const { stats } = data;

  // 基础分数
  let score = 50;

  // 每消息 token 数（太少或太多都不好）
  const tokenPerMessage = stats.totalMessages > 0
    ? stats.totalTokens / stats.totalMessages
    : 0;

  if (tokenPerMessage >= 100 && tokenPerMessage <= 500) {
    score += 20;
  } else if (tokenPerMessage >= 50 && tokenPerMessage <= 1000) {
    score += 10;
  } else if (tokenPerMessage > 0) {
    score -= 10;
  }

  // 输入输出比例（平衡的比例更好）
  const ioRatio = stats.outputTokens > 0
    ? stats.inputTokens / stats.outputTokens
    : 1;
  if (ioRatio >= 0.5 && ioRatio <= 2) {
    score += 20;
  } else if (ioRatio >= 0.25 && ioRatio <= 4) {
    score += 10;
  }

  // 工具调用效率（如果有工具调用）
  if (stats.toolCalls > 0) {
    const toolsPerMessage = stats.toolCalls / stats.assistantMessages;
    if (toolsPerMessage >= 0.5 && toolsPerMessage <= 2) {
      score += 10;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// 分析工具使用模式
function analyzeToolPatterns(toolCalls: ToolCall[]): ToolUsagePattern[] {
  const toolMap = new Map<string, {
    count: number;
    totalDuration: number;
    successCount: number;
    inputs: Set<string>;
  }>();

  toolCalls.forEach((tool) => {
    const existing = toolMap.get(tool.name) || {
      count: 0,
      totalDuration: 0,
      successCount: 0,
      inputs: new Set<string>(),
    };

    existing.count++;
    existing.totalDuration += tool.durationMs || 0;
    if (!tool.isError) existing.successCount++;

    // 记录输入样本（简化）
    const inputStr = JSON.stringify(tool.input).slice(0, 100);
    if (inputStr) existing.inputs.add(inputStr);

    toolMap.set(tool.name, existing);
  });

  return Array.from(toolMap.entries()).map(([name, data]) => ({
    toolName: name,
    frequency: data.count,
    averageDurationMs: data.count > 0 ? Math.round(data.totalDuration / data.count) : undefined,
    successRate: data.count > 0 ? data.successCount / data.count : 0,
    typicalInputs: Array.from(data.inputs).slice(0, 3),
  }));
}

// 提取关键提示词模式
function extractKeyPrompts(entries: LogEntry[]): PromptPattern[] {
  const prompts: PromptPattern[] = [];

  entries.forEach((entry, index) => {
    if (!isRealUserInput(entry)) return;

    const text = extractUserText(entry);
    if (!text || text.length < 20) return;

    const variables = extractVariables(text);
    const context = extractContext(entries, index);

    prompts.push({
      id: `prompt-${Date.now()}-${index}`,
      content: text,
      variables,
      context,
      effectivenessScore: estimatePromptEffectiveness(text),
      usageCount: 1,
    });
  });

  // 返回最相关的提示词（最多 5 个）
  return prompts
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    .slice(0, 5);
}

// 提取变量
function extractVariables(_text: string): string[] {
  const variables: string[] = [];
  // 简单的启发式：查找可能需要替换的部分
  // 这可以通过更高级的 NLP 来改进
  return variables;
}

// 提取提示词的上下文
function extractContext(entries: LogEntry[], currentIndex: number): string {
  const contextParts: string[] = [];

  // 查看前几条消息
  for (let i = Math.max(0, currentIndex - 3); i < currentIndex; i++) {
    const entry = entries[i];
    if (entry.type === 'assistant') {
      contextParts.push('assistant_response');
    } else if (entry.type === 'user') {
      contextParts.push('user_message');
    }
  }

  return contextParts.join(' → ');
}

// 估算提示词有效性（0-100）
function estimatePromptEffectiveness(text: string): number {
  let score = 50;

  // 长度因素（太长或太短都不好）
  if (text.length >= 50 && text.length <= 500) score += 20;
  else if (text.length >= 30 && text.length <= 1000) score += 10;

  // 结构因素（有结构更好）
  if (text.includes('1.') || text.includes('•') || text.includes('请')) score += 15;

  // 明确性因素（有明确的要求更好）
  if (text.includes('请') || text.includes('需要') || text.includes('帮我')) score += 10;

  return Math.max(0, Math.min(100, score));
}

// 推断模式类型
function inferPatternType(data: ParsedLogData): PatternType {
  const { toolCalls, entries } = data;

  // 工具调用分析
  const toolNames = new Set(toolCalls.map(t => t.name));
  const hasCodingTools = toolNames.has('Edit') || toolNames.has('Write') || toolNames.has('Read') || toolNames.has('Grep') || toolNames.has('Glob');
  const hasDebugTools = toolNames.has('Bash') && toolCalls.some(t => t.input && JSON.stringify(t.input).includes('test'));
  const hasSearchTools = toolNames.has('WebSearch') || toolNames.has('WebFetch');
  const hasReviewPattern = entries.some(e => {
    const text = extractUserText(e);
    return text && (text.includes('审查') || text.includes('review') || text.includes('检查'));
  });
  const hasTestPattern = entries.some(e => {
    const text = extractUserText(e);
    return text && (text.includes('测试') || text.includes('test'));
  });

  // 步骤分析
  const userInputCount = entries.filter(e => isRealUserInput(e)).length;
  const isMultiStep = userInputCount >= 3;

  if (hasDebugTools) return 'debugging_flow';
  if (hasReviewPattern) return 'review_pattern';
  if (hasTestPattern) return 'testing_pattern';
  if (hasCodingTools) return 'coding_workflow';
  if (hasSearchTools) return 'research_pattern';
  if (isMultiStep) return 'multi_step_task';

  return 'custom';
}

// 提取工作流描述
function extractWorkflow(entries: LogEntry[]): SessionPattern['workflow'] {
  const workflow: SessionPattern['workflow'] = [];
  let order = 0;

  entries.forEach((entry) => {
    if (isRealUserInput(entry)) {
      const text = extractUserText(entry);
      workflow.push({
        stepDescription: text ? text.slice(0, 100) + (text.length > 100 ? '...' : '') : '用户输入',
        stepType: 'user_input',
        order: order++,
      });
    } else if (entry.type === 'assistant') {
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        const hasToolUse = content.some(c => c.type === 'tool_use');
        if (hasToolUse) {
          workflow.push({
            stepDescription: '调用工具',
            stepType: 'tool_call',
            order: order++,
          });
        }
      }
    }
  });

  return workflow;
}

// 从单个会话提取模式
export function extractPatternFromSession(
  data: ParsedLogData,
  sessionName?: string,
  sessionId?: string,
  config: PatternExtractionConfig = DEFAULT_CONFIG
): SessionPattern | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { stats, toolCalls, entries } = data;

  // 基础检查
  if (stats.totalMessages < (cfg.minSteps || 3)) {
    return null;
  }

  const successRating = analyzeSuccessRating(data);
  const tokenEfficiency = calculateTokenEfficiency(data);

  if (tokenEfficiency < (cfg.minTokenEfficiency || 30)) {
    return null;
  }

  const durationMs = stats.sessionDuration;

  const pattern: SessionPattern = {
    id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: generatePatternName(data, successRating),
    description: generatePatternDescription(data),
    type: inferPatternType(data),
    tags: generateTags(data),

    sourceSessionId: sessionId,
    sourceSessionName: sessionName,

    totalSteps: entries.filter(e => isRealUserInput(e)).length,
    durationMs,
    tokenEfficiency,
    successRating,

    toolPatterns: analyzeToolPatterns(toolCalls),
    keyPrompts: extractKeyPrompts(entries),
    workflow: extractWorkflow(entries),

    bestPractices: generateBestPractices(data, successRating),
    pitfalls: generatePitfalls(data, successRating),

    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isFavorite: false,
    isManual: false,
  };

  return pattern;
}

// 生成模式名称
function generatePatternName(data: ParsedLogData, rating: SuccessRating): string {
  const type = inferPatternType(data);
  const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const ratingLabel = rating === 'excellent' ? '优秀' :
                     rating === 'good' ? '良好' :
                     rating === 'moderate' ? '一般' : '需改进';

  return `${typeLabel}模式 (${ratingLabel})`;
}

// 生成模式描述
function generatePatternDescription(data: ParsedLogData): string {
  const { stats } = data;
  return `${stats.totalMessages} 步对话，${stats.toolCalls} 次工具调用，消耗 ${stats.totalTokens.toLocaleString()} tokens`;
}

// 生成标签
function generateTags(data: ParsedLogData): string[] {
  const tags: string[] = [];
  const { toolCalls, stats } = data;

  // 根据工具添加标签
  const toolNames = new Set(toolCalls.map(t => t.name));
  if (toolNames.has('Edit') || toolNames.has('Write')) tags.push('代码修改');
  if (toolNames.has('Read')) tags.push('文件读取');
  if (toolNames.has('Grep') || toolNames.has('Glob')) tags.push('代码搜索');
  if (toolNames.has('Bash')) tags.push('命令执行');
  if (toolNames.has('WebSearch') || toolNames.has('WebFetch')) tags.push('网络搜索');

  // 根据统计添加标签
  if (stats.totalTokens > 10000) tags.push('高Token消耗');
  if (stats.toolCalls > 5) tags.push('多工具调用');
  if (stats.totalMessages > 10) tags.push('长对话');

  return tags;
}

// 生成最佳实践
function generateBestPractices(data: ParsedLogData, rating: SuccessRating): string[] {
  const practices: string[] = [];
  const { toolCalls } = data;

  if (rating === 'excellent' || rating === 'good') {
    practices.push('此模式在当前任务中表现良好');
  }

  const successRate = toolCalls.length > 0
    ? toolCalls.filter(t => !t.isError).length / toolCalls.length
    : 1;
  if (successRate >= 0.8) {
    practices.push('工具调用成功率高，可复用');
  }

  return practices;
}

// 生成注意事项
function generatePitfalls(data: ParsedLogData, rating: SuccessRating): string[] {
  const pitfalls: string[] = [];

  if (rating === 'needs_improvement' || rating === 'moderate') {
    pitfalls.push('此模式可能需要优化后再复用');
  }

  const { toolCalls } = data;
  const errorRate = toolCalls.length > 0
    ? toolCalls.filter(t => t.isError).length / toolCalls.length
    : 0;
  if (errorRate > 0.3) {
    pitfalls.push('工具调用错误率较高，建议检查参数');
  }

  return pitfalls;
}

// 批量从多个会话提取模式
export function extractPatternsFromSessions(
  sessions: Array<{ data: ParsedLogData; name?: string; id?: string }>,
  config: PatternExtractionConfig = DEFAULT_CONFIG
): SessionPattern[] {
  const patterns: SessionPattern[] = [];

  sessions.forEach(({ data, name, id }) => {
    const pattern = extractPatternFromSession(data, name, id, config);
    if (pattern) {
      patterns.push(pattern);
    }
  });

  return patterns;
}
