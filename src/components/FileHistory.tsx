
import { FileText, Clock } from 'lucide-react';
import type { ParsedLogData } from '../types/log';

interface FileHistoryProps {
  data: ParsedLogData;
}

export function FileHistory({ data }: FileHistoryProps) {
  const { fileHistory } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">文件历史</h2>
        <p className="text-slate-400">查看文件变更历史记录</p>
      </div>

      {fileHistory.length > 0 ? (
        <div className="space-y-4">
          {fileHistory.map((snapshot, index) => {
            const fileCount = Object.keys(snapshot.files).length;
            return (
              <div key={index} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <FileText className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <div className="font-semibold">快照 #{fileHistory.length - index}</div>
                      <div className="text-slate-400 text-sm flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(snapshot.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-sm">
                    {fileCount} 个文件
                  </span>
                </div>

                {fileCount > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(snapshot.files).map(([filePath, _fileData]) => (
                      <div key={filePath} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                        <div className="font-mono text-sm">{filePath}</div>
                        <div className="text-slate-400 text-xs mt-1">
                          已备份
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    此快照中没有备份的文件
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">此会话中没有文件历史快照</p>
        </div>
      )}
    </div>
  );
}
