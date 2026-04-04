import { useState, useCallback } from 'react';
import {
  Upload,
  X,
  BarChart3,
  Zap,
  Settings,
  Minus,
  TrendingUp,
  TrendingDown,
  FileText,
} from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { parseLog } from '../utils/logParser';
import { formatDuration, formatTokens } from '../utils/logParser';

interface SessionCompareProps {
  // 可以传入默认会话
  defaultSession?: ParsedLogData;
}

type LoadedSession = {
  data: ParsedLogData;
  name: string;
};

function StatCard({
  label,
  valueA,
  valueB,
  formatFn = (v: number | string) => String(v),
  isHigherBetter = true,
}: {
  label: string;
  valueA: number | string;
  valueB: number | string;
  formatFn?: (v: number | string) => string;
  isHigherBetter?: boolean;
}) {
  const numA = typeof valueA === 'number' ? valueA : 0;
  const numB = typeof valueB === 'number' ? valueB : 0;
  const diff = numB - numA;
  const diffPercent = numA > 0 ? (diff / numA) * 100 : 0;

  const getDiffIcon = () => {
    if (diff === 0) return <Minus className="w-4 h-4 text-slate-400" />;
    const isBetter = isHigherBetter ? diff > 0 : diff < 0;
    if (isBetter) {
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    }
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  };

  const getDiffClass = () => {
    if (diff === 0) return 'text-slate-400';
    const isBetter = isHigherBetter ? diff > 0 : diff < 0;
    return isBetter ? 'text-green-400' : 'text-red-400';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="text-sm text-slate-400 mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold text-blue-400">{formatFn(valueA)}</div>
          <div className="text-xs text-slate-500 mt-1">会话 A</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-400">{formatFn(valueB)}</div>
          <div className="text-xs text-slate-500 mt-1">会话 B</div>
        </div>
      </div>
      {typeof valueA === 'number' && typeof valueB === 'number' && (
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2">
          {getDiffIcon()}
          <span className={`text-sm font-medium ${getDiffClass()}`}>
            {diff > 0 ? '+' : ''}{diff !== 0 ? formatFn(diff) : '无变化'}
            {diffPercent !== 0 && (
              <span className="text-xs ml-1">
                ({diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function SessionCompare({ defaultSession }: SessionCompareProps) {
  const [sessionA, setSessionA] = useState<LoadedSession | null>(
    defaultSession ? { data: defaultSession, name: '当前会话' } : null
  );
  const [sessionB, setSessionB] = useState<LoadedSession | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const handleLoadSession = useCallback((slot: 'a' | 'b') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.log';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const setLoading = slot === 'a' ? setLoadingA : setLoadingB;
      const setSession = slot === 'a' ? setSessionA : setSessionB;

      setLoading(true);

      try {
        const content = await file.text();
        const result = parseLog(content);
        setSession({
          data: result.data,
          name: file.name,
        });
      } catch (err) {
        console.error('Failed to load session:', err);
        alert('加载会话失败，请检查文件格式');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  }, []);

  const clearSession = useCallback((slot: 'a' | 'b') => {
    if (slot === 'a') {
      setSessionA(null);
    } else {
      setSessionB(null);
    }
  }, []);

  const bothLoaded = sessionA && sessionB;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <BarChart3 className="w-6 h-6" />
          会话对比
        </h2>
        <p className="text-slate-400">加载两个会话进行对比分析</p>
      </div>

      {/* 会话加载区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 会话 A */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              会话 A
            </h3>
            {sessionA && (
              <button
                onClick={() => clearSession('a')}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {sessionA ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3">
                <FileText className="w-4 h-4 inline mr-2 text-slate-400" />
                {sessionA.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">消息数</div>
                  <div className="font-semibold">{sessionA.data.stats.totalMessages}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Token</div>
                  <div className="font-semibold">{formatTokens(sessionA.data.stats.totalTokens)}</div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleLoadSession('a')}
              disabled={loadingA}
              className="w-full py-8 border-2 border-dashed border-slate-600 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingA ? (
                <div className="text-slate-400">加载中...</div>
              ) : (
                <div className="text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  点击加载会话 A
                </div>
              )}
            </button>
          )}
        </div>

        {/* 会话 B */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              会话 B
            </h3>
            {sessionB && (
              <button
                onClick={() => clearSession('b')}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {sessionB ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3">
                <FileText className="w-4 h-4 inline mr-2 text-slate-400" />
                {sessionB.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">消息数</div>
                  <div className="font-semibold">{sessionB.data.stats.totalMessages}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Token</div>
                  <div className="font-semibold">{formatTokens(sessionB.data.stats.totalTokens)}</div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleLoadSession('b')}
              disabled={loadingB}
              className="w-full py-8 border-2 border-dashed border-slate-600 rounded-lg hover:border-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingB ? (
                <div className="text-slate-400">加载中...</div>
              ) : (
                <div className="text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  点击加载会话 B
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 对比结果 */}
      {bothLoaded ? (
        <div className="space-y-6">
          {/* 总体统计 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              总体统计对比
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="总消息数"
                valueA={sessionA.data.stats.totalMessages}
                valueB={sessionB.data.stats.totalMessages}
                isHigherBetter={false}
              />
              <StatCard
                label="用户消息"
                valueA={sessionA.data.stats.userMessages}
                valueB={sessionB.data.stats.userMessages}
                isHigherBetter={false}
              />
              <StatCard
                label="助手消息"
                valueA={sessionA.data.stats.assistantMessages}
                valueB={sessionB.data.stats.assistantMessages}
                isHigherBetter={true}
              />
              <StatCard
                label="工具调用"
                valueA={sessionA.data.stats.toolCalls}
                valueB={sessionB.data.stats.toolCalls}
              />
              <StatCard
                label="会话时长"
                valueA={sessionA.data.stats.sessionDuration}
                valueB={sessionB.data.stats.sessionDuration}
                formatFn={(v) => formatDuration(v as number)}
                isHigherBetter={false}
              />
            </div>
          </div>

          {/* Token 对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Token 使用对比
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="输入 Token"
                valueA={sessionA.data.stats.inputTokens}
                valueB={sessionB.data.stats.inputTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={false}
              />
              <StatCard
                label="输出 Token"
                valueA={sessionA.data.stats.outputTokens}
                valueB={sessionB.data.stats.outputTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={true}
              />
              <StatCard
                label="总计 Token"
                valueA={sessionA.data.stats.totalTokens}
                valueB={sessionB.data.stats.totalTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={false}
              />
            </div>
          </div>

          {/* 工具对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              工具使用对比
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  {sessionA.name}
                </h4>
                <div className="space-y-2">
                  {Array.from(new Map(
                    sessionA.data.toolCalls.map(t => [t.name, t])
                  ).values()).map((tool, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-slate-400">
                          {sessionA.data.toolCalls.filter(t => t.name === tool.name).length} 次
                        </span>
                      </div>
                    </div>
                  )).slice(0, 5)}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  {sessionB.name}
                </h4>
                <div className="space-y-2">
                  {Array.from(new Map(
                    sessionB.data.toolCalls.map(t => [t.name, t])
                  ).values()).map((tool, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-slate-400">
                          {sessionB.data.toolCalls.filter(t => t.name === tool.name).length} 次
                        </span>
                      </div>
                    </div>
                  )).slice(0, 5)}
                </div>
              </div>
            </div>
          </div>

          {/* 模型对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              使用的模型
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-2">会话 A</div>
                <div className="flex flex-wrap gap-2">
                  {sessionA.data.stats.modelsUsed.length > 0 ? (
                    sessionA.data.stats.modelsUsed.map((model, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm border border-blue-500/30">
                        {model}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">无模型信息</span>
                  )}
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-2">会话 B</div>
                <div className="flex flex-wrap gap-2">
                  {sessionB.data.stats.modelsUsed.length > 0 ? (
                    sessionB.data.stats.modelsUsed.map((model, idx) => (
                      <span key={idx} className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm border border-purple-500/30">
                        {model}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">无模型信息</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">请加载两个会话开始对比</p>
        </div>
      )}
    </div>
  );
}
