import { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, Loader2, AlertCircle, CheckCircle, Brain, Server, Settings } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import type { PromptAnalysis } from '../types/prompt';
import { llmConfigManager } from '../utils/templateManager';
import { createLLMClient } from '../utils/llmClient';
import { APISettings } from './APISettings';

interface PromptAIAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
  data: ParsedLogData;
  baseAnalysis: PromptAnalysis;
  onAnalysisComplete?: (deepAnalysis: any) => void;
}

export function PromptAIAnalysis({
  isOpen,
  onClose,
  data,
  baseAnalysis,
  onAnalysisComplete,
}: PromptAIAnalysisProps) {
  const [step, setStep] = useState<'config' | 'analyzing' | 'result' | 'error'>('config');
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [showAPISettings, setShowAPISettings] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfigs();
      setStep('config');
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const loadConfigs = useCallback(() => {
    const cfgs = llmConfigManager.getAllConfigs();
    setConfigs(cfgs);
    const defaultCfg = llmConfigManager.getDefaultConfig();
    if (defaultCfg) {
      setSelectedConfigId(defaultCfg.id);
    }
  }, []);

  const handleStartAnalysis = useCallback(async () => {
    if (!selectedConfigId) {
      setError('请选择一个 API 配置');
      return;
    }

    const config = configs.find((c) => c.id === selectedConfigId);
    if (!config) {
      setError('配置不存在');
      return;
    }

    setStep('analyzing');
    setError(null);

    try {
      const client = createLLMClient(config);
      const deepAnalysis = await client.analyzePromptsDeep(data.entries, baseAnalysis);
      setResult(deepAnalysis);
      setStep('result');
      onAnalysisComplete?.(deepAnalysis);
    } catch (err) {
      console.error('Deep analysis failed:', err);
      setError(err instanceof Error ? err.message : '分析失败');
      setStep('error');
    }
  }, [selectedConfigId, configs, data, baseAnalysis, onAnalysisComplete]);

  const handleRetry = useCallback(() => {
    setStep('config');
    setError(null);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">AI 深度分析</h2>
                <p className="text-sm text-slate-400">使用 LLM 进行更深入的提示词分析</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
            {/* 配置步骤 */}
            {step === 'config' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3">选择 API 配置</h3>
                  {configs.length === 0 ? (
                    <div className="text-center py-8 bg-slate-700/30 rounded-lg">
                      <Server className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-400 mb-4">还没有配置 API</p>
                      <button
                        onClick={() => setShowAPISettings(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors mx-auto"
                      >
                        <Settings className="w-4 h-4" />
                        配置 API
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {configs.map((config) => (
                        <button
                          key={config.id}
                          onClick={() => setSelectedConfigId(config.id)}
                          className={`w-full text-left p-4 rounded-lg border transition-colors ${
                            selectedConfigId === config.id
                              ? 'border-purple-500 bg-purple-500/10'
                              : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{config.name}</span>
                                {config.isDefault && (
                                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                    默认
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-slate-400 mt-1">
                                <span className="font-mono">{config.model}</span>
                                {' · '}
                                <span className="font-mono text-xs">{config.baseURL}</span>
                              </div>
                            </div>
                            {selectedConfigId === config.id && (
                              <CheckCircle className="w-5 h-5 text-purple-400" />
                            )}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => setShowAPISettings(true)}
                        className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-600 hover:border-slate-500 rounded-lg text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        管理 API 配置
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-slate-700/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">分析内容</h4>
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                      识别更深层的提示词问题模式
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                      提供具体的优化前后对比
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                      基于对话上下文的个性化建议
                    </li>
                  </ul>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-red-400 text-sm">{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleStartAnalysis}
                    disabled={!selectedConfigId || configs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    开始分析
                  </button>
                </div>
              </div>
            )}

            {/* 分析中 */}
            {step === 'analyzing' && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">正在分析...</h3>
                <p className="text-slate-400">AI 正在深入分析您的提示词使用情况</p>
                <p className="text-slate-500 text-sm mt-2">这可能需要 10-30 秒</p>
              </div>
            )}

            {/* 结果 */}
            {step === 'result' && result && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <h3 className="font-medium text-green-400">分析完成！</h3>
                  </div>
                </div>

                {result.overallAssessment && (
                  <div className="bg-slate-700/30 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">总体评价</h4>
                    <p className="text-slate-300">{result.overallAssessment}</p>
                  </div>
                )}

                {result.issues && result.issues.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-3">发现的问题</h4>
                    <div className="space-y-2">
                      {result.issues.map((issue: any, index: number) => (
                        <div key={index} className="bg-slate-700/30 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium">{issue.title}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              issue.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                              issue.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                              issue.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {issue.severity}
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm mb-2">{issue.description}</p>
                          <p className="text-purple-300 text-sm">{issue.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.bestPractices && result.bestPractices.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 mb-3">最佳实践</h4>
                    <ul className="space-y-2">
                      {result.bestPractices.map((practice: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-slate-300">
                          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                          <span>{practice}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
                >
                  完成
                </button>
              </div>
            )}

            {/* 错误 */}
            {step === 'error' && (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-400 mb-2">分析失败</h3>
                <p className="text-slate-400 mb-6">{error}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    重试
                  </button>
                  <button
                    onClick={() => setShowAPISettings(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                  >
                    检查配置
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <APISettings
        isOpen={showAPISettings}
        onClose={() => {
          setShowAPISettings(false);
          loadConfigs();
        }}
      />
    </>
  );
}
