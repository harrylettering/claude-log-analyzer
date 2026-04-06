import { useState, useCallback } from 'react';
import { ArrowRight, Copy, Check, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { PromptSuggestion } from '../types/prompt';

interface PromptSuggestionsProps {
  suggestions: PromptSuggestion[];
}

const IMPACT_COLORS: Record<string, string> = {
  small: 'text-blue-400 bg-blue-500/20',
  medium: 'text-amber-400 bg-amber-500/20',
  large: 'text-green-400 bg-green-500/20',
};

const IMPACT_LABELS: Record<string, string> = {
  small: '小幅改进',
  medium: '中等改进',
  large: '大幅改进',
};

export function PromptSuggestions({ suggestions }: PromptSuggestionsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleCopy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  if (suggestions.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
        <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">没有具体的优化建议</p>
        <p className="text-slate-500 text-sm mt-1">当前提示词质量已经很好了！</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold">优化建议</h3>
        <span className="px-2 py-0.5 bg-slate-700 rounded-full text-sm text-slate-300">
          {suggestions.length}
        </span>
      </div>

      <div className="space-y-4">
        {suggestions.map((suggestion) => {
          const isExpanded = expandedIds.has(suggestion.id);

          return (
            <div
              key={suggestion.id}
              className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
            >
              {/* 标题栏 */}
              <div
                className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-700/50"
                onClick={() => toggleExpand(suggestion.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${IMPACT_COLORS[suggestion.impact]}`}>
                    {IMPACT_LABELS[suggestion.impact]}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300 shrink-0">
                    {suggestion.category}
                  </span>
                  <p className="text-slate-300 truncate">{suggestion.explanation}</p>
                </div>
                <button className="p-1 hover:bg-slate-600 rounded shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>

              {/* 详细内容 */}
              {isExpanded && (
                <div className="p-4 border-t border-slate-700 space-y-4">
                  {/* 对比视图 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 优化前 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-400">优化前</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(suggestion.original, `${suggestion.id}-original`);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        >
                          {copiedId === `${suggestion.id}-original` ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedId === `${suggestion.id}-original` ? '已复制' : '复制'}
                        </button>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-red-500/20">
                        <pre className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                          {suggestion.original}
                        </pre>
                      </div>
                    </div>

                    {/* 箭头 */}
                    <div className="hidden md:flex items-center justify-center">
                      <ArrowRight className="w-6 h-6 text-slate-500" />
                    </div>

                    {/* 优化后 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-400">优化后</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(suggestion.improved, `${suggestion.id}-improved`);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        >
                          {copiedId === `${suggestion.id}-improved` ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedId === `${suggestion.id}-improved` ? '已复制' : '复制'}
                        </button>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-green-500/20">
                        <pre className="text-sm text-slate-200 whitespace-pre-wrap break-words">
                          {suggestion.improved}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* 说明 */}
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-purple-300 mb-2">优化说明</h4>
                    <p className="text-slate-300 text-sm">{suggestion.explanation}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
