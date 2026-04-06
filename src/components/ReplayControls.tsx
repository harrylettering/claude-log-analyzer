import { Play, Pause, SkipBack, SkipForward, RefreshCw, Download, Gauge } from 'lucide-react';

interface ReplayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  isLooping: boolean;
  onLoopToggle: () => void;
  onExport: () => void;
}

const SPEEDS = [0.5, 1, 2, 3] as const;

export function ReplayControls({
  isPlaying,
  onPlayPause,
  onPrev,
  onNext,
  speed,
  onSpeedChange,
  isLooping,
  onLoopToggle,
  onExport,
}: ReplayControlsProps) {
  return (
    <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4 border border-slate-700">
      {/* 左侧控制 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          title="上一条 (左箭头)"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={onPlayPause}
          className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
          title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6" />
          )}
        </button>

        <button
          onClick={onNext}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          title="下一条 (右箭头)"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* 中间：速度调节 */}
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-slate-400" />
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 text-sm rounded transition-colors ${
                speed === s
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* 右侧控制 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onLoopToggle}
          className={`p-2 rounded-lg transition-colors ${
            isLooping ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-700'
          }`}
          title={isLooping ? '取消循环' : '循环播放'}
        >
          <RefreshCw className={`w-5 h-5 ${isLooping ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onExport}
          className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          title="导出视频"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm">导出</span>
        </button>
      </div>
    </div>
  );
}
