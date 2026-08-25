/**
 * 一次会话的 token 用量汇总。
 *
 * 只报 token，不折算金额 —— 价目随时会变，而 trace 可能是任意时期录的，
 * 折算出来的数字看着精确、其实是估算。token 是日志里的事实。
 */

export type TokenTotals = {
  inputTokens: number
  outputTokens: number
  /** 命中缓存、按较低费率计费的输入。通常是这几项里最大的。 */
  cacheReadTokens: number
  /** 写入缓存的输入。 */
  cacheWriteTokens: number
}

export const EMPTY_TOKEN_TOTALS: TokenTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

export function addTokenTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

export function sumTokens(totals: TokenTotals): number {
  return totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}
