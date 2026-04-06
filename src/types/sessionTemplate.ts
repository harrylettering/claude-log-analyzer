// 会话步骤类型
export interface SessionStep {
  id: string;
  type: 'user_prompt' | 'system_prompt' | 'tool_call' | 'assistant_response';
  title: string;
  description?: string;
  content: string;
  variables: string[];
  order: number;
  isOptional?: boolean;
}

// 会话模板分类
export type SessionTemplateCategory =
  | 'code_development'
  | 'data_analysis'
  | 'content_creation'
  | 'research'
  | 'planning'
  | 'debugging'
  | 'code_review'
  | 'documentation'
  | 'testing'
  | 'other';

// 会话模板
export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  category: SessionTemplateCategory;
  tags: string[];
  steps: SessionStep[];
  variables: string[];
  estimatedDurationMinutes?: number;
  useCases: string[];
  bestPractices: string[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  isBuiltIn: boolean;
  author?: string;
  version?: string;
}

// 会话实例（从模板创建的具体会话）
export interface SessionInstance {
  id: string;
  templateId: string;
  templateVersion?: string;
  variableValues: Record<string, string>;
  currentStepIndex: number;
  completedStepIds: string[];
  startTime?: number;
  completedAt?: number;
  status: 'draft' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  notes?: string;
}

// 模板库导出格式
export interface SessionTemplateLibraryExport {
  version: string;
  exportedAt: number;
  templates: SessionTemplate[];
}

// 分类显示信息
export const CATEGORY_INFO: Record<SessionTemplateCategory, { label: string; icon: string; color: string }> = {
  code_development: { label: '代码开发', icon: '💻', color: 'from-blue-500 to-cyan-500' },
  data_analysis: { label: '数据分析', icon: '📊', color: 'from-green-500 to-emerald-500' },
  content_creation: { label: '内容创作', icon: '✍️', color: 'from-purple-500 to-pink-500' },
  research: { label: '研究调研', icon: '🔍', color: 'from-amber-500 to-orange-500' },
  planning: { label: '规划设计', icon: '📋', color: 'from-indigo-500 to-blue-500' },
  debugging: { label: '调试排错', icon: '🐛', color: 'from-red-500 to-rose-500' },
  code_review: { label: '代码审查', icon: '👀', color: 'from-teal-500 to-cyan-500' },
  documentation: { label: '文档编写', icon: '📝', color: 'from-pink-500 to-rose-500' },
  testing: { label: '测试验证', icon: '✅', color: 'from-green-500 to-teal-500' },
  other: { label: '其他', icon: '📦', color: 'from-slate-500 to-gray-500' },
};

// 分类列表
export const CATEGORIES: Array<{ value: SessionTemplateCategory; label: string }> = [
  { value: 'code_development', label: '代码开发' },
  { value: 'data_analysis', label: '数据分析' },
  { value: 'content_creation', label: '内容创作' },
  { value: 'research', label: '研究调研' },
  { value: 'planning', label: '规划设计' },
  { value: 'debugging', label: '调试排错' },
  { value: 'code_review', label: '代码审查' },
  { value: 'documentation', label: '文档编写' },
  { value: 'testing', label: '测试验证' },
  { value: 'other', label: '其他' },
];

// 步骤类型显示信息
export const STEP_TYPE_INFO: Record<SessionStep['type'], { label: string; icon: string; color: string }> = {
  user_prompt: { label: '用户提示', icon: '👤', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  system_prompt: { label: '系统提示', icon: '⚙️', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  tool_call: { label: '工具调用', icon: '🔧', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  assistant_response: { label: '助手回复', icon: '🤖', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

// 内置会话模板
export const BUILT_IN_SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: 'built-in-full-code-dev',
    name: '完整代码开发流程',
    description: '从需求分析到最终交付的完整开发流程',
    category: 'code_development',
    tags: ['完整流程', '代码开发', '最佳实践'],
    variables: ['PROJECT_NAME', 'REQUIREMENTS', 'TECH_STACK', 'DELIVERABLES'],
    estimatedDurationMinutes: 60,
    useCases: [
      '新功能开发',
      '项目重构',
      '技术方案实现'
    ],
    bestPractices: [
      '先理解需求再开始编码',
      '分步骤验证每个阶段的成果',
      '及时记录关键决策'
    ],
    steps: [
      {
        id: 'step-1',
        type: 'user_prompt',
        title: '需求分析',
        description: '明确项目需求和目标',
        content: `我需要开发一个名为"{{PROJECT_NAME}}"的项目。

需求描述：
{{REQUIREMENTS}}

请帮我：
1. 分析和澄清需求中的关键点
2. 识别潜在的技术挑战
3. 提出需要进一步明确的问题
4. 建议项目的整体范围`,
        variables: ['PROJECT_NAME', 'REQUIREMENTS'],
        order: 1,
      },
      {
        id: 'step-2',
        type: 'user_prompt',
        title: '技术方案设计',
        description: '设计技术架构和实现方案',
        content: `技术栈：{{TECH_STACK}}

请基于确认的需求，提供：
1. 整体架构设计
2. 关键模块划分
3. 数据结构设计
4. 核心算法/流程说明
5. 技术选型理由`,
        variables: ['TECH_STACK'],
        order: 2,
      },
      {
        id: 'step-3',
        type: 'user_prompt',
        title: '代码实现',
        description: '开始编写代码实现',
        content: `请按照技术方案开始实现代码：

交付物要求：{{DELIVERABLES}}

请提供：
1. 完整的可运行代码
2. 必要的注释说明
3. 代码结构说明
4. 关键实现细节解释`,
        variables: ['DELIVERABLES'],
        order: 3,
      },
      {
        id: 'step-4',
        type: 'user_prompt',
        title: '代码审查与优化',
        description: '审查代码质量并进行优化',
        content: `请对刚才生成的代码进行：
1. 代码质量审查
2. 安全性检查
3. 性能优化建议
4. 代码风格统一
5. 最佳实践改进`,
        variables: [],
        order: 4,
      },
      {
        id: 'step-5',
        type: 'user_prompt',
        title: '测试验证',
        description: '编写测试用例并验证功能',
        content: `请为代码编写：
1. 单元测试
2. 集成测试（如需要）
3. 测试用例说明
4. 边界情况验证
5. 使用示例`,
        variables: [],
        order: 5,
      },
      {
        id: 'step-6',
        type: 'user_prompt',
        title: '文档总结',
        description: '编写文档和项目总结',
        content: `请为这个项目编写：
1. README 文档
2. 快速开始指南
3. API 文档（如适用）
4. 项目总结和经验记录
5. 后续优化建议`,
        variables: [],
        order: 6,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'built-in-data-analysis',
    name: '数据分析流程',
    description: '结构化数据分析和洞察生成流程',
    category: 'data_analysis',
    tags: ['数据分析', '洞察', '可视化'],
    variables: ['DATA_DESCRIPTION', 'ANALYSIS_GOAL', 'DATA_SOURCE'],
    estimatedDurationMinutes: 30,
    useCases: [
      '数据集探索',
      '业务数据分析',
      '实验结果分析'
    ],
    bestPractices: [
      '先了解数据全貌再深入细节',
      '用可视化帮助理解数据',
      '验证假设而非只找支持证据'
    ],
    steps: [
      {
        id: 'da-step-1',
        type: 'user_prompt',
        title: '数据概览',
        description: '了解数据基本情况',
        content: `我需要分析以下数据：

数据描述：{{DATA_DESCRIPTION}}
数据来源：{{DATA_SOURCE}}
分析目标：{{ANALYSIS_GOAL}}

请先提供：
1. 数据类型和结构分析
2. 数据质量评估
3. 关键统计指标
4. 初步观察发现`,
        variables: ['DATA_DESCRIPTION', 'DATA_SOURCE', 'ANALYSIS_GOAL'],
        order: 1,
      },
      {
        id: 'da-step-2',
        type: 'user_prompt',
        title: '深度分析',
        description: '进行深入的数据分析',
        content: `请进行深度分析：
1. 趋势分析和模式识别
2. 异常值和异常检测
3. 相关性分析
4. 关键发现和洞察
5. 与目标的关联分析`,
        variables: [],
        order: 2,
      },
      {
        id: 'da-step-3',
        type: 'user_prompt',
        title: '可视化建议',
        description: '建议数据可视化方案',
        content: `请建议合适的数据可视化方案：
1. 关键指标的可视化方式
2. 趋势和模式的展示
3. 对比分析的可视化
4. 可视化工具/库建议
5. 可交互分析建议`,
        variables: [],
        order: 3,
      },
      {
        id: 'da-step-4',
        type: 'user_prompt',
        title: '结论与建议',
        description: '总结分析结果并提供建议',
        content: `请提供分析总结：
1. 关键结论（3-5条）
2. 可执行的建议
3. 风险和注意事项
4. 后续分析方向
5. 决策支持信息`,
        variables: [],
        order: 4,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'built-in-bug-debug',
    name: '调试排错流程',
    description: '系统性的问题诊断和修复流程',
    category: 'debugging',
    tags: ['调试', '问题诊断', '故障修复'],
    variables: ['PROBLEM_DESC', 'ENV_INFO', 'ERROR_LOG'],
    estimatedDurationMinutes: 45,
    useCases: [
      'Bug 修复',
      '问题诊断',
      '性能问题排查'
    ],
    bestPractices: [
      '先复现问题再定位原因',
      '系统地排除可能性',
      '记录排查过程便于后续参考'
    ],
    steps: [
      {
        id: 'db-step-1',
        type: 'user_prompt',
        title: '问题描述',
        description: '明确和澄清问题',
        content: `我遇到了一个问题：

问题描述：{{PROBLEM_DESC}}
环境信息：{{ENV_INFO}}
错误日志：{{ERROR_LOG}}

请帮我：
1. 理解和澄清问题
2. 识别关键症状
3. 收集必要的诊断信息清单
4. 初步判断问题类型`,
        variables: ['PROBLEM_DESC', 'ENV_INFO', 'ERROR_LOG'],
        order: 1,
      },
      {
        id: 'db-step-2',
        type: 'user_prompt',
        title: '复现验证',
        description: '确认问题复现步骤',
        content: `请帮我制定复现和验证方案：
1. 最小化复现步骤
2. 需要验证的假设列表
3. 诊断命令/测试建议
4. 需要收集的关键信息
5. 验证标准`,
        variables: [],
        order: 2,
      },
      {
        id: 'db-step-3',
        type: 'user_prompt',
        title: '根因分析',
        description: '深入分析找到根本原因',
        content: `基于已收集的信息，请进行根因分析：
1. 可能的原因列表（按可能性排序）
2. 每个原因的验证方法
3. 排除法分析过程
4. 最可能的根本原因
5. 影响范围评估`,
        variables: [],
        order: 3,
      },
      {
        id: 'db-step-4',
        type: 'user_prompt',
        title: '修复方案',
        description: '设计和实施修复方案',
        content: `请提供修复方案：
1. 修复方案（多个可选）
2. 方案对比和推荐
3. 修复代码/步骤
4. 回归测试建议
5. 防止复发的措施`,
        variables: [],
        order: 4,
      },
      {
        id: 'db-step-5',
        type: 'user_prompt',
        title: '总结记录',
        description: '总结问题和经验',
        content: `请总结这次调试：
1. 问题根因总结
2. 修复方案说明
3. 经验教训记录
4. 预防措施建议
5. 相关文档更新建议`,
        variables: [],
        order: 5,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    isBuiltIn: true,
  },
];
