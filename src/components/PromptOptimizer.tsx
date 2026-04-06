import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Brain, BookOpen, Download, AlertCircle, RefreshCw } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { analyzePrompts } from '../utils/promptAnalyzer';
import { templateManager } from '../utils/templateManager';
import { PromptAnalysis } from './PromptAnalysis';
import { PromptSuggestions } from './PromptSuggestions';
import { PromptAIAnalysis } from './PromptAIAnalysis';
import { TemplateLibrary } from './TemplateLibrary';

interface PromptOptimizerProps {
  data: ParsedLogData;
}

type TabId = 'analysis' | 'suggestions' | 'templates' | 'export';

export function PromptOptimizer({ data }: PromptOptimizerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('analysis');
  const [analysis, setAnalysis] = useState(analyzePrompts(data));
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

  useEffect(() => {
    setAnalysis(analyzePrompts(data));
  }, [data]);

  const handleReanalyze = useCallback(() => {
    setAnalysis(analyzePrompts(data));
  }, [data]);

  const handleExportReport = useCallback(() => {
    const report = templateManager.exportReport({
      sessionInfo: {
        startTime: data.entries[0]?.timestamp as any,
        endTime: data.entries[data.entries.length - 1]?.timestamp as any,
        totalEntries: data.entries.length,
      },
      analysis,
      templates: templateManager.getAllTemplates().filter((t) => !t.isBuiltIn),
    });
    templateManager.downloadJSON(report, `prompt-analysis-${Date.now()}.json`);
  }, [data, analysis]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'analysis', label: '分析结果', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'suggestions', label: '优化建议', icon: <Brain className="w-4 h-4" /> },
    { id: 'templates', label: '模板库', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'export', label: '导出', icon: <Download className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
              <Sparkles className="w-6 h-6" />
              提示词优化建议器
            </h2>
            <p className="text-slate-400">
              分析提示词使用模式，获取优化建议
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReanalyze}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重新分析
            </button>
            <button
              onClick={() => setShowDeepAnalysis(true)}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
            >
              <Brain className="w-4 h-4" />
              AI 深度分析
            </button>
          </div>
        </div>
      </div>

      {/* 标签页 */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 内容 */}
      <div>
        {activeTab === 'analysis' && (
          <PromptAnalysis analysis={analysis} />
        )}

        {activeTab === 'suggestions' && (
          <PromptSuggestions suggestions={analysis.suggestions} />
        )}

        {activeTab === 'templates' && (
          <TemplateLibrary />
        )}

        {activeTab === 'export' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 导出分析报告 */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Download className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">导出分析报告</h3>
                    <p className="text-slate-400 text-sm">导出本次分析的完整报告</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-sm text-slate-400">
                    包含内容：
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>提示词统计数据</li>
                      <li>发现的问题列表</li>
                      <li>优化建议</li>
                      <li>自定义模板（如有）</li>
                    </ul>
                  </div>
                  <button
                    onClick={handleExportReport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    导出报告
                  </button>
                </div>
              </div>

              {/* 模板库 */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <BookOpen className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">模板库管理</h3>
                    <p className="text-slate-400 text-sm">导入/导出提示词模板</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 mb-3">
                  在"模板库"标签页中可以：
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>创建新的提示词模板</li>
                    <li>导入他人分享的模板</li>
                    <li>导出你的模板库</li>
                  </ul>
                </div>
                <button
                  onClick={() => setActiveTab('templates')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  前往模板库
                </button>
              </div>
            </div>

            {/* 使用说明 */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-2">使用提示</h3>
                  <div className="text-sm text-slate-400 space-y-2">
                    <p>
                      <strong>规则分析：</strong>当前页面显示的是基于规则的快速分析结果，可以即时发现常见问题。
                    </p>
                    <p>
                      <strong>AI 深度分析：</strong>点击右上角的"AI 深度分析"按钮，可以使用 LLM 进行更深入的分析，
                      提供更个性化的建议。需要先在 API 配置中添加你的 API Key。
                    </p>
                    <p>
                      <strong>模板库：</strong>将优化后的提示词保存为模板，方便以后复用，也可以与团队分享。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 深度分析弹窗 */}
      <PromptAIAnalysis
        isOpen={showDeepAnalysis}
        onClose={() => setShowDeepAnalysis(false)}
        data={data}
        baseAnalysis={analysis}
      />
    </div>
  );
}
