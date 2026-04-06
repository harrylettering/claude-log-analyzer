
// 模式类型
export type PatternType =
  | 'coding_workflow'      // 编码工作流
  | 'debugging_flow'       // 调试流程
  | 'analysis_pattern'     // 分析模式
  | 'writing_pattern'      // 写作模式
  | 'planning_pattern'     // 规划模式
  | 'research_pattern'     // 研究模式
  | 'review_pattern'       // 审查模式
  | 'testing_pattern'      // 测试模式
  | 'multi_step_task'      // 多步骤任务
  | 'custom';              // 自定义

// 成功度评级
export type SuccessRating = 'excellent' | 'good' | 'moderate' | 'needs_improvement';

// 工具使用模式
export interface ToolUsagePattern {
  toolName: string;
  frequency: number;
  averageDurationMs?: number;
  successRate: number;
  typicalInputs: string[];
}

// 提示词模式
export interface PromptPattern {
  id: string;
  content: string;
  variables: string[];
  context: string;
  effectivenessScore: number;  // 0-100
  usageCount: number;
}

// 会话模式
export interface SessionPattern {
  id: string;
  name: string;
  description: string;
  type: PatternType;
  tags: string[];

  // 源会话信息
  sourceSessionId?: string;
  sourceSessionName?: string;

  // 模式特征
  totalSteps: number;
  durationMs: number;
  tokenEfficiency: number;  // 0-100，越高越高效
  successRating: SuccessRating;

  // 工具使用
  toolPatterns: ToolUsagePattern[];

  // 关键提示词
  keyPrompts: PromptPattern[];

  // 工作流描述
  workflow: {
    stepDescription: string;
    stepType: 'user_input' | 'tool_call' | 'assistant_response';
    order: number;
  }[];

  // 最佳实践和建议
  bestPractices: string[];
  pitfalls: string[];

  // 元数据
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  isFavorite: boolean;
  isManual: boolean;  // 是否是手动创建的
  authorNotes?: string;
}

// 模式提取配置
export interface PatternExtractionConfig {
  minTokenEfficiency?: number;  // 最低 token 效率要求
  minDurationMs?: number;       // 最短会话时长
  minSteps?: number;             // 最少步骤数
  includeManualPatterns?: boolean;
}

// 模式库导出格式
export interface PatternLibraryExport {
  version: string;
  exportedAt: number;
  patterns: SessionPattern[];
}

// 模式类型信息
export const PATTERN_TYPE_INFO: Record<PatternType, { label: string; icon: string; color: string }> = {
  coding_workflow: { label: '编码工作流', icon: '💻', color: 'from-blue-500 to-cyan-500' },
  debugging_flow: { label: '调试流程', icon: '🐛', color: 'from-red-500 to-rose-500' },
  analysis_pattern: { label: '分析模式', icon: '📊', color: 'from-green-500 to-emerald-500' },
  writing_pattern: { label: '写作模式', icon: '✍️', color: 'from-purple-500 to-pink-500' },
  planning_pattern: { label: '规划模式', icon: '📋', color: 'from-indigo-500 to-blue-500' },
  research_pattern: { label: '研究模式', icon: '🔍', color: 'from-amber-500 to-orange-500' },
  review_pattern: { label: '审查模式', icon: '👀', color: 'from-teal-500 to-cyan-500' },
  testing_pattern: { label: '测试模式', icon: '✅', color: 'from-green-500 to-teal-500' },
  multi_step_task: { label: '多步骤任务', icon: '🔄', color: 'from-violet-500 to-purple-500' },
  custom: { label: '自定义', icon: '📦', color: 'from-slate-500 to-gray-500' },
};

// 成功评级信息
export const SUCCESS_RATING_INFO: Record<SuccessRating, { label: string; color: string; score: number }> = {
  excellent: { label: '优秀', color: 'text-green-400 bg-green-500/20', score: 90 },
  good: { label: '良好', color: 'text-blue-400 bg-blue-500/20', score: 75 },
  moderate: { label: '一般', color: 'text-amber-400 bg-amber-500/20', score: 50 },
  needs_improvement: { label: '需改进', color: 'text-red-400 bg-red-500/20', score: 30 },
};

// 模式类型列表
export const PATTERN_TYPES: Array<{ value: PatternType; label: string }> = [
  { value: 'coding_workflow', label: '编码工作流' },
  { value: 'debugging_flow', label: '调试流程' },
  { value: 'analysis_pattern', label: '分析模式' },
  { value: 'writing_pattern', label: '写作模式' },
  { value: 'planning_pattern', label: '规划模式' },
  { value: 'research_pattern', label: '研究模式' },
  { value: 'review_pattern', label: '审查模式' },
  { value: 'testing_pattern', label: '测试模式' },
  { value: 'multi_step_task', label: '多步骤任务' },
  { value: 'custom', label: '自定义' },
];
