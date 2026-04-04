// Token 相关常量
export const MAX_TOKEN_VALUE = 10_000_000;
export const MESSAGE_PREVIEW_LENGTH = 100;
export const CONVERSATION_PREVIEW_LENGTH = 80;

// 定价常量（Claude 3.5 Sonnet）
export const PRICING = {
  INPUT_PER_MTOK: 3,
  OUTPUT_PER_MTOK: 15,
} as const;

// UI 相关常量
export const UI_COLORS = {
  user: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    dot: 'bg-blue-500',
    text: 'text-blue-400',
  },
  assistant: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    dot: 'bg-purple-500',
    text: 'text-purple-400',
  },
  system: {
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    dot: 'bg-gray-500',
    text: 'text-gray-400',
  },
  fileHistory: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
    text: 'text-amber-400',
  },
  default: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500',
    text: 'text-slate-400',
  },
} as const;

// 性能阈值
export const PERFORMANCE_THRESHOLD_MULTIPLIER = 2;

// 格式化常量
export const TOKEN_FORMATTING = {
  MILLION: 1_000_000,
  THOUSAND: 1_000,
} as const;

export const TIME_FORMATTING = {
  SECOND_MS: 1000,
  MINUTE_MS: 60_000,
} as const;
