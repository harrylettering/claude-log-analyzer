import type { LLMConfig, PromptAnalysis } from '../types/prompt';
import type { LogEntry } from '../types/log';

// 分析提示词的系统提示
const ANALYSIS_SYSTEM_PROMPT = `你是一位专业的提示词工程专家。请分析给定的对话历史，识别提示词中的问题并提供具体的优化建议。

请按以下 JSON 格式返回分析结果：
{
  "issues": [
    {
      "type": "问题类型",
      "severity": "low|medium|high|critical",
      "title": "简短标题",
      "description": "详细描述",
      "suggestion": "具体改进建议"
    }
  ],
  "suggestions": [
    {
      "original": "原始提示词片段",
      "improved": "优化后的提示词",
      "explanation": "为什么这样优化",
      "impact": "small|medium|large",
      "category": "分类"
    }
  ],
  "bestPractices": [
    "最佳实践建议 1",
    "最佳实践建议 2"
  ],
  "overallAssessment": "总体评价"
}

请只返回 JSON，不要包含其他文本。`;

// 生成分析提示词
function buildAnalysisPrompt(entries: LogEntry[]): string {
  const conversation = entries
    .slice(0, 20) // 限制数量避免过长
    .map((entry) => {
      let content = '';
      if (entry.message?.content) {
        if (typeof entry.message.content === 'string') {
          content = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
          const textContent = entry.message.content.find((c: any) => c.type === 'text');
          content = (textContent as any)?.text || '';
        }
      }
      return `${entry.type.toUpperCase()}:\n${content.slice(0, 1000)}`;
    })
    .join('\n\n');

  return `请分析以下对话历史中的用户提示词，识别问题并提供优化建议：

\`\`\`
${conversation}
\`\`\`

请特别关注：
1. 用户提示词是否清晰、具体
2. 是否缺少必要的上下文或结构
3. 是否有可以优化的地方
4. 提供具体的改进建议`;
}

// OpenAI 兼容 API 客户端
export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  private async request(messages: Array<{ role: string; content: string }>): Promise<string> {
    const url = `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 深度分析提示词
  async analyzePromptsDeep(entries: LogEntry[], _baseAnalysis: PromptAnalysis): Promise<{
    issues: Array<{ type: string; severity: string; title: string; description: string; suggestion: string }>;
    suggestions: Array<{ original: string; improved: string; explanation: string; impact: string; category: string }>;
    bestPractices: string[];
    overallAssessment: string;
  }> {
    const messages = [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisPrompt(entries) },
    ];

    const response = await this.request(messages);

    // 尝试解析 JSON
    try {
      // 清理响应，确保是有效的 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse LLM response:', e);
      console.error('Response:', response);
      throw new Error('无法解析 AI 响应');
    }
  }

  // 优化单个提示词
  async optimizePrompt(prompt: string): Promise<{
    original: string;
    improved: string;
    explanation: string;
  }> {
    const messages = [
      {
        role: 'system',
        content: `你是一位提示词优化专家。请优化用户提供的提示词，使其更清晰、更有效。

请按以下 JSON 格式返回：
{
  "original": "原始提示词",
  "improved": "优化后的提示词",
  "explanation": "优化说明"
}

只返回 JSON，不要其他文本。`,
      },
      {
        role: 'user',
        content: `请优化以下提示词：\n\n${prompt}`,
      },
    ];

    const response = await this.request(messages);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const result = JSON.parse(jsonMatch[0]);
      return {
        original: result.original || prompt,
        improved: result.improved,
        explanation: result.explanation,
      };
    } catch (e) {
      console.error('Failed to parse LLM response:', e);
      throw new Error('无法解析 AI 响应');
    }
  }

  // 测试连接
  async testConnection(): Promise<boolean> {
    const messages = [
      { role: 'user', content: '请回复 "OK"' },
    ];
    const response = await this.request(messages);
    return response.includes('OK');
  }
}

// 创建客户端实例
export function createLLMClient(config: LLMConfig): LLMClient {
  return new LLMClient(config);
}

// 验证配置
export function validateConfig(config: LLMConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name.trim()) {
    errors.push('请输入配置名称');
  }
  if (!config.baseURL.trim()) {
    errors.push('请输入 API 地址');
  } else {
    try {
      new URL(config.baseURL);
    } catch {
      errors.push('API 地址格式不正确');
    }
  }
  if (!config.apiKey.trim()) {
    errors.push('请输入 API Key');
  }
  if (!config.model.trim()) {
    errors.push('请输入模型名称');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
