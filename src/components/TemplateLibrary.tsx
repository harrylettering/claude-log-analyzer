import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  Check,
  Star,
  Search,
  FileText,
  Download,
  Upload,
  X,
  Bookmark,
} from 'lucide-react';
import type { PromptTemplate } from '../types/prompt';
import { templateManager } from '../utils/templateManager';

interface TemplateLibraryProps {
  onSelectTemplate?: (template: PromptTemplate) => void;
}

const CATEGORIES: { value: PromptTemplate['category']; label: string }[] = [
  { value: 'general', label: '通用' },
  { value: 'coding', label: '编程' },
  { value: 'analysis', label: '分析' },
  { value: 'writing', label: '写作' },
  { value: 'planning', label: '规划' },
  { value: 'other', label: '其他' },
];

export function TemplateLibrary({ onSelectTemplate }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PromptTemplate['category'] | 'all'>('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    const unsubscribe = templateManager.subscribe(loadTemplates);
    return unsubscribe;
  }, []);

  const loadTemplates = useCallback(() => {
    setTemplates(templateManager.getAllTemplates());
  }, []);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        searchQuery === '' ||
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === 'all' || template.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, selectedCategory]);

  const handleCreate = useCallback(() => {
    setEditingTemplate(null);
    setShowEditor(true);
  }, []);

  const handleEdit = useCallback((template: PromptTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定要删除这个模板吗？')) {
      templateManager.deleteTemplate(id);
    }
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    templateManager.duplicateTemplate(id);
  }, []);

  const handleCopy = useCallback(async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const handleExport = useCallback(() => {
    const data = templateManager.exportLibrary();
    templateManager.downloadJSON(data, `prompt-templates-${Date.now()}.json`);
  }, []);

  const handleImport = useCallback(async (file: File) => {
    try {
      const data = await templateManager.readJSONFile(file);
      const imported = templateManager.importLibrary(data);
      alert(`成功导入 ${imported} 个模板！`);
      setShowImport(false);
    } catch (err) {
      alert('导入失败：文件格式不正确');
      console.error('Import failed:', err);
    }
  }, []);

  const handleUse = useCallback((template: PromptTemplate) => {
    templateManager.incrementUsage(template.id);
    onSelectTemplate?.(template);
  }, [onSelectTemplate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">提示词模板库</h3>
          <p className="text-slate-400 text-sm">保存和复用优质提示词</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            导入
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            全部
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium truncate">{template.name}</h4>
                  {template.isBuiltIn && (
                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                      内置
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm line-clamp-2">{template.description}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {!template.isBuiltIn && (
                  <>
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1 hover:bg-red-600/20 rounded text-slate-400 hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDuplicate(template.id)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  title="复制"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-3">
              {template.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300"
                >
                  {tag}
                </span>
              ))}
              {template.tags.length > 3 && (
                <span className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-400">
                  +{template.tags.length - 3}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {template.variables.length} 变量
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {template.usageCount} 次
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleCopy(template.content, template.id)}
                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  title="复制内容"
                >
                  {copiedId === template.id ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                {onSelectTemplate && (
                  <button
                    onClick={() => handleUse(template)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white transition-colors"
                  >
                    使用
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredTemplates.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Bookmark className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">没有找到模板</p>
            <p className="text-slate-500 text-sm mt-1">尝试调整搜索条件或创建新模板</p>
          </div>
        )}
      </div>

      {/* 编辑器弹窗 */}
      {showEditor && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => setShowEditor(false)}
          onSave={(templateData) => {
            if (editingTemplate) {
              templateManager.updateTemplate(editingTemplate.id, templateData);
            } else {
              templateManager.createTemplate(templateData);
            }
            setShowEditor(false);
          }}
        />
      )}

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowImport(false)}
          />
          <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold">导入模板库</h3>
              <button
                onClick={() => setShowImport(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center">
                <Upload className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-300 mb-4">选择要导入的 JSON 文件</p>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport(file);
                  }}
                  className="hidden"
                  id="template-import"
                />
                <label
                  htmlFor="template-import"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  选择文件
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 模板编辑器
function TemplateEditor({
  template,
  onClose,
  onSave,
}: {
  template: PromptTemplate | null;
  onClose: () => void;
  onSave: (data: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>) => void;
}) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || 'general',
    tags: template?.tags.join(', ') || '',
    content: template?.content || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
      variables: templateManager.extractVariables(formData.content),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h3 className="text-lg font-semibold">{template ? '编辑模板' : '新建模板'}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">名称</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                placeholder="模板名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">描述</label>
              <input
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                placeholder="简短描述"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">分类</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">标签（逗号分隔）</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="标签1, 标签2, 标签3"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                提示词内容 <span className="text-slate-500">（使用 {'{{变量名}}'} 定义变量）</span>
              </label>
              <textarea
                required
                rows={10}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
                placeholder="请在此输入提示词内容，使用 {{变量名}} 来定义可替换的变量..."
              />
            </div>
            {templateManager.extractVariables(formData.content).length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-300 mb-2">检测到的变量：</p>
                <div className="flex flex-wrap gap-2">
                  {templateManager.extractVariables(formData.content).map((v) => {
                    const varStr = `{{${v}}}`;
                    return (
                      <span key={v} className="px-2 py-1 bg-slate-700 rounded text-sm font-mono">
                        {varStr}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 p-6 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
