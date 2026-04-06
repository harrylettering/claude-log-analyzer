import type {
  PromptTemplate,
  TemplateLibraryExport,
  AnalysisReport,
} from '../types/prompt';
import { BUILT_IN_TEMPLATES } from '../types/prompt';

const STORAGE_KEY = 'prompt-templates';
const STORAGE_KEY_LLM_CONFIG = 'llm-configs';

export class TemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        data.forEach((template: PromptTemplate) => {
          this.templates.set(template.id, template);
        });
      }

      // 添加内置模板（如果不存在）
      BUILT_IN_TEMPLATES.forEach((template) => {
        if (!this.templates.has(template.id)) {
          this.templates.set(template.id, template);
        }
      });
    } catch (e) {
      console.error('Failed to load templates:', e);
      // 加载内置模板作为备用
      BUILT_IN_TEMPLATES.forEach((template) => {
        this.templates.set(template.id, template);
      });
    }
  }

  private save(): void {
    try {
      const customTemplates = Array.from(this.templates.values()).filter(
        (t) => !t.isBuiltIn
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));
    } catch (e) {
      console.error('Failed to save templates:', e);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getTemplatesByCategory(
    category: PromptTemplate['category']
  ): PromptTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  createTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>): PromptTemplate {
    const newTemplate: PromptTemplate = {
      ...template,
      id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      isBuiltIn: false,
    };
    this.templates.set(newTemplate.id, newTemplate);
    this.save();
    return newTemplate;
  }

  updateTemplate(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'isBuiltIn'>>): PromptTemplate | null {
    const template = this.templates.get(id);
    if (!template || template.isBuiltIn) {
      return null;
    }
    const updated: PromptTemplate = {
      ...template,
      ...updates,
      updatedAt: Date.now(),
    };
    this.templates.set(id, updated);
    this.save();
    return updated;
  }

  deleteTemplate(id: string): boolean {
    const template = this.templates.get(id);
    if (!template || template.isBuiltIn) {
      return false;
    }
    this.templates.delete(id);
    this.save();
    return true;
  }

  incrementUsage(id: string): void {
    const template = this.templates.get(id);
    if (template) {
      template.usageCount++;
      template.updatedAt = Date.now();
      this.save();
    }
  }

  duplicateTemplate(id: string): PromptTemplate | null {
    const template = this.templates.get(id);
    if (!template) {
      return null;
    }
    const duplicated: PromptTemplate = {
      ...template,
      id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${template.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      isBuiltIn: false,
    };
    this.templates.set(duplicated.id, duplicated);
    this.save();
    return duplicated;
  }

  // 从内容提取变量
  extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    return variables;
  }

  // 渲染模板
  renderTemplate(template: PromptTemplate, variables: Record<string, string>): string {
    let result = template.content;
    template.variables.forEach((varName) => {
      const value = variables[varName] || `{{${varName}}}`;
      result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), value);
    });
    return result;
  }

  // 导出模板库
  exportLibrary(): TemplateLibraryExport {
    return {
      version: '1.0',
      exportedAt: Date.now(),
      templates: this.getAllTemplates().filter((t) => !t.isBuiltIn),
    };
  }

  // 导入模板库
  importLibrary(data: TemplateLibraryExport): number {
    let imported = 0;
    data.templates.forEach((template) => {
      // 避免覆盖现有模板
      if (!this.templates.has(template.id)) {
        // 确保导入的模板不是内置的
        const importedTemplate = {
          ...template,
          isBuiltIn: false,
        };
        this.templates.set(template.id, importedTemplate);
        imported++;
      }
    });
    if (imported > 0) {
      this.save();
    }
    return imported;
  }

  // 导出分析报告
  exportReport(report: Omit<AnalysisReport, 'version' | 'generatedAt'>): AnalysisReport {
    return {
      version: '1.0',
      generatedAt: Date.now(),
      ...report,
    };
  }

  // 下载 JSON 文件
  downloadJSON(data: any, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 读取 JSON 文件
  async readJSONFile(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          resolve(JSON.parse(content));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}

// 单例实例
export const templateManager = new TemplateManager();

// LLM 配置管理
export class LLMConfigManager {
  private configs: Map<string, any> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LLM_CONFIG);
      if (stored) {
        const data = JSON.parse(stored);
        data.forEach((config: any) => {
          this.configs.set(config.id, config);
        });
      }
    } catch (e) {
      console.error('Failed to load LLM configs:', e);
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY_LLM_CONFIG,
        JSON.stringify(Array.from(this.configs.values()))
      );
    } catch (e) {
      console.error('Failed to save LLM configs:', e);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAllConfigs(): any[] {
    return Array.from(this.configs.values());
  }

  getDefaultConfig(): any | null {
    return this.getAllConfigs().find((c) => c.isDefault) || this.getAllConfigs()[0] || null;
  }

  getConfig(id: string): any | undefined {
    return this.configs.get(id);
  }

  addConfig(config: Omit<any, 'id'>): any {
    const newConfig: any = {
      ...config,
      id: `config-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    // 如果是第一个，设为默认
    if (this.configs.size === 0) {
      newConfig.isDefault = true;
    }
    this.configs.set(newConfig.id, newConfig);
    this.save();
    return newConfig;
  }

  updateConfig(id: string, updates: Partial<any>): any | null {
    const config = this.configs.get(id);
    if (!config) {
      return null;
    }
    // 如果设为默认，取消其他的默认
    if (updates.isDefault) {
      this.configs.forEach((c) => {
        c.isDefault = false;
      });
    }
    const updated = { ...config, ...updates };
    this.configs.set(id, updated);
    this.save();
    return updated;
  }

  deleteConfig(id: string): boolean {
    const deleted = this.configs.delete(id);
    if (deleted) {
      // 如果删除的是默认配置，设置另一个为默认
      const remaining = this.getAllConfigs();
      if (remaining.length > 0 && !remaining.some((c) => c.isDefault)) {
        remaining[0].isDefault = true;
        this.configs.set(remaining[0].id, remaining[0]);
      }
      this.save();
    }
    return deleted;
  }

  setDefault(id: string): boolean {
    const config = this.configs.get(id);
    if (!config) {
      return false;
    }
    this.configs.forEach((c) => {
      c.isDefault = c.id === id;
    });
    this.save();
    return true;
  }
}

export const llmConfigManager = new LLMConfigManager();
