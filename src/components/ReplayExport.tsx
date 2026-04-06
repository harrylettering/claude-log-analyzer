import { useState, useCallback } from 'react';
import { X, Video, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface ReplayExportProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'webm') => Promise<void>;
}

type ExportState = 'idle' | 'exporting' | 'success' | 'error';

export function ReplayExport({ isOpen, onClose, onExport }: ReplayExportProps) {
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [error, setError] = useState<string>('');

  const handleExportWebM = useCallback(async () => {
    try {
      setExportState('exporting');
      setError('');

      await onExport('webm');

      setExportState('success');
    } catch (err) {
      console.error('Export failed:', err);
      setExportState('error');
      setError(err instanceof Error ? err.message : '导出失败');
    }
  }, [onExport]);

  const handleClose = useCallback(() => {
    if (exportState === 'exporting') {
      if (!confirm('正在导出中，确定要关闭吗？')) {
        return;
      }
    }
    setExportState('idle');
    setError('');
    onClose();
  }, [exportState, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Video className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">导出</h2>
              <p className="text-sm text-slate-400">导出会话回放关键帧</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {exportState === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                选择导出方式：
              </p>

              <button
                onClick={handleExportWebM}
                className="w-full flex items-center justify-between p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-5 h-5 text-green-500" />
                  <div className="text-left">
                    <div className="font-medium">导出关键帧截图</div>
                    <div className="text-xs text-slate-400">导出用户消息和工具调用的 PNG 截图</div>
                  </div>
                </div>
              </button>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-300">
                    <p className="font-medium mb-1">提示</p>
                    <p className="text-amber-400/80">
                      如需完整视频，请使用浏览器的录屏功能（如 Chrome 的 "录制" 功能，按 Cmd+Shift+5 (Mac) 或 Win+G (Windows)）。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {exportState === 'exporting' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-lg font-medium">正在导出...</p>
              <p className="text-sm text-slate-400">请稍候，正在截取关键帧</p>
            </div>
          )}

          {exportState === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-green-400">导出成功！</p>
              <p className="text-sm text-slate-400 mt-2">关键帧截图已下载</p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          )}

          {exportState === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-red-400">导出失败</p>
              {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
              <div className="flex gap-3 justify-center mt-4">
                <button
                  onClick={() => setExportState('idle')}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  重试
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
