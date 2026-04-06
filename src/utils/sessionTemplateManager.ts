import type {
  SessionTemplate,
  SessionStep,
  SessionInstance,
  SessionTemplateLibraryExport,
} from '../types/sessionTemplate';
import { BUILT_IN_SESSION_TEMPLATES } from '../types/sessionTemplate';

const STORAGE_KEY = 'session-templates';
const STORAGE_KEY_INSTANCES = 'session-instances';

export class SessionTemplateManager {
  private templates: Map<string, SessionTemplate> = new Map();
  private instances: Map<string, SessionInstance> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      // 加载模板
      const storedTemplates = localStorage.getItem(STORAGE_KEY);
      if (storedTemplates) {
        const data = JSON.parse(storedTemplates);
        data.forEach((template: SessionTemplate) => {
          this.templates.set(template.id, template);
        });
      }

      // 加载实例
      const storedInstances = localStorage.getItem(STORAGE_KEY_INSTANCES);
      if (storedInstances) {
        const data = JSON.parse(storedInstances);
        data.forEach((instance: SessionInstance) => {
          this.instances.set(instance.id, instance);
        });
      }

      // 添加内置模板（如果不存在）
      BUILT_IN_SESSION_TEMPLATES.forEach((template) => {
        if (!this.templates.has(template.id)) {
          this.templates.set(template.id, template);
        }
      });
    } catch (e) {
      console.error('Failed to load session templates:', e);
      // 加载内置模板作为备用
      BUILT_IN_SESSION_TEMPLATES.forEach((template) => {
        this.templates.set(template.id, template);
      });
    }
  }

  private save(): void {
    try {
      // 保存自定义模板
      const customTemplates = Array.from(this.templates.values()).filter(
        (t) => !t.isBuiltIn
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));

      // 保存实例
      const instances = Array.from(this.instances.values());
      localStorage.setItem(STORAGE_KEY_INSTANCES, JSON.stringify(instances));
    } catch (e) {
      console.error('Failed to save session templates:', e);
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

  // ========== 模板管理 ==========

  getAllTemplates(): SessionTemplate[] {
    return Array.from(this.templates.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getTemplatesByCategory(
    category: SessionTemplate['category']
  ): SessionTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  getTemplate(id: string): SessionTemplate | undefined {
    return this.templates.get(id);
  }

  createTemplate(template: Omit<SessionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>): SessionTemplate {
    const newTemplate: SessionTemplate = {
      ...template,
      id: `session-template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      isBuiltIn: false,
    };
    this.templates.set(newTemplate.id, newTemplate);
    this.save();
    return newTemplate;
  }

  updateTemplate(id: string, updates: Partial<Omit<SessionTemplate, 'id' | 'createdAt' | 'isBuiltIn'>>): SessionTemplate | null {
    const template = this.templates.get(id);
    if (!template || template.isBuiltIn) {
      return null;
    }
    const updated: SessionTemplate = {
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

  duplicateTemplate(id: string): SessionTemplate | null {
    const template = this.templates.get(id);
    if (!template) {
      return null;
    }
    const duplicated: SessionTemplate = {
      ...template,
      id: `session-template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

  incrementUsage(id: string): void {
    const template = this.templates.get(id);
    if (template) {
      template.usageCount++;
      template.updatedAt = Date.now();
      this.save();
    }
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

  // 渲染步骤内容
  renderStepContent(step: SessionStep, variables: Record<string, string>): string {
    let result = step.content;
    step.variables.forEach((varName) => {
      const value = variables[varName] || `{{${varName}}}`;
      result = result.replace(new RegExp(`\\{\\{${varName}\\}`, 'g'), value);
    });
    return result;
  }

  // 收集模板的所有变量
  collectTemplateVariables(template: SessionTemplate): string[] {
    const allVariables = new Set<string>();
    template.steps.forEach((step) => {
      step.variables.forEach((v) => allVariables.add(v));
    });
    template.variables.forEach((v) => allVariables.add(v));
    return Array.from(allVariables);
  }

  // ========== 实例管理 ==========

  getAllInstances(): SessionInstance[] {
    return Array.from(this.instances.values()).sort((a, b) =>
      (b.startTime || 0) - (a.startTime || 0)
    );
  }

  getInstance(id: string): SessionInstance | undefined {
    return this.instances.get(id);
  }

  getInstancesByTemplate(templateId: string): SessionInstance[] {
    return this.getAllInstances().filter((i) => i.templateId === templateId);
  }

  createInstance(templateId: string, variableValues: Record<string, string> = {}): SessionInstance {
    const template = this.templates.get(templateId);
    const instance: SessionInstance = {
      id: `session-instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      templateId,
      templateVersion: template?.version,
      variableValues,
      currentStepIndex: 0,
      completedStepIds: [],
      status: 'draft',
    };
    this.instances.set(instance.id, instance);
    this.save();
    return instance;
  }

  updateInstance(id: string, updates: Partial<SessionInstance>): SessionInstance | null {
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    const updated: SessionInstance = {
      ...instance,
      ...updates,
    };
    this.instances.set(id, updated);
    this.save();
    return updated;
  }

  startInstance(id: string): SessionInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;
    const updated: SessionInstance = {
      ...instance,
      status: 'in_progress',
      startTime: Date.now(),
    };
    this.instances.set(id, updated);
    this.save();
    return updated;
  }

  completeStep(instanceId: string, stepId: string): SessionInstance | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;

    const completedStepIds = instance.completedStepIds.includes(stepId)
      ? instance.completedStepIds
      : [...instance.completedStepIds, stepId];

    const updated: SessionInstance = {
      ...instance,
      completedStepIds,
    };

    this.instances.set(instanceId, updated);
    this.save();
    return updated;
  }

  goToStep(instanceId: string, stepIndex: number): SessionInstance | null {
    const instance = this.instances.get(instanceId);
    if (!instance) return null;

    const updated: SessionInstance = {
      ...instance,
      currentStepIndex: stepIndex,
    };

    this.instances.set(instanceId, updated);
    this.save();
    return updated;
  }

  completeInstance(id: string): SessionInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;

    const template = this.templates.get(instance.templateId);
    if (template) {
      this.incrementUsage(template.id);
    }

    const updated: SessionInstance = {
      ...instance,
      status: 'completed',
      completedAt: Date.now(),
    };
    this.instances.set(id, updated);
    this.save();
    return updated;
  }

  deleteInstance(id: string): boolean {
    const deleted = this.instances.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  // ========== 导入导出 ==========

  exportLibrary(): SessionTemplateLibraryExport {
    return {
      version: '1.0',
      exportedAt: Date.now(),
      templates: this.getAllTemplates().filter((t) => !t.isBuiltIn),
    };
  }

  importLibrary(data: SessionTemplateLibraryExport): number {
    let imported = 0;
    data.templates.forEach((template) => {
      // 避免覆盖现有模板
      if (!this.templates.has(template.id)) {
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
export const sessionTemplateManager = new SessionTemplateManager();
