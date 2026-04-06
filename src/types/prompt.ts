
// 提示词问题类型
export type IssueType =
  | 'vague'                // 模糊不清
  | 'too_short'            // 过于简短
  | 'missing_context'      // 缺少上下文
  | 'no_structure'         // 缺少结构
  | 'no_examples'          // 缺少示例
  | 'no_constraints'       // 缺少约束条件
  | 'no_output_format'     // 缺少输出格式
  | 'negative'             // 负面表述
  | 'passive'              // 被动语态
  | 'inefficient_token'    // Token 使用低效
  | 'repeated'             // 重复内容
  | 'missing_role'         // 缺少角色设定
  | 'missing_steps'        // 缺少步骤分解
  | 'other';               // 其他

// 问题严重程度
export type Severity = 'low' | 'medium' | 'high' | 'critical';

// 提示词问题
export interface PromptIssue {
  id: string;
  type: IssueType;
  severity: Severity;
  title: string;
  description: string;
  location: {
    entryIndex: number;
    charStart?: number;
    charEnd?: number;
  };
  suggestion: string;
}

// 优化建议
export interface PromptSuggestion {
  id: string;
  original: string;
  improved: string;
  explanation: string;
  impact: 'small' | 'medium' | 'large';
  category: string;
}

// 提示词统计
export interface PromptStats {
  totalPrompts: number;
  totalTokens: number;
  avgPromptLength: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<Severity, number>;
  successRate: number;
  avgRetries: number;
  toolCallSuccessRate: number;
}

// 提示词分析结果
export interface PromptAnalysis {
  stats: PromptStats;
  issues: PromptIssue[];
  suggestions: PromptSuggestion[];
  bestPractices: string[];
  score: number;  // 0-100
}

// 提示词模板
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'coding' | 'analysis' | 'writing' | 'planning' | 'other';
  tags: string[];
  content: string;
  variables: string[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  isBuiltIn: boolean;
}

// LLM 配置
export interface LLMConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  isDefault: boolean;
}

// 分析报告导出格式
export interface AnalysisReport {
  version: string;
  generatedAt: number;
  sessionInfo: {
    startTime?: number;
    endTime?: number;
    totalEntries: number;
  };
  analysis: PromptAnalysis;
  templates: PromptTemplate[];
}

// 模板库导出格式
export interface TemplateLibraryExport {
  version: string;
  exportedAt: number;
  templates: PromptTemplate[];
}

// 内置模板
export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  {
    id: 'built-in-code-review',
    name: '代码审查',
    description: '全面审查代码质量、安全性和可维护性',
    category: 'coding',
    tags: ['代码审查', '质量保证', '安全'],
    content: `请作为资深代码审查专家，审查以下代码：

\`\`\`
{{CODE}}
\`\`\`

请从以下方面进行审查：
1. **代码质量** - 可读性、命名规范、代码结构
2. **潜在 Bug** - 逻辑错误、边界条件、异常处理
3. **安全性** - 安全漏洞、注入风险、数据验证
4. **性能** - 算法效率、资源使用、优化建议
5. **最佳实践** - 设计模式、架构合理性

请按优先级排序问题，并提供具体的修复建议。`,
    variables: ['CODE'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'built-in-step-by-step',
    name: '分步解决问题',
    description: '引导模型按步骤思考复杂问题',
    category: 'planning',
    tags: ['问题解决', '分步思考', '推理'],
    content: `请帮我解决以下问题：

{{PROBLEM}}

请按以下步骤处理：
1. **理解问题** - 重述问题，确认理解正确
2. **分析目标** - 明确最终目标和验收标准
3. **制定计划** - 列出解决问题的步骤
4. **执行计划** - 逐步实施并解释每个步骤
5. **验证结果** - 检查是否满足所有要求

请确保每个步骤都清晰可追踪。`,
    variables: ['PROBLEM'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'built-in-data-analysis',
    name: '数据分析',
    description: '结构化分析数据并生成洞察',
    category: 'analysis',
    tags: ['数据分析', '可视化', '洞察'],
    content: `请分析以下数据：

{{DATA}}

请完成以下分析：
1. **数据概览** - 数据类型、规模、质量评估
2. **描述性统计** - 关键指标、分布情况
3. **趋势分析** - 时间序列、变化模式
4. **异常检测** -  outliers、异常值
5. **关键洞察** - 最重要的发现
6. **建议行动** - 基于分析的建议

请用清晰的结构呈现分析结果。`,
    variables: ['DATA'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'built-in-documentation',
    name: '文档生成',
    description: '生成高质量的技术文档',
    category: 'writing',
    tags: ['文档', '技术写作', '注释'],
    content: `请为以下代码/功能编写文档：

{{CONTENT}}

请生成完整的文档，包括：
1. **概述** - 功能描述、用途
2. **API/接口** - 参数、返回值、示例
3. **使用示例** - 代码示例、调用方式
4. **注意事项** - 边界情况、限制条件
5. **相关链接** - 参考资料、依赖

请确保文档清晰、准确、实用。`,
    variables: ['CONTENT'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
];

// 默认 LLM 配置
export const DEFAULT_LLM_CONFIGS: LLMConfig[] = [
  {
    id: 'openai-default',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4-turbo-preview',
    isDefault: true,
  },
  {
    id: 'anthropic-default',
    name: 'Anthropic (OpenAI 兼容)',
    baseURL: 'https://api.anthropic.com/v1',
    apiKey: '',
    model: 'claude-3-opus-20240229',
    isDefault: false,
  },
];

// 问题类型显示名称
export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  vague: '模糊不清',
  too_short: '过于简短',
  missing_context: '缺少上下文',
  no_structure: '缺少结构',
  no_examples: '缺少示例',
  no_constraints: '缺少约束条件',
  no_output_format: '缺少输出格式',
  negative: '负面表述',
  passive: '被动语态',
  inefficient_token: 'Token 使用低效',
  repeated: '重复内容',
  missing_role: '缺少角色设定',
  missing_steps: '缺少步骤分解',
  other: '其他',
};

// 严重程度颜色
export const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'text-blue-400 bg-blue-500/20',
  medium: 'text-amber-400 bg-amber-500/20',
  high: 'text-orange-400 bg-orange-500/20',
  critical: 'text-red-400 bg-red-500/20',
};

// 严重程度显示名称
export const SEVERITY_LABELS: Record<Severity, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};
