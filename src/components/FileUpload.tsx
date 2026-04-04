
import { useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface FileUploadProps {
  onFileLoad: (content: string) => void;
  isDark: boolean;
  disabled?: boolean;
}

export function FileUpload({ onFileLoad, isDark, disabled = false }: FileUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onFileLoad(content);
      };
      reader.readAsText(file);
    }
  }, [onFileLoad, disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onFileLoad(content);
      };
      reader.readAsText(file);
    }
  }, [onFileLoad, disabled]);

  return (
    <div
      onDragOver={(e) => !disabled && e.preventDefault()}
      onDrop={handleDrop}
      className={clsx(
        "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
        disabled
          ? "border-slate-700 bg-slate-800/50 cursor-not-allowed opacity-60"
          : "cursor-pointer",
        !disabled && isDark
          ? "border-slate-600 hover:border-blue-500 hover:bg-slate-700/30"
          : "",
        !disabled && !isDark
          ? "border-slate-300 hover:border-blue-500 hover:bg-slate-50"
          : ""
      )}
    >
      <input
        type="file"
        accept=".jsonl,.json,.log"
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
        disabled={disabled}
      />
      <label
        htmlFor={disabled ? "" : "file-upload"}
        className={clsx("cursor-pointer", disabled && "cursor-not-allowed")}
      >
        {disabled ? (
          <Loader2 className={clsx("w-8 h-8 mx-auto mb-2 animate-spin", isDark ? "text-slate-500" : "text-slate-400")} />
        ) : (
          <Upload className={clsx("w-8 h-8 mx-auto mb-2", isDark ? "text-slate-400" : "text-slate-500")} />
        )}
        <div className={clsx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-700")}>
          {disabled ? "正在处理..." : "点击或拖拽上传"}
        </div>
        <div className={clsx("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>
          .jsonl, .json, .log
        </div>
      </label>
    </div>
  );
}
