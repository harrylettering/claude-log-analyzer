/**
 * 轨迹检查器：按真实时间铺开整条 trace，逐回合可检视。
 *
 * 和画布共用同一份 FlowTimeline —— 表格里选中的回合，就是画布上播放到的那个回合。
 */

import { useCallback, useMemo, useState } from 'react'
import type { CycleTiming, FlowTimeline } from './simulation/flowTimeline'
import type { FlowCycleKind } from './simulation/canvasBuilder'
import { compactPaths } from './lib/pathText'

type TrackKey = 'input' | 'model' | 'tools'
type DetailTab = 'summary' | 'payload' | 'result' | 'timing'

const COLORS = {
  bg: '#07111f',
  panel: 'rgba(9, 16, 28, 0.9)',
  panelBorder: 'rgba(148, 163, 184, 0.16)',
  text: '#e5eefc',
  textDim: '#8ca2be',
  textMuted: '#60758f',
  rowActive: 'rgba(125, 211, 252, 0.12)',
} as const

const KIND_META: Record<FlowCycleKind, { label: string; color: string; track: TrackKey }> = {
  user_input: { label: 'INPUT', color: '#34d399', track: 'input' },
  thinking: { label: 'THINK', color: '#a78bfa', track: 'model' },
  tool_call: { label: 'TOOL', color: '#f59e0b', track: 'tools' },
  response: { label: 'REPLY', color: '#38bdf8', track: 'model' },
  other: { label: 'EVENT', color: '#64748b', track: 'model' },
}

const TRACKS: { key: TrackKey; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'model', label: 'Model' },
  { key: 'tools', label: 'Tools' },
]


const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'payload', label: 'Payload' },
  { key: 'result', label: 'Result' },
  { key: 'timing', label: 'Timing' },
]

function formatDuration(ms: number | undefined) {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`
  const minutes = Math.floor(ms / 60_000)
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`
}

function formatClock(ms: number | undefined) {
  if (ms === undefined) return '—'
  const date = new Date(ms)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function formatTokens(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value)
}

function truncate(value: string, max: number) {
  const compact = compactPaths(value.replace(/\s+/g, ' ').trim())
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact
}

/**
 * 回合耗时横跨 6 个数量级（100ms 的 Read 到几小时的授权等待），线性画的话
 * 一个回合就吞掉整条轨道。取对数后最慢的也只有最快的几倍宽，顺序仍然保留，
 * 「哪一步慢」依然一眼看得出来。
 */
function durationWeight(ms: number) {
  return Math.log1p(Math.max(0, ms) / 100) + 0.6
}

function toJsonText(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

interface TraceInspectorProps {
  timeline: FlowTimeline
  currentTime: number
  onSeek: (time: number) => void
}

export function TraceInspector({ timeline, currentTime, onSeek }: TraceInspectorProps) {
  // 三个独立开关：展开对话细节、显示工具调用、按耗时宽度布局
  const [expandTurns, setExpandTurns] = useState(true)
  const [showCalls, setShowCalls] = useState(true)
  const [scaleByDuration, setScaleByDuration] = useState(true)
  const [detailTab, setDetailTab] = useState<DetailTab>('summary')
  const [query, setQuery] = useState('')
  const [hoveredCycle, setHoveredCycle] = useState<number | null>(null)

  const { cycleTimings, realStartMs } = timeline

  const activeCycleNumber = useMemo(() => {
    let active = cycleTimings.length > 0 ? cycleTimings[0].cycleNumber : 0
    for (const timing of cycleTimings) {
      if (timing.startTime <= currentTime) active = timing.cycleNumber
      else break
    }
    return active
  }, [cycleTimings, currentTime])

  const selected = cycleTimings.find((timing) => timing.cycleNumber === activeCycleNumber)

  /**
   * Turns 收起时只留用户输入（一次输入 = 一次对话）；展开后才有模型思考、
   * 回复和工具调用，其中工具调用再由 Calls 单独控制。
   */
  const visible = useMemo(
    () =>
      cycleTimings.filter((timing) => {
        const kind = timing.cycle.kind
        if (!expandTurns) return kind === 'user_input'
        if (!showCalls && kind === 'tool_call') return false
        return true
      }),
    [cycleTimings, expandTurns, showCalls]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return visible
    return visible.filter((timing) => {
      const cycle = timing.cycle
      return (
        cycle.title.toLowerCase().includes(needle) ||
        (cycle.toolName ?? '').toLowerCase().includes(needle) ||
        (cycle.result ?? '').toLowerCase().includes(needle)
      )
    })
  }, [visible, query])

  /**
   * 概览条的横轴。两种布局都按时间先后排列，空闲超过 GAP_THRESHOLD_MS 的地方
   * 画一条断口 —— 会话中间可能空置几天（等授权、用户离开），照实拉开的话
   * 几百个回合会挤成一根线。
   *
   * Duration 开：宽度取耗时的对数（见 durationWeight），一眼看出哪一步慢。
   * Duration 关：只按时间点标出位置，所有标记等宽。
   */
  const layout = useMemo(() => {
    const map = new Map<number, { start: number; end: number }>()
    const breaks: number[] = []
    if (realStartMs === undefined) return { map, breaks, total: 0 }

    const GAP_THRESHOLD_MS = 30_000
    const GAP_WIDTH = 1.5
    const POINT_WIDTH = 0.5
    const CYCLE_SPACING = 0.18
    const ordered = [...visible]
      .filter((timing) => timing.startedAtMs !== undefined)
      .sort((a, b) => (a.startedAtMs as number) - (b.startedAtMs as number))

    let cursor = 0
    let previousEnd: number | undefined
    for (const timing of ordered) {
      const start = timing.startedAtMs as number
      const end = Math.max(timing.endedAtMs ?? start, start)
      if (previousEnd !== undefined && start - previousEnd > GAP_THRESHOLD_MS) {
        breaks.push(cursor)
        cursor += GAP_WIDTH
      }
      const width = scaleByDuration ? durationWeight(end - start) : POINT_WIDTH
      map.set(timing.cycleNumber, { start: cursor, end: cursor + width })
      cursor += width + CYCLE_SPACING
      previousEnd = end
    }
    return { map, breaks, total: cursor }
  }, [visible, realStartMs, scaleByDuration])

  const positionOf = useCallback(
    (timing: CycleTiming) => {
      if (layout.total > 0) {
        const span = layout.map.get(timing.cycleNumber)
        if (span) {
          return {
            left: (span.start / layout.total) * 100,
            // 下限压到很小：几百个回合挤在一条轨道上时，过大的下限会把所有色块
            // 拉成同宽，耗时差异就看不见了。细窄本身就是「这一步很快」的信息。
            width: Math.max(((span.end - span.start) / layout.total) * 100, 0.08),
          }
        }
      }
      const slot = visible.length > 0 ? 100 / visible.length : 100
      const index = visible.findIndex((item) => item.cycleNumber === timing.cycleNumber)
      return { left: Math.max(0, index) * slot, width: Math.max(slot * 0.72, 0.35) }
    },
    [layout, visible]
  )

  /**
   * 用中位数而不是总和：耗时是 tool_use 到 tool_result 的墙钟时间，
   * 包含等待授权和用户离开的空闲，求和会被几个小时级的空档带偏。
   */
  const medianToolMs = useMemo(() => {
    const durations = cycleTimings
      .filter((timing) => timing.cycle.kind === 'tool_call' && timing.durationMs !== undefined)
      .map((timing) => timing.durationMs as number)
      .sort((a, b) => a - b)
    return durations.length > 0 ? durations[Math.floor(durations.length / 2)] : undefined
  }, [cycleTimings])
  const turnCount = cycleTimings.filter((timing) => timing.cycle.kind === 'user_input').length
  const callCount = cycleTimings.filter((timing) => timing.cycle.kind === 'tool_call').length

  const hovered = hoveredCycle !== null ? cycleTimings.find((t) => t.cycleNumber === hoveredCycle) : undefined

  if (cycleTimings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ background: COLORS.bg, color: COLORS.textMuted }}>
        No cycles in this trace yet.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center gap-3 border-b px-4"
        style={{ height: 54, background: COLORS.panel, borderColor: COLORS.panelBorder }}
      >
        <div className="ml-2 flex items-center gap-2">
          <ToggleButton
            label="Turns"
            active={expandTurns}
            onClick={() => setExpandTurns((prev) => !prev)}
            title={expandTurns ? 'Collapse to user turns only' : 'Expand full conversation detail'}
          />
          <ToggleButton
            label="Calls"
            active={showCalls}
            disabled={!expandTurns}
            onClick={() => setShowCalls((prev) => !prev)}
            title={showCalls ? 'Hide tool calls' : 'Show tool calls'}
          />
          <ToggleButton
            label="Duration"
            active={scaleByDuration}
            onClick={() => setScaleByDuration((prev) => !prev)}
            title={scaleByDuration ? 'Switch to time-point markers' : 'Scale bar width by duration'}
          />
        </div>
        <div className="ml-2 flex items-center gap-3 text-[11px] tabular-nums" style={{ color: COLORS.textMuted }}>
          <span>{turnCount} turns</span>
          <span>{callCount} calls</span>
          <span>median {formatDuration(medianToolMs)}</span>
          {scaleByDuration && (
            <span title="Bar width is log-scaled so slow and fast steps stay comparable">log scale</span>
          )}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cycles…"
          className="ml-auto w-56 rounded-full px-3 py-1.5 text-xs outline-none"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: `1px solid ${COLORS.panelBorder}`,
            color: COLORS.text,
          }}
        />
      </div>

      {/* 三轨概览条 */}
      <div
        className="relative border-b px-4 py-3"
        style={{ borderColor: COLORS.panelBorder, background: 'rgba(9, 16, 28, 0.55)' }}
        onMouseLeave={() => setHoveredCycle(null)}
      >
        {TRACKS.filter((track) => visible.some((timing) => KIND_META[timing.cycle.kind].track === track.key)).map((track) => (
          <div key={track.key} className="mb-1.5 flex items-center gap-3 last:mb-0">
            <span className="w-12 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textMuted }}>
              {track.label}
            </span>
            <div className="relative h-4 flex-1 rounded" style={{ background: 'rgba(148, 163, 184, 0.06)' }}>
              {layout.total > 0 &&
                layout.breaks.map((position) => (
                  <span
                    key={position}
                    title="Idle gap compressed"
                    className="absolute top-0 h-full border-l border-dashed"
                    style={{ left: `${(position / layout.total) * 100}%`, borderColor: 'rgba(148, 163, 184, 0.35)' }}
                  />
                ))}
              {visible
                .filter((timing) => KIND_META[timing.cycle.kind].track === track.key)
                .map((timing) => {
                  const meta = KIND_META[timing.cycle.kind]
                  const { left, width } = positionOf(timing)
                  const isActive = timing.cycleNumber === activeCycleNumber
                  const color = timing.cycle.isError ? '#ef4444' : meta.color
                  return (
                    <button
                      key={timing.cycle.id}
                      onClick={() => onSeek(timing.startTime)}
                      onMouseEnter={() => setHoveredCycle(timing.cycleNumber)}
                      title={`Cycle ${timing.cycleNumber} · ${truncate(timing.cycle.title, 60)}`}
                      className="absolute top-0.5 h-3 rounded-sm transition-opacity"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 2,
                        background: color,
                        opacity: isActive ? 1 : hoveredCycle === timing.cycleNumber ? 0.9 : 0.5,
                        outline: isActive ? `1px solid ${COLORS.text}` : 'none',
                      }}
                    />
                  )
                })}
            </div>
          </div>
        ))}

        {hovered && (
          <div
            className="pointer-events-none absolute left-16 top-1 z-20 rounded-lg border px-2.5 py-1.5 text-[11px]"
            style={{ background: 'rgba(9, 16, 28, 0.96)', borderColor: COLORS.panelBorder, color: COLORS.textDim }}
          >
            <div className="font-semibold" style={{ color: KIND_META[hovered.cycle.kind].color }}>
              {KIND_META[hovered.cycle.kind].label} · Cycle {hovered.cycleNumber}
            </div>
            <div style={{ color: COLORS.text }}>{truncate(hovered.cycle.title, 64)}</div>
            <div className="tabular-nums">
              {formatClock(hovered.startedAtMs)} → {formatClock(hovered.endedAtMs)} · {formatDuration(hovered.durationMs)}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 事件表 */}
        <div className="min-w-0 flex-1 overflow-auto">
          {filtered.map((timing) => {
            const meta = KIND_META[timing.cycle.kind]
            const isActive = timing.cycleNumber === activeCycleNumber
            return (
              <button
                key={timing.cycle.id}
                onClick={() => onSeek(timing.startTime)}
                className="flex w-full items-center gap-3 border-b px-4 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.03]"
                style={{
                  borderColor: 'rgba(148, 163, 184, 0.07)',
                  background: isActive ? COLORS.rowActive : 'transparent',
                }}
              >
                <span className="w-10 shrink-0 text-right tabular-nums" style={{ color: COLORS.textMuted }}>
                  {timing.cycleNumber}
                </span>
                <span
                  className="w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-bold tracking-wider"
                  style={{ background: `${meta.color}22`, color: meta.color }}
                >
                  {meta.label}
                </span>
                <span className="w-24 shrink-0 truncate font-mono" style={{ color: COLORS.text }}>
                  {timing.cycle.toolName ?? ''}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.textDim }}>
                  {truncate(timing.cycle.title, 110)}
                </span>
                {timing.cycle.result && (
                  <span className="hidden min-w-0 flex-1 truncate lg:block" style={{ color: COLORS.textMuted }}>
                    → {truncate(timing.cycle.result, 90)}
                  </span>
                )}
                <span className="w-16 shrink-0 text-right tabular-nums" style={{ color: timing.cycle.isError ? '#f87171' : COLORS.textMuted }}>
                  {timing.cycle.isError
                    ? 'error'
                    : timing.cycle.kind === 'tool_call'
                      ? formatDuration(timing.durationMs)
                      : ''}
                </span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: COLORS.textMuted }}>
              No cycles match “{query}”.
            </div>
          )}
        </div>

        {/* 详情面板 */}
        <div className="flex w-[380px] shrink-0 flex-col border-l" style={{ borderColor: COLORS.panelBorder }}>
          {selected ? (
            <>
              <div className="border-b px-4 py-3" style={{ borderColor: COLORS.panelBorder }}>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                    style={{
                      background: `${KIND_META[selected.cycle.kind].color}22`,
                      color: KIND_META[selected.cycle.kind].color,
                    }}
                  >
                    {KIND_META[selected.cycle.kind].label}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: COLORS.textDim }}>
                    Cycle {selected.cycleNumber} · {selected.cycle.hops.length} hops
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold leading-5" style={{ color: COLORS.text }}>
                  {truncate(selected.cycle.title, 120)}
                </div>
              </div>

              <div className="flex gap-1 border-b px-3" style={{ borderColor: COLORS.panelBorder }}>
                {DETAIL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className="px-2.5 py-2 text-xs font-medium transition-colors"
                    style={{
                      color: tab.key === detailTab ? COLORS.text : COLORS.textMuted,
                      borderBottom: `2px solid ${tab.key === detailTab ? '#7dd3fc' : 'transparent'}`,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-xs" style={{ color: COLORS.textDim }}>
                {detailTab === 'summary' && (
                  <div className="space-y-2">
                    <DetailRow label="Status" value={selected.cycle.isError ? 'Error' : 'Completed'} />
                    <DetailRow label="Kind" value={selected.cycle.kind} />
                    {selected.cycle.toolName && <DetailRow label="Tool" value={selected.cycle.toolName} />}
                    {selected.cycle.model && <DetailRow label="Model" value={selected.cycle.model} />}
                    {selected.cycle.effort && <DetailRow label="Effort" value={selected.cycle.effort} />}
                    {selected.cycle.usage && (
                      <>
                        <DetailRow
                          label="Tokens"
                          value={`${formatTokens(selected.cycle.usage.inputTokens)} in · ${formatTokens(
                            selected.cycle.usage.outputTokens
                          )} out`}
                        />
                        <DetailRow
                          label="Cache"
                          value={`${formatTokens(selected.cycle.usage.cacheReadTokens)} read · ${formatTokens(
                            selected.cycle.usage.cacheCreationTokens
                          )} written`}
                        />
                      </>
                    )}
                    <div className="pt-2">
                      <div className="mb-1.5 text-[10px] font-semibold tracking-wider" style={{ color: COLORS.textMuted }}>
                        HOPS
                      </div>
                      <div className="space-y-1">
                        {selected.cycle.hops.map((hop, index) => (
                          <div key={hop.id} className="flex items-baseline gap-2">
                            <span className="w-4 tabular-nums" style={{ color: COLORS.textMuted }}>
                              {index + 1}
                            </span>
                            <span style={{ color: COLORS.text }}>{hop.linkType}</span>
                            <span className="truncate" style={{ color: COLORS.textMuted }}>
                              {hop.source} → {hop.target}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'payload' && <CodeBlock text={toJsonText(selected.cycle.payload)} empty="No payload recorded." />}
                {detailTab === 'result' && <CodeBlock text={selected.cycle.result ?? ''} empty="No result recorded." />}

                {detailTab === 'timing' && (
                  <div className="space-y-2">
                    <DetailRow label="Started" value={formatClock(selected.startedAtMs)} />
                    <DetailRow label="Ended" value={formatClock(selected.endedAtMs)} />
                    <DetailRow label="Duration" value={formatDuration(selected.durationMs)} />
                    <DetailRow label="Playback" value={`${selected.startTime.toFixed(1)}s`} />
                    <DetailRow label="Source" value="Session timestamps" />
                    {selected.cycle.kind === 'tool_call' && (
                      <div className="pt-1 text-[11px] leading-4" style={{ color: COLORS.textMuted }}>
                        Wall clock from request to result — includes any wait for permission or user input.
                      </div>
                    )}
                    {selected.cycle.requestId && <DetailRow label="Request" value={selected.cycle.requestId} />}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs" style={{ color: COLORS.textMuted }}>
              Select a cycle to inspect it.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleButton({
  label,
  active,
  disabled,
  onClick,
  title,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active && !disabled ? 'rgba(125, 211, 252, 0.18)' : 'rgba(30, 41, 59, 0.72)',
        color: active && !disabled ? COLORS.text : COLORS.textMuted,
        border: `1px solid ${active && !disabled ? 'rgba(125, 211, 252, 0.28)' : 'transparent'}`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active && !disabled ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)' }}
      />
      {label}
    </button>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-20 shrink-0 text-[11px]" style={{ color: COLORS.textMuted }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words" style={{ color: COLORS.text }}>
        {value}
      </span>
    </div>
  )
}

function CodeBlock({ text, empty }: { text: string; empty: string }) {
  if (!text) {
    return <div style={{ color: COLORS.textMuted }}>{empty}</div>
  }
  return (
    <pre
      className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg p-2.5 font-mono text-[11px] leading-relaxed"
      style={{ background: 'rgba(15, 23, 42, 0.6)', color: COLORS.text }}
    >
      {text.length > 8000 ? `${text.slice(0, 8000)}\n\n… truncated` : text}
    </pre>
  )
}
