import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PlayCircle, MessageSquare, User, Bot, Settings } from 'lucide-react';
import type { ParsedLogData, LogEntry } from '../types/log';
import { ReplayProgress } from './ReplayProgress';
import { ReplayControls } from './ReplayControls';
import { ReplayExport } from './ReplayExport';
import { UI_COLORS } from '../constants';
import html2canvas from 'html2canvas';

interface SessionReplayProps {
  data: ParsedLogData;
  startIndex?: number;
}

// 速度映射
const SPEED_INTERVALS: Record<number, number> = {
  0.5: 2000,
  1: 1000,
  2: 500,
  3: 333,
};

// 获取消息样式
function getEntryStyle(entry: LogEntry) {
  if (entry.type === 'user') {
    return UI_COLORS.user;
  }
  if (entry.type === 'assistant') {
    return UI_COLORS.assistant;
  }
  return UI_COLORS.default;
}

// 获取消息图标
function getEntryIcon(entry: LogEntry) {
  if (entry.type === 'user') {
    return <User className="w-5 h-5" />;
  }
  if (entry.type === 'assistant') {
    return <Bot className="w-5 h-5" />;
  }
  return <MessageSquare className="w-5 h-5" />;
}

// 获取消息文本预览
function getEntryPreview(entry: LogEntry): string {
  if (entry.type === 'user' || entry.type === 'assistant') {
    const content = entry.message?.content;
    if (typeof content === 'string') {
      return content.slice(0, 200);
    }
    if (Array.isArray(content)) {
      const textContent = content.find((c) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        return (textContent.text as string).slice(0, 200);
      }
      const toolUse = content.find((c) => c.type === 'tool_use');
      if (toolUse && 'name' in toolUse) {
        return `工具调用: ${toolUse.name}`;
      }
    }
  }
  if (entry.type === 'system') {
    return '系统消息';
  }
  return entry.type;
}

// 检查是否有工具调用
function hasToolCalls(entry: LogEntry): boolean {
  if (entry.type === 'assistant' && entry.message?.content) {
    const content = entry.message.content;
    if (Array.isArray(content)) {
      return content.some((c: any) => c.type === 'tool_use');
    }
  }
  return false;
}

export function SessionReplay({ data, startIndex = 0 }: SessionReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const timerRef = useRef<number | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // 过滤出主要消息（排除 meta 消息）
  const displayEntries = useMemo(() => {
    return data.entries.filter((e) => !e.isMeta);
  }, [data.entries]);

  // 当前消息
  const currentEntry = displayEntries[currentIndex];
  const entryStyle = currentEntry ? getEntryStyle(currentEntry) : UI_COLORS.default;
  const hasTools = currentEntry ? hasToolCalls(currentEntry) : false;

  // 播放逻辑
  const playNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= displayEntries.length) {
        if (isLooping) {
          return 0;
        }
        setIsPlaying(false);
        return prev;
      }
      return next;
    });
  }, [displayEntries.length, isLooping]);

  // 定时器
  useEffect(() => {
    if (isPlaying) {
      const interval = SPEED_INTERVALS[playbackSpeed] || 1000;
      timerRef.current = setInterval(playNext, interval);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, playNext]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex((prev) => Math.min(displayEntries.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayEntries.length]);

  // 从起始位置开始播放
  useEffect(() => {
    if (startIndex > 0) {
      setCurrentIndex(startIndex);
      setIsPlaying(true);
    }
  }, [startIndex]);

  // 控制函数
  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handlePrev = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.min(displayEntries.length - 1, prev + 1));
  }, [displayEntries.length]);

  const handleSeek = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleLoopToggle = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  const handleExport = useCallback(async (_format: 'webm') => {
    if (!viewerRef.current) {
      throw new Error('无法获取回放视图');
    }

    try {
      // 保存当前状态
      const originalIndex = currentIndex;
      const originalIsPlaying = isPlaying;
      setIsPlaying(false);

      // 获取关键帧（用户消息和工具调用）
      const keyFrames = displayEntries.filter((entry, idx) => {
        if (entry.type === 'user') return true;
        if (entry.type === 'assistant' && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            return content.some((c: any) => c.type === 'tool_use');
          }
        }
        return idx === 0 || idx === displayEntries.length - 1;
      });

      if (keyFrames.length === 0) {
        throw new Error('没有找到关键帧');
      }

      // 导出每个关键帧的截图
      for (let i = 0; i < keyFrames.length; i++) {
        const entryIndex = displayEntries.indexOf(keyFrames[i]);
        setCurrentIndex(entryIndex);

        // 等待渲染
        await new Promise(resolve => setTimeout(resolve, 300));

        // 截图
        const canvas = await html2canvas(viewerRef.current, {
          backgroundColor: '#1e293b',
          scale: 2,
          useCORS: true,
        });

        // 下载
        const link = document.createElement('a');
        link.download = `session-frame-${String(i + 1).padStart(3, '0')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }

      // 恢复原始状态
      setCurrentIndex(originalIndex);
      if (originalIsPlaying) {
        setIsPlaying(true);
      }

      alert(`已导出 ${keyFrames.length} 张关键帧截图！\n\n如需完整视频，请使用浏览器录屏功能（如 Chrome 的 "分享你的屏幕"）。`);

    } catch (err) {
      console.error('Export failed:', err);
      throw err;
    }
  }, [currentIndex, isPlaying, displayEntries]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <PlayCircle className="w-6 h-6" />
          会话回放
        </h2>
        <p className="text-slate-400">
          回放会话过程 · 空格键暂停/播放 · 左右箭头跳转
        </p>
      </div>

      {/* 主回放视图 */}
      <div className="space-y-4">
        {/* 消息展示区 */}
        <div
          ref={viewerRef}
          className={`bg-slate-800 rounded-xl border ${entryStyle.border} p-6 min-h-[400px]`}
        >
          {currentEntry ? (
            <div className="space-y-4">
              {/* 消息头部 */}
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${entryStyle.bg}`}>
                  <div className={entryStyle.text}>{getEntryIcon(currentEntry)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`font-semibold ${entryStyle.text}`}>
                      {currentEntry.type === 'user' ? '用户' :
                       currentEntry.type === 'assistant' ? '助手' :
                       currentEntry.type}
                    </span>
                    {hasTools && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs">
                        <Settings className="w-3 h-3" />
                        工具调用
                      </span>
                    )}
                    <span className="text-slate-500 text-sm">
                      {new Date(currentEntry.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {/* 消息内容 */}
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-300 whitespace-pre-wrap break-words">
                      {getEntryPreview(currentEntry)}
                      {getEntryPreview(currentEntry).length >= 200 && '...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[350px] text-slate-500">
              <MessageSquare className="w-12 h-12 mb-4" />
              <p>选择一条消息开始回放</p>
            </div>
          )}
        </div>

        {/* 进度条 */}
        <ReplayProgress
          currentIndex={currentIndex}
          totalEntries={displayEntries.length}
          entries={displayEntries}
          onSeek={handleSeek}
        />

        {/* 控制栏 */}
        <ReplayControls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onPrev={handlePrev}
          onNext={handleNext}
          speed={playbackSpeed}
          onSpeedChange={handleSpeedChange}
          isLooping={isLooping}
          onLoopToggle={handleLoopToggle}
          onExport={() => setShowExport(true)}
        />

        {/* 快捷键提示 */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-slate-700 rounded">空格</kbd>
            暂停/播放
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-slate-700 rounded">←</kbd>
            上一条
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-slate-700 rounded">→</kbd>
            下一条
          </span>
        </div>
      </div>

      {/* 导出面板 */}
      <ReplayExport
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
      />
    </div>
  );
}
