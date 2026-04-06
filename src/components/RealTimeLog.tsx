import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Download, FileText } from 'lucide-react';
import type { ParsedLogData, LogEntry, EntryCategory } from '../types/log';
import { parseLog, categorizeEntry } from '../utils/logParser';
import { filterEntries } from '../utils/searchFilter';
import type { SearchFilters } from '../types/search';
import { DEFAULT_FILTERS } from '../types/search';
import { AdvancedSearchFilter } from './AdvancedSearchFilter';

interface RealTimeLogProps {
  data: ParsedLogData;
  onDataUpdate: (data: ParsedLogData) => void;
}

export function RealTimeLog({ data, onDataUpdate }: RealTimeLogProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 过滤日志条目
  const searchResult = filterEntries(data.entries, filters);
  const filteredEntries = searchResult.entries;

  // 自动滚动
  useEffect(() => {
    if (autoScroll && !isPaused) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEntries.length, autoScroll, isPaused]);

  // 文件拖放处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const result = parseLog(content);
        onDataUpdate(result.data);
      };
      reader.readAsText(file);
    }
  }, [onDataUpdate]);

  const getEntryBadgeColor = (type: string) => {
    switch (type) {
      case 'user': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'assistant': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'system': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'file-history-snapshot': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getCategoryInfo = (category: EntryCategory): { label: string; color: string } => {
    switch (category) {
      case 'USER_INPUT': return { label: '用户输入', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
      case 'USER_INPUT_WITH_IMAGE': return { label: '用户输入(图片)', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
      case 'SLASH_COMMAND': return { label: '斜杠命令', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
      case 'TOOL_RESULT': return { label: '工具结果', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'TOOL_ERROR': return { label: '工具错误', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'AGENT_RESULT': return { label: 'Agent结果', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'ASSISTANT_TEXT': return { label: '助手回复', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'ASSISTANT_TOOL_CALL': return { label: '助手工具调用', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'ASSISTANT_THINKING_RESPONSE': return { label: '思考+回复', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'SYSTEM': return { label: '系统消息', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
      case 'SUMMARY': return { label: '会话摘要', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
      case 'FILE_HISTORY': return { label: '文件快照', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'UNKNOWN':
      default: return { label: '未知', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
    }
  };

  const formatContent = (entry: LogEntry) => {
    if (entry.type === 'user' || entry.type === 'assistant') {
      const msg = entry.message;
      if (msg?.content) {
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        if (Array.isArray(msg.content)) {
          return msg.content.map((c: any) => {
            if (c.type === 'text') return c.text;
            if (c.type === 'thinking') return `[思考] ${c.thinking}`;
            if (c.type === 'tool_use') return `[工具调用] ${c.name}\n输入: ${JSON.stringify(c.input, null, 2)}`;
            if (c.type === 'tool_result') {
              const result = typeof c.content === 'string' ? c.content : JSON.stringify(c.content, null, 2);
              return `[工具结果]${c.is_error ? ' [错误]' : ''}\n${result}`;
            }
            return JSON.stringify(c);
          }).join('\n\n');
        }
      }
    }
    return JSON.stringify(entry, null, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">实时日志流</h2>
          <p className="text-slate-400">查看原始日志流并实时更新</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              isPaused
                ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? '继续' : '暂停'}
          </button>
        </div>
      </div>

      {/* 高级搜索过滤器 */}
      <AdvancedSearchFilter
        entries={data.entries}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={searchResult.filteredCount}
        totalCount={searchResult.totalCount}
      />

      {/* 自动滚动 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-300">自动滚动</span>
        </label>
        <div className="text-sm text-slate-400">
          {filters.query && (
            <span>匹配: {searchResult.matchCount} 条</span>
          )}
        </div>
      </div>

      {/* 日志流 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
      >
        <div className="h-[600px] overflow-y-auto p-4 space-y-3">
          {filteredEntries.length > 0 ? (
            filteredEntries.map((entry, index) => (
              <div key={entry.uuid || index} className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-xs rounded border ${getEntryBadgeColor(entry.type)}`}>
                      {entry.type}
                    </span>
                    {(() => {
                      const category = entry._category || categorizeEntry(entry);
                      const categoryInfo = getCategoryInfo(category);
                      return (
                        <span className={`px-2 py-0.5 text-xs rounded border ${categoryInfo.color}`}>
                          {categoryInfo.label}
                        </span>
                      );
                    })()}
                    {entry.isSidechain && (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded border border-amber-500/30">
                        Sidechain
                      </span>
                    )}
                    {entry.isMeta && (
                      <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded border border-slate-500/30">
                        Meta
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <pre className="px-4 py-3 text-sm text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {formatContent(entry)}
                </pre>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <FileText className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400 mb-2">没有匹配的日志条目</p>
              <p className="text-slate-500 text-sm">尝试调整搜索条件或过滤器</p>
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* 拖放提示 */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 border-dashed text-center">
        <Download className="w-5 h-5 text-slate-400 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">拖放新的日志文件到此处加载</p>
      </div>
    </div>
  );
}
