import { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Settings,
  Zap,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import type { SearchFilters, MessageTypeFilter, SearchMode } from '../types/search';
import { DEFAULT_FILTERS } from '../types/search';
import { getToolNames, isValidRegex } from '../utils/searchFilter';
import type { LogEntry } from '../types/log';

interface AdvancedSearchFilterProps {
  entries: LogEntry[];
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  resultCount: number;
  totalCount: number;
}

const MESSAGE_TYPES: { value: MessageTypeFilter; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'user', label: '用户消息' },
  { value: 'assistant', label: '助手消息' },
  { value: 'system', label: '系统消息' },
  { value: 'tool', label: '工具消息' },
  { value: 'file-history-snapshot', label: '文件快照' },
];

const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'simple', label: '简单搜索' },
  { value: 'exact', label: '精确匹配' },
  { value: 'regex', label: '正则表达式' },
];

export function AdvancedSearchFilter({
  entries, filters, onFiltersChange, resultCount, totalCount }: AdvancedSearchFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const availableToolNames = useMemo(() => getToolNames(entries), [entries]);

  const updateFilter = useCallback((updates: Partial<SearchFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  }, [filters, onFiltersChange]);

  const resetFilters = useCallback(() => {
    onFiltersChange({ ...DEFAULT_FILTERS });
  }, [onFiltersChange]);

  const toggleMessageType = useCallback((type: MessageTypeFilter) => {
    let newTypes: MessageTypeFilter[];
    if (type === 'all') {
      newTypes = ['all'];
    } else {
      const currentWithoutAll = filters.messageTypes.filter(t => t !== 'all');
      if (currentWithoutAll.includes(type)) {
        newTypes = currentWithoutAll.filter(t => t !== type);
        if (newTypes.length === 0) newTypes = ['all'];
      } else {
        newTypes = [...currentWithoutAll, type];
      }
    }
    updateFilter({ messageTypes: newTypes });
  }, [filters.messageTypes, updateFilter]);

  const toggleToolName = useCallback((name: string) => {
    const newTools = filters.toolNames.includes(name)
      ? filters.toolNames.filter(n => n !== name)
      : [...filters.toolNames, name];
    updateFilter({ toolNames: newTools });
  }, [filters.toolNames, updateFilter]);

  const isRegexValid = filters.searchMode === 'regex'
    ? (!filters.query || isValidRegex(filters.query))
    : true;

  const hasActiveFilters = useMemo(() => {
    return (
      filters.query !== '' ||
      filters.searchMode !== 'simple' ||
      filters.caseSensitive !== false ||
      !filters.messageTypes.includes('all') ||
      filters.messageTypes.length > 1 ||
      filters.toolNames.length > 0 ||
      filters.timeRange.startTime !== undefined ||
      filters.timeRange.endTime !== undefined ||
      filters.tokenRange.minInput !== undefined ||
      filters.tokenRange.maxInput !== undefined ||
      filters.tokenRange.minOutput !== undefined ||
      filters.tokenRange.maxOutput !== undefined ||
      filters.tokenRange.minTotal !== undefined ||
      filters.tokenRange.maxTotal !== undefined ||
      filters.onlyWithErrors !== false ||
      filters.onlyWithTools !== false ||
      filters.onlySidechain !== false
    );
  }, [filters]);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* 基础搜索栏 */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索日志内容..."
                value={filters.query}
                onChange={(e) => updateFilter({ query: e.target.value })}
                className={`w-full bg-slate-900 border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 ${
                  isRegexValid
                    ? 'border-slate-600 focus:ring-blue-500'
                    : 'border-red-500 focus:ring-red-500'
                }`}
              />
              {!isRegexValid && (
                <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              )}
            </div>
          </div>

          {/* 搜索模式 */}
          <select
            value={filters.searchMode}
            onChange={(e) => updateFilter({ searchMode: e.target.value as SearchMode })}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SEARCH_MODES.map(mode => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>

          {/* 区分大小写 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.caseSensitive}
              onChange={(e) => updateFilter({ caseSensitive: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-300">区分大小写</span>
          </label>

          {/* 高级选项切换 */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            <Filter className="w-4 h-4" />
            高级选项
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* 重置按钮 */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
            >
              <X className="w-4 h-4" />
              重置
            </button>
          )}
        </div>

        {/* 统计信息 */}
        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="text-slate-400">
            显示 <span className="text-white font-semibold">{resultCount}</span> / <span className="text-slate-300">{totalCount}</span> 条
          </span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
              已应用过滤器
            </span>
          )}
        </div>
      </div>

      {/* 高级选项 */}
      {showAdvanced && (
        <div className="p-4 space-y-4 bg-slate-800/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 消息类型 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                消息类型
              </h4>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => toggleMessageType(type.value)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      filters.messageTypes.includes(type.value)
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                        : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 工具名称 */}
            {availableToolNames.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  工具名称
                </h4>
                <div className="flex flex-wrap gap-2">
                  {availableToolNames.map(name => (
                    <button
                      key={name}
                      onClick={() => toggleToolName(name)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        filters.toolNames.includes(name)
                          ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                          : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 时间范围 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                时间范围
              </h4>
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  value={filters.timeRange.startTime || ''}
                  onChange={(e) => updateFilter({
                    timeRange: { ...filters.timeRange, startTime: e.target.value || undefined }
                  })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="datetime-local"
                  value={filters.timeRange.endTime || ''}
                  onChange={(e) => updateFilter({
                    timeRange: { ...filters.timeRange, endTime: e.target.value || undefined }
                  })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* 其他标志 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                其他过滤
              </h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.onlyWithErrors}
                    onChange={(e) => updateFilter({ onlyWithErrors: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">仅显示有错误的</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.onlyWithTools}
                    onChange={(e) => updateFilter({ onlyWithTools: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">仅显示有工具的</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.onlySidechain}
                    onChange={(e) => updateFilter({ onlySidechain: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">仅 Sidechain</span>
                </label>
              </div>
            </div>
          </div>

          {/* Token 范围 */}
          <div className="pt-4 border-t border-slate-700">
            <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4" />
              Token 范围
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400">输入 Token</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="最小"
                    value={filters.tokenRange.minInput ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        minInput: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="最大"
                    value={filters.tokenRange.maxInput ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        maxInput: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">输出 Token</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="最小"
                    value={filters.tokenRange.minOutput ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        minOutput: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="最大"
                    value={filters.tokenRange.maxOutput ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        maxOutput: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">总计 Token</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="最小"
                    value={filters.tokenRange.minTotal ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        minTotal: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="最大"
                    value={filters.tokenRange.maxTotal ?? ''}
                    onChange={(e) => updateFilter({
                      tokenRange: {
                        ...filters.tokenRange,
                        maxTotal: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
