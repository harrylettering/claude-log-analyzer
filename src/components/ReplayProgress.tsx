import { useCallback, useMemo } from 'react';
import type { LogEntry } from '../types/log';

interface ReplayProgressProps {
  currentIndex: number;
  totalEntries: number;
  entries: LogEntry[];
  onSeek: (index: number) => void;
}

export function ReplayProgress({ currentIndex, totalEntries, entries, onSeek }: ReplayProgressProps) {

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = Math.min(Math.max(0, parseInt(e.target.value) - 1), totalEntries - 1);
    onSeek(newIndex);
  }, [totalEntries, onSeek]);

  const currentEntry = entries[currentIndex];
  const currentTime = useMemo(() => {
    if (!currentEntry?.timestamp) return '';
    return new Date(currentEntry.timestamp).toLocaleTimeString();
  }, [currentEntry]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <input
            type="range"
            min="1"
            max={totalEntries}
            value={currentIndex + 1}
            onChange={handleChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
        <div className="text-sm text-slate-400 font-mono min-w-[120px] text-right">
          {currentIndex + 1} / {totalEntries}
        </div>
      </div>
      {currentTime && (
        <div className="text-xs text-slate-500 text-center">
          {currentTime}
        </div>
      )}
    </div>
  );
}
