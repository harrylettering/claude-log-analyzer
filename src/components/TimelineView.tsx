import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, PlayCircle } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import {
  getEntryIcon,
  getEntryColor,
  getEntryBg,
  getMessagePreview,
} from '../utils/timelineHelpers';
import { filterEntries } from '../utils/searchFilter';
import type { SearchFilters } from '../types/search';
import { DEFAULT_FILTERS } from '../types/search';
import { AdvancedSearchFilter } from './AdvancedSearchFilter';

interface TimelineViewProps {
  data: ParsedLogData;
  onStartReplay?: (index: number) => void;
}

export function TimelineView({ data, onStartReplay }: TimelineViewProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  const toggleExpand = useCallback((uuid: string) => {
    setExpandedEntries(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(uuid)) {
        newExpanded.delete(uuid);
      } else {
        newExpanded.add(uuid);
      }
      return newExpanded;
    });
  }, []);

  // 过滤条目
  const searchResult = useMemo(() => filterEntries(data.entries, filters), [data.entries, filters]);
  const filteredEntries = searchResult.entries;

  // 使用 useMemo 避免每次渲染都重新计算
  const entriesWithKeys = useMemo(() => {
    return filteredEntries.map((entry, index) => ({
      entry,
      index,
      key: entry.uuid || index.toString(),
    }));
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">会话时间线</h2>
        <p className="text-slate-400">查看完整的消息流和时间序列</p>
      </div>

      {/* 高级搜索过滤器 */}
      <AdvancedSearchFilter
        entries={data.entries}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={searchResult.filteredCount}
        totalCount={searchResult.totalCount}
      />

      <div className="relative">
        {/* 时间线 */}
        <div className="space-y-4">
          {entriesWithKeys.map(({ entry, index, key }) => {
            const isExpanded = expandedEntries.has(key);
            const preview = getMessagePreview(entry);
            const previewWithEllipsis = preview.length >= 100 ? preview + '...' : preview;

            return (
              <div key={key} className="relative flex gap-4">
                {/* 时间点 */}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full ${getEntryColor(entry.type)} flex items-center justify-center text-white z-10`}>
                    {getEntryIcon(entry.type)}
                  </div>
                  {index < filteredEntries.length - 1 && (
                    <div className="w-0.5 flex-1 bg-slate-700 mt-2" />
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0 pb-4">
                  <div className={`rounded-lg border p-4 overflow-hidden ${getEntryBg(entry.type)}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-semibold capitalize shrink-0">{entry.type}</span>
                        {entry.isSidechain && (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full shrink-0">
                            Sidechain
                          </span>
                        )}
                        {entry.isMeta && (
                          <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded-full shrink-0">
                            Meta
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400 text-sm">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        {onStartReplay && (
                          <button
                            onClick={() => onStartReplay(index)}
                            className="p-1 hover:bg-blue-600/20 rounded text-blue-400 hover:text-blue-300"
                            title="从这里开始回放"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleExpand(key)}
                          className="p-1 hover:bg-slate-700 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-slate-300 text-sm">
                      {previewWithEllipsis}
                    </div>

                    {/* 展开的详情 */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-600">
                        <pre className="text-xs text-slate-400 overflow-x-auto max-h-96 bg-slate-900/50 p-3 rounded w-full">
                          {JSON.stringify(entry, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {entriesWithKeys.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-400">没有匹配的日志条目</p>
              <p className="text-slate-500 text-sm mt-1">尝试调整搜索条件或过滤器</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
