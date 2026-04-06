import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trash2,
  Copy,
  Check,
  Star,
  Search,
  Download,
  Upload,
  X,
  Bookmark,
  Sparkles,
  Layers,
  Zap,
  Clock,
  Cpu,
  ChevronDown,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import type {
  SessionPattern,
  PatternType,
} from '../types/sessionPattern';
import {
  PATTERN_TYPES,
  PATTERN_TYPE_INFO,
  SUCCESS_RATING_INFO,
} from '../types/sessionPattern';
import { patternLibrary } from '../utils/patternLibrary';
import { extractPatternFromSession } from '../utils/patternExtractor';

interface SessionPatternLibraryProps {
  currentSessionData?: ParsedLogData;
  currentSessionName?: string;
  onUsePattern?: (pattern: SessionPattern) => void;
}

export function SessionPatternLibrary({
  currentSessionData,
  currentSessionName,
  onUsePattern,
}: SessionPatternLibraryProps) {
  const [patterns, setPatterns] = useState<SessionPattern[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<PatternType | 'all'>('all');
  const [selectedRating, setSelectedRating] = useState<string>('all');
  const [showExtractor, setShowExtractor] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadPatterns();
    const unsubscribe = patternLibrary.subscribe(loadPatterns);
    return unsubscribe;
  }, []);

  const loadPatterns = useCallback(() => {
    setPatterns(patternLibrary.getAllPatterns());
  }, []);

  const filteredPatterns = useMemo(() => {
    return patterns.filter((pattern) => {
      // 搜索过滤
      const matchesSearch =
        searchQuery === '' ||
        pattern.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pattern.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pattern.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      // 类型过滤
      const matchesType = selectedType === 'all' || pattern.type === selectedType;

      // 评级过滤
      const matchesRating = selectedRating === 'all' || pattern.successRating === selectedRating;

      return matchesSearch && matchesType && matchesRating;
    });
  }, [patterns, searchQuery, selectedType, selectedRating]);

  const extractFromCurrentSession = useCallback(async () => {
    if (!currentSessionData) return;

    setExtracting(true);
    try {
      const pattern = extractPatternFromSession(
        currentSessionData,
        currentSessionName
      );
      if (pattern) {
        patternLibrary.addPattern(pattern);
        setShowExtractor(false);
      } else {
        alert('会话太短或未达到提取标准，无法提取模式');
      }
    } finally {
      setExtracting(false);
    }
  }, [currentSessionData, currentSessionName]);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定要删除这个模式吗？')) {
      patternLibrary.deletePattern(id);
    }
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    patternLibrary.duplicatePattern(id);
  }, []);

  const handleToggleFavorite = useCallback((id: string) => {
    patternLibrary.toggleFavorite(id);
  }, []);

  const handleUse = useCallback((pattern: SessionPattern) => {
    patternLibrary.incrementUsage(pattern.id);
    onUsePattern?.(pattern);
  }, [onUsePattern]);

  const handleExport = useCallback(() => {
    const data = patternLibrary.exportLibrary();
    patternLibrary.downloadJSON(data, `session-patterns-${Date.now()}.json`);
  }, []);

  const handleImport = useCallback(async (file: File) => {
    try {
      const data = await patternLibrary.readJSONFile(file);
      const imported = patternLibrary.importLibrary(data);
      alert(`成功导入 ${imported} 个模式！`);
      setShowImport(false);
    } catch (err) {
      alert('导入失败：文件格式不正确');
      console.error('Import failed:', err);
    }
  }, []);

  const stats = useMemo(() => patternLibrary.getStats(), [patterns]);

  return (
    <div className="space-y-6">
      {/* 头部区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            会话模式库
          </h3>
          <p className="text-slate-400 text-sm">
            从历史会话中学习和提取成功的任务模式
          </p>
        </div>
        <div className="flex gap-2">
          {currentSessionData && (
            <button
              onClick={() => setShowExtractor(true)}
              className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              从当前会话提取
            </button>
          )}
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
        </div>
      </div>

      {/* 统计卡片 */}
      {stats.totalPatterns > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Layers className="w-4 h-4" />
              总模式数
            </div>
            <div className="text-2xl font-bold">{stats.totalPatterns}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Bookmark className="w-4 h-4" />
              收藏
            </div>
            <div className="text-2xl font-bold">{stats.favoriteCount}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Zap className="w-4 h-4" />
              使用次数
            </div>
            <div className="text-2xl font-bold">{stats.totalUsage}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Cpu className="w-4 h-4" />
              类型数
            </div>
            <div className="text-2xl font-bold">{Object.keys(stats.byType).length}</div>
          </div>
        </div>
      )}

      {/* 搜索和过滤 */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索模式..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">全部类型</option>
            {PATTERN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={selectedRating}
            onChange={(e) => setSelectedRating(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">全部评级</option>
            <option value="excellent">优秀</option>
            <option value="good">良好</option>
            <option value="moderate">一般</option>
            <option value="needs_improvement">需改进</option>
          </select>
        </div>
      </div>

      {/* 模式列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredPatterns.map((pattern) => {
          const typeInfo = PATTERN_TYPE_INFO[pattern.type];
          const ratingInfo = SUCCESS_RATING_INFO[pattern.successRating];
          const isExpanded = expandedPatternId === pattern.id;

          return (
            <div
              key={pattern.id}
              className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors"
            >
              {/* 卡片头部 */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedPatternId(isExpanded ? null : pattern.id)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xl">{typeInfo.icon}</span>
                      <h4 className="font-medium truncate">{pattern.name}</h4>
                      {pattern.isFavorite && (
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${ratingInfo.color}`}>
                        {ratingInfo.label}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm line-clamp-2">
                      {pattern.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(pattern.id);
                      }}
                      className={`p-1 hover:bg-slate-700 rounded transition-colors ${
                        pattern.isFavorite ? 'text-yellow-400' : 'text-slate-400'
                      }`}
                      title={pattern.isFavorite ? '取消收藏' : '收藏'}
                    >
                      <Star className={`w-4 h-4 ${pattern.isFavorite ? 'fill-yellow-400' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPatternId(isExpanded ? null : pattern.id);
                      }}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 标签 */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {pattern.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                  {pattern.tags.length > 4 && (
                    <span className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-400">
                      +{pattern.tags.length - 4}
                    </span>
                  )}
                </div>

                {/* 元数据 */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {pattern.totalSteps} 步
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {pattern.durationMs > 0
                        ? `${Math.round(pattern.durationMs / 60000)} 分钟`
                        : '未知'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {pattern.tokenEfficiency}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      {pattern.usageCount} 次
                    </span>
                  </div>
                  {pattern.sourceSessionName && (
                    <span className="text-slate-600 truncate max-w-[150px]">
                      来自: {pattern.sourceSessionName}
                    </span>
                  )}
                </div>
              </div>

              {/* 展开详情 */}
              {isExpanded && (
                <div className="border-t border-slate-700 p-4 space-y-4">
                  {/* 工具使用模式 */}
                  {pattern.toolPatterns.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Cpu className="w-4 h-4" />
                        工具使用
                      </h5>
                      <div className="space-y-2">
                        {pattern.toolPatterns.map((tool, idx) => (
                          <div key={idx} className="bg-slate-900/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{tool.toolName}</span>
                              <span className="text-sm text-slate-400">
                                {tool.frequency} 次 · {Math.round(tool.successRate * 100)}% 成功
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 关键提示词 */}
                  {pattern.keyPrompts.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        关键提示词
                      </h5>
                      <div className="space-y-2">
                        {pattern.keyPrompts.map((prompt) => (
                          <div key={prompt.id} className="bg-slate-900/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-slate-400">
                                效果: {prompt.effectivenessScore}%
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 line-clamp-3">
                              {prompt.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 工作流 */}
                  {pattern.workflow.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        工作流
                      </h5>
                      <div className="space-y-2">
                        {pattern.workflow.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-300">
                                {step.stepDescription}
                              </p>
                              <span className="text-xs text-slate-500">
                                {step.stepType === 'user_input' ? '用户输入' :
                                 step.stepType === 'tool_call' ? '工具调用' : '助手回复'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 最佳实践和注意事项 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pattern.bestPractices.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-green-400 mb-2">最佳实践</h5>
                        <ul className="space-y-1">
                          {pattern.bestPractices.map((practice, idx) => (
                            <li key={idx} className="text-sm text-slate-400 flex items-start gap-2">
                              <Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                              {practice}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pattern.pitfalls.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-amber-400 mb-2">注意事项</h5>
                        <ul className="space-y-1">
                          {pattern.pitfalls.map((pitfall, idx) => (
                            <li key={idx} className="text-sm text-slate-400 flex items-start gap-2">
                              <X className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                              {pitfall}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
                    {onUsePattern && (
                      <button
                        onClick={() => handleUse(pattern)}
                        className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
                      >
                        应用模式
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(pattern.id)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                      title="复制"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {!pattern.isManual && (
                      <button
                        onClick={() => handleDelete(pattern.id)}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredPatterns.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Bookmark className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">
              {patterns.length === 0 ? '还没有会话模式，试试从当前会话提取吧！' : '没有匹配的模式'}
            </p>
          </div>
        )}
      </div>

      {/* 提取器弹窗 */}
      {showExtractor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowExtractor(false)}
          />
          <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                提取会话模式
              </h3>
              <button
                onClick={() => setShowExtractor(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300">
                从当前会话中自动分析和提取成功的任务模式。
              </p>
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">会话名称</span>
                  <span className="text-slate-200">{currentSessionName || '当前会话'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">消息数</span>
                  <span className="text-slate-200">{currentSessionData?.stats.totalMessages || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">工具调用</span>
                  <span className="text-slate-200">{currentSessionData?.stats.toolCalls || 0}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                * 会话至少需要 3 步对话才能提取模式
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => setShowExtractor(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={extractFromCurrentSession}
                disabled={extracting}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? '提取中...' : '提取模式'}
              </button>
            </div>
          </div>
        </div>
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
              <h3 className="text-lg font-semibold">导入模式库</h3>
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
                  id="pattern-import"
                />
                <label
                  htmlFor="pattern-import"
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
