import { useState, useCallback } from 'react';
import type { ParsedLogData } from '../types/log';

interface DebugPanelProps {
  data: ParsedLogData;
}

export function DebugPanel({ data }: DebugPanelProps) {
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [showSampleEntries, setShowSampleEntries] = useState(false);

  const toggleTokenUsage = useCallback(() => {
    setShowTokenUsage(prev => !prev);
  }, []);

  const toggleSampleEntries = useCallback(() => {
    setShowSampleEntries(prev => !prev);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">调试面板</h2>
        <p className="text-slate-400">查看解析的原始数据</p>
      </div>

      {/* Stats Summary */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Stats 汇总</h3>
        <pre className="bg-slate-900 p-4 rounded-lg text-sm overflow-auto text-green-400">
          {JSON.stringify(data.stats, null, 2)}
        </pre>
      </div>

      {/* Token Usage Debug */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Token Usage 数据 ({data.tokenUsage.length} 条)</h3>
          <button
            onClick={toggleTokenUsage}
            className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-500"
          >
            {showTokenUsage ? '隐藏' : '显示'}
          </button>
        </div>
        {showTokenUsage && (
          <pre className="bg-slate-900 p-4 rounded-lg text-sm overflow-auto max-h-96 text-blue-400">
            {JSON.stringify(data.tokenUsage.slice(0, 10), null, 2)}
            {data.tokenUsage.length > 10 ? '\n... (更多内容已省略)' : ''}
          </pre>
        )}
      </div>

      {/* Sample Entries */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">日志条目样本 (前 3 条)</h3>
          <button
            onClick={toggleSampleEntries}
            className="px-3 py-1 bg-purple-600 rounded text-sm hover:bg-purple-500"
          >
            {showSampleEntries ? '隐藏' : '显示'}
          </button>
        </div>
        {showSampleEntries && (
          <pre className="bg-slate-900 p-4 rounded-lg text-sm overflow-auto max-h-96 text-yellow-400">
            {JSON.stringify(data.entries.slice(0, 3), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
