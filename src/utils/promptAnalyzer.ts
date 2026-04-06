import type { LogEntry, ParsedLogData } from '../types/log';
import type {
  PromptAnalysis,
  PromptIssue,
  PromptSuggestion,
  PromptStats,
  IssueType,
  Severity,
} from '../types/prompt';
import { isRealUserInput, extractUserText } from './logParser';

// 从日志条目中提取用户提示词（只提取真正的用户输入，跳过 tool_result）
function extractUserPrompts(entries: LogEntry[]): Array<{ entry: LogEntry; index: number; text: string }> {
  const prompts: Array<{ entry: LogEntry; index: number; text: string }> = [];

  entries.forEach((entry, index) => {
    if (isRealUserInput(entry)) {
      const text = extractUserText(entry);
      if (text.trim().length > 0) {
        prompts.push({ entry, index, text });
      }
    }
  });

  return prompts;
}

// 检查提示词是否过于简短
function checkTooShort(text: string): PromptIssue | null {
  if (text.length < 20) {
    return {
      id: `too-short-${Date.now()}`,
      type: 'too_short',
      severity: 'high',
      title: '提示词过于简短',
      description: '提示词可能缺少必要的细节和上下文',
      location: { entryIndex: -1, charStart: 0, charEnd: text.length },
      suggestion: '请增加更多细节：描述目标、提供上下文、说明约束条件、定义输出格式',
    };
  }
  if (text.length < 50) {
    return {
      id: `too-short-${Date.now()}`,
      type: 'too_short',
      severity: 'medium',
      title: '提示词偏短',
      description: '提示词可能不够具体',
      location: { entryIndex: -1, charStart: 0, charEnd: text.length },
      suggestion: '考虑添加角色设定、步骤说明或示例来丰富提示词',
    };
  }
  return null;
}

// 检查是否缺少结构
function checkNoStructure(text: string): PromptIssue | null {
  const hasStructure =
    text.includes('1.') ||
    text.includes('2.') ||
    text.includes('•') ||
    text.includes('- ') ||
    text.includes('###') ||
    text.includes('**') ||
    text.toLowerCase().includes('step') ||
    text.toLowerCase().includes('请');

  if (text.length > 100 && !hasStructure) {
    return {
      id: `no-structure-${Date.now()}`,
      type: 'no_structure',
      severity: 'medium',
      title: '缺少结构化',
      description: '长提示词建议使用列表、标题等结构来组织内容',
      location: { entryIndex: -1 },
      suggestion: '使用数字列表、项目符号、标题等方式组织提示词，使其更易读',
    };
  }
  return null;
}

// 检查是否缺少角色设定
function checkMissingRole(text: string): PromptIssue | null {
  const roleKeywords = [
    '作为',
    '充当',
    '你是一个',
    '请做一位',
    '扮演',
    'act as',
    'you are a',
    'as a',
  ];

  const hasRole = roleKeywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  if (text.length > 100 && !hasRole) {
    return {
      id: `missing-role-${Date.now()}`,
      type: 'missing_role',
      severity: 'low',
      title: '缺少角色设定',
      description: '为 AI 设定角色可以获得更专业的回答',
      location: { entryIndex: -1 },
      suggestion: '在提示词开头添加角色设定，例如"作为资深开发专家..."或"请充当产品经理..."',
    };
  }
  return null;
}

// 检查是否缺少输出格式
function checkNoOutputFormat(text: string): PromptIssue | null {
  const formatKeywords = [
    '格式',
    '输出',
    'json',
    'markdown',
    '列表',
    '表格',
    'format',
    'output',
    'return',
  ];

  const hasFormat = formatKeywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  if (text.length > 150 && !hasFormat) {
    return {
      id: `no-output-format-${Date.now()}`,
      type: 'no_output_format',
      severity: 'low',
      title: '缺少输出格式说明',
      description: '明确定义输出格式可以让回答更符合预期',
      location: { entryIndex: -1 },
      suggestion: '说明期望的输出格式，例如"请用 JSON 格式返回"或"请按以下列表格式输出"',
    };
  }
  return null;
}

// 检查是否缺少示例
function checkNoExamples(text: string): PromptIssue | null {
  const exampleKeywords = [
    '例如',
    '比如',
    '示例',
    'example',
    'for example',
    'e.g.',
  ];

  const hasExamples = exampleKeywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  const hasQuotes = text.includes('"') && text.split('"').length > 4;
  const hasCodeBlocks = text.includes('```');

  if (text.length > 200 && !hasExamples && !hasQuotes && !hasCodeBlocks) {
    return {
      id: `no-examples-${Date.now()}`,
      type: 'no_examples',
      severity: 'low',
      title: '缺少示例',
      description: '提供示例可以让 AI 更准确理解你的需求',
      location: { entryIndex: -1 },
      suggestion: '添加 1-2 个示例来说明期望的输出，使用引号或代码块包含示例内容',
    };
  }
  return null;
}

// 检查负面表述
function checkNegative(text: string): PromptIssue | null {
  const negativePatterns = [
    /不要\s*/g,
    /不能\s*/g,
    /不可以\s*/g,
    /别\s*/g,
    /避免\s*/g,
    /禁止\s*/g,
    /don't\s*/gi,
    /do not\s*/gi,
    /never\s*/gi,
    /avoid\s*/gi,
  ];

  let matchCount = 0;
  for (const pattern of negativePatterns) {
    const matches = text.match(pattern);
    if (matches) matchCount += matches.length;
  }

  if (matchCount >= 3) {
    return {
      id: `negative-${Date.now()}`,
      type: 'negative',
      severity: 'medium',
      title: '负面表述较多',
      description: '正面描述通常比负面禁止更有效',
      location: { entryIndex: -1 },
      suggestion: '将"不要做 X"改为"请做 Y"，用正面指令代替负面禁止',
    };
  }
  return null;
}

// 检查重复内容
function checkRepeated(text: string): PromptIssue | null {
  const sentences = text.split(/[。！？.!?\n]+/).filter((s) => s.trim().length > 10);

  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const similarity = calculateSimilarity(sentences[i], sentences[j]);
      if (similarity > 0.8) {
        return {
          id: `repeated-${Date.now()}`,
          type: 'repeated',
          severity: 'low',
          title: '存在重复内容',
          description: '相似的句子可能会浪费 token',
          location: { entryIndex: -1 },
          suggestion: '合并或删除重复的表述，保持提示词简洁',
        };
      }
    }
  }
  return null;
}

// 计算两个字符串的相似度（简单版本）
function calculateSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(shorter, longer);
  return 1.0 - editDistance / longer.length;
}

// Levenshtein 距离
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

// 生成优化建议
function generateSuggestions(text: string): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];

  // 建议添加角色设定
  if (text.length > 100 && !text.includes('作为') && !text.includes('充当')) {
    suggestions.push({
      id: `suggestion-role-${Date.now()}`,
      original: text.slice(0, 100) + '...',
      improved: '作为[角色名称]，请帮我' + text.slice(0, 100),
      explanation: '添加角色设定可以让 AI 以更专业的视角回答问题',
      impact: 'medium',
      category: '角色设定',
    });
  }

  // 建议添加结构
  if (text.length > 150 && !text.includes('1.') && !text.includes('•')) {
    suggestions.push({
      id: `suggestion-structure-${Date.now()}`,
      original: text.slice(0, 150) + '...',
      improved: '请按以下步骤处理：\n1. [步骤1]\n2. [步骤2]\n3. [步骤3]\n\n' + text.slice(0, 100),
      explanation: '结构化提示词让 AI 更容易理解和执行',
      impact: 'medium',
      category: '结构优化',
    });
  }

  // 建议添加输出格式
  if (text.length > 150 && !text.toLowerCase().includes('json') && !text.toLowerCase().includes('格式')) {
    suggestions.push({
      id: `suggestion-format-${Date.now()}`,
      original: text.slice(0, 100) + '...',
      improved: text.slice(0, 100) + '\n\n请用 JSON 格式返回结果，包含以下字段：[字段列表]',
      explanation: '明确定义输出格式可以确保结果符合预期',
      impact: 'large',
      category: '输出格式',
    });
  }

  return suggestions;
}

// 从条目提取文本
function extractTextFromEntry(entry: LogEntry): string {
  return extractUserText(entry);
}

// 计算成功率（基于工具调用成功率、重试次数等）
function calculateSuccessRate(entries: LogEntry[]): number {
  let toolCalls = 0;
  let successfulToolCalls = 0;
  let retries = 0;

  entries.forEach((entry, index) => {
    // 检测工具调用
    if (entry.type === 'assistant' && entry.message?.content) {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        const hasToolUse = content.some((c) => c.type === 'tool_use');
        if (hasToolUse) {
          toolCalls++;
          // 简化判断：假设大多数工具调用成功
          successfulToolCalls++;
        }
      }
    }

    // 检测重试（简单 heuristic）
    if (isRealUserInput(entry) && index > 0) {
      const text = extractTextFromEntry(entry);
      if (text.includes('不对') || text.includes('错了') || text.includes('重新')) {
        retries++;
      }
    }
  });

  if (toolCalls === 0) {
    return Math.max(0, Math.min(100, 90 - retries * 10));
  }

  return Math.round((successfulToolCalls / toolCalls) * 100);
}

// 计算平均重试次数
function calculateAvgRetries(entries: LogEntry[]): number {
  let retries = 0;
  let userMessages = 0;

  entries.forEach((entry, index) => {
    if (isRealUserInput(entry)) {
      userMessages++;
      if (index > 0) {
        const text = extractTextFromEntry(entry);
        if (text.includes('不对') || text.includes('错了') || text.includes('重新')) {
          retries++;
        }
      }
    }
  });

  return userMessages > 0 ? retries / userMessages : 0;
}

// 计算工具调用成功率
function calculateToolCallSuccessRate(entries: LogEntry[]): number {
  let toolCalls = 0;
  let errors = 0;

  entries.forEach((entry) => {
    // 检测工具调用
    if (entry.type === 'assistant' && entry.message?.content) {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        const hasToolUse = content.some((c) => c.type === 'tool_use');
        if (hasToolUse) toolCalls++;
      }
    }
    // 检测错误
    if (entry.type === 'system' && entry.message?.content) {
      const text = String(entry.message.content).toLowerCase();
      if (text.includes('error') || text.includes('错误') || text.includes('failed')) {
        errors++;
      }
    }
  });

  if (toolCalls === 0) return 100;
  return Math.max(0, Math.round(((toolCalls - errors) / toolCalls) * 100));
}

// 主分析函数
export function analyzePrompts(data: ParsedLogData): PromptAnalysis {
  const entries = data.entries;
  const userPrompts = extractUserPrompts(entries);

  const allIssues: PromptIssue[] = [];
  const allSuggestions: PromptSuggestion[] = [];
  const issuesByType: Record<IssueType, number> = {
    vague: 0, too_short: 0, missing_context: 0, no_structure: 0,
    no_examples: 0, no_constraints: 0, no_output_format: 0,
    negative: 0, passive: 0, inefficient_token: 0, repeated: 0,
    missing_role: 0, missing_steps: 0, other: 0,
  };
  const issuesBySeverity: Record<Severity, number> = {
    low: 0, medium: 0, high: 0, critical: 0,
  };

  let totalLength = 0;

  userPrompts.forEach(({ index, text }) => {
    totalLength += text.length;

    const checks = [
      checkTooShort,
      checkNoStructure,
      checkMissingRole,
      checkNoOutputFormat,
      checkNoExamples,
      checkNegative,
      checkRepeated,
    ];

    checks.forEach((check) => {
      const issue = check(text);
      if (issue) {
        issue.location.entryIndex = index;
        allIssues.push(issue);
        issuesByType[issue.type]++;
        issuesBySeverity[issue.severity]++;
      }
    });

    const suggestions = generateSuggestions(text);
    allSuggestions.push(...suggestions);
  });

  // 计算统计
  const successRate = calculateSuccessRate(entries);
  const avgRetries = calculateAvgRetries(entries);
  const toolCallSuccessRate = calculateToolCallSuccessRate(entries);

  const stats: PromptStats = {
    totalPrompts: userPrompts.length,
    totalTokens: estimateTokens(entries),
    avgPromptLength: userPrompts.length > 0 ? Math.round(totalLength / userPrompts.length) : 0,
    issuesByType,
    issuesBySeverity,
    successRate,
    avgRetries,
    toolCallSuccessRate,
  };

  // 最佳实践
  const bestPractices = generateBestPractices(allIssues, stats);

  // 计算总体分数
  const score = calculateScore(stats, allIssues);

  return {
    stats,
    issues: allIssues,
    suggestions: allSuggestions,
    bestPractices,
    score,
  };
}

// 估算 token 数量（粗略估算）
function estimateTokens(entries: LogEntry[]): number {
  let totalChars = 0;
  entries.forEach((entry) => {
    totalChars += JSON.stringify(entry).length;
  });
  return Math.round(totalChars / 4); // 粗略估计：4 字符 ≈ 1 token
}

// 生成最佳实践建议
function generateBestPractices(_issues: PromptIssue[], stats: PromptStats): string[] {
  const practices: string[] = [];

  if (stats.issuesByType.too_short > 0) {
    practices.push('提供足够详细的提示词，包含目标、上下文和约束条件');
  }
  if (stats.issuesByType.no_structure > 0) {
    practices.push('使用列表、标题等结构组织长提示词');
  }
  if (stats.issuesByType.missing_role > 0) {
    practices.push('为 AI 设定专业角色以获得更精准的回答');
  }
  if (stats.issuesByType.no_output_format > 0) {
    practices.push('明确定义期望的输出格式');
  }
  if (stats.issuesByType.no_examples > 0) {
    practices.push('提供 1-2 个示例来说明期望的输出');
  }
  if (stats.issuesByType.negative > 0) {
    practices.push('使用正面指令代替负面禁止');
  }
  if (stats.issuesByType.repeated > 0) {
    practices.push('保持提示词简洁，避免重复表述');
  }

  // 如果没有特定问题，添加通用最佳实践
  if (practices.length === 0) {
    practices.push('使用清晰、具体的语言描述需求');
    practices.push('将复杂任务分解为多个步骤');
    practices.push('提供相关的上下文信息');
    practices.push('明确验收标准和输出格式');
  }

  return practices.slice(0, 6); // 最多返回 6 条
}

// 计算总体分数
function calculateScore(stats: PromptStats, issues: PromptIssue[]): number {
  let score = 100;

  // 按严重程度扣分
  const severityPenalty: Record<Severity, number> = {
    low: 3,
    medium: 8,
    high: 15,
    critical: 25,
  };

  issues.forEach((issue) => {
    score -= severityPenalty[issue.severity];
  });

  // 成功率加分/减分
  score += (stats.successRate - 70) * 0.2;

  // 工具调用成功率加分/减分
  score += (stats.toolCallSuccessRate - 80) * 0.1;

  return Math.max(0, Math.min(100, Math.round(score)));
}
