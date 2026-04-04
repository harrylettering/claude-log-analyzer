import { User, Bot, Settings, FileText, Clock } from 'lucide-react';
import type { LogEntry } from '../types/log';
import { UI_COLORS, MESSAGE_PREVIEW_LENGTH } from '../constants';

export function getEntryIcon(type: string) {
  switch (type) {
    case 'user':
      return <User className="w-4 h-4" />;
    case 'assistant':
      return <Bot className="w-4 h-4" />;
    case 'system':
      return <Settings className="w-4 h-4" />;
    case 'file-history-snapshot':
      return <FileText className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

export function getEntryColor(type: string) {
  switch (type) {
    case 'user':
      return UI_COLORS.user.dot;
    case 'assistant':
      return UI_COLORS.assistant.dot;
    case 'system':
      return UI_COLORS.system.dot;
    case 'file-history-snapshot':
      return UI_COLORS.fileHistory.dot;
    default:
      return UI_COLORS.default.dot;
  }
}

export function getEntryBg(type: string) {
  switch (type) {
    case 'user':
      return `${UI_COLORS.user.bg} ${UI_COLORS.user.border}`;
    case 'assistant':
      return `${UI_COLORS.assistant.bg} ${UI_COLORS.assistant.border}`;
    case 'system':
      return `${UI_COLORS.system.bg} ${UI_COLORS.system.border}`;
    case 'file-history-snapshot':
      return `${UI_COLORS.fileHistory.bg} ${UI_COLORS.fileHistory.border}`;
    default:
      return `${UI_COLORS.default.bg} ${UI_COLORS.default.border}`;
  }
}

export function getMessagePreview(entry: LogEntry): string {
  if (entry.type === 'user' || entry.type === 'assistant') {
    const msg = entry.message;
    if (msg?.content) {
      if (typeof msg.content === 'string') {
        return msg.content.substring(0, MESSAGE_PREVIEW_LENGTH);
      }
      if (Array.isArray(msg.content)) {
        const first = msg.content[0];
        if (first) {
          if (first.type === 'text' && first.text) {
            return first.text.substring(0, MESSAGE_PREVIEW_LENGTH);
          }
          if (first.type === 'tool_use') {
            return `工具调用: ${first.name}`;
          }
          if (first.type === 'tool_result') {
            return '工具结果';
          }
          if (first.type === 'thinking') {
            return '思考中...';
          }
        }
      }
    }
  }
  if (entry.type === 'file-history-snapshot') {
    return '文件历史快照';
  }
  if (entry.type === 'system' && entry.subtype === 'turn_duration') {
    return `轮次时长: ${entry.durationMs}ms`;
  }
  return entry.type;
}
