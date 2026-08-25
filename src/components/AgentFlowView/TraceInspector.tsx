/**
 * 轨迹检查器：按真实时间铺开整条 trace，逐回合可检视。
 *
 * 和画布共用同一份 FlowTimeline —— 表格里选中的回合，就是画布上播放到的那个回合。
 */

import { useCallback, useMemo, useState } from 'react'
import type { CycleTiming, FlowTimeline } from './simulation/flowTimeline'
import type { FlowCycleKind } from './simulation/canvasBuilder'
import type { SubagentRun } from '../../types/log'
import { compactPaths } from './lib/pathText'
import {
  addTokenTotals,
  EMPTY_TOKEN_TOTALS,
  formatTokens,
  sumTokens,
} from './lib/tokenUsage'

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

export interface SubagentTrace {
  run: SubagentRun
  timeline: FlowTimeline
}

interface TraceInspectorProps {
  timeline: FlowTimeline
  currentTime: number
  onSeek: (time: number) => void
  /** 每个子 agent 自己的一条轨迹，按 agentId 索引。 */
  subagentTraces?: Map<string, SubagentTrace>
}

export function TraceInspector({ timeline, currentTime, onSeek, subagentTraces }: TraceInspectorProps) {
  // 展开了执行轨迹的派发回合。子 agent 通常只有一两个，默认收起，
  // 但一旦展开就该看到全部 —— 派发这一行本身没有信息量，信息全在它下面。
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())
  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }, [])
  // 三个独立开关：展开对话细节、显示工具调用、按耗时宽度布局
  const [expandTurns, setExpandTurns] = useState(true)
  const [showCalls, setShowCalls] = useState(true)
  const [scaleByDuration, setScaleByDuration] = useState(true)
  const [detailTab, setDetailTab] = useState<DetailTab>('summary')
  const [query, setQuery] = useState('')
  const [hoveredCycle, setHoveredCycle] = useState<number | null>(null)

  const { cycleTimings, realStartMs } = timeline

  /**
   * 跳的两端在数据里是内部 entityId（user=0 / main agent=1 / assistant=2，
   * 工具则是 tool_use_id），直接显示读不懂，换成节点名。
   */
  const entityName = useCallback(
    (entityId: string) => {
      const node = timeline.nodes.get(entityId)
      return node ? node.displayName.replace(/^tool:/i, '') : entityId
    },
    [timeline]
  )

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
   * 子 agent 里被点开的那个回合。
   *
   * 主轨迹的选中态是从播放位置推出来的，子 agent 的回合不在那条时间轴上，
   * 所以它需要自己的一份选中态；点主轨迹任何一行都会把它清掉，否则右侧面板会
   * 停在一个和左边高亮行无关的回合上。
   */
  const [selectedSub, setSelectedSub] = useState<{ agentId: string; cycleId: string } | null>(null)
  const subTrace = selectedSub ? subagentTraces?.get(selectedSub.agentId) : undefined
  const subTiming = selectedSub
    ? subTrace?.timeline.cycleTimings.find((timing) => timing.cycle.id === selectedSub.cycleId)
    : undefined

  const detailTiming = subTiming ?? selected
  const detailWithinRun = subTiming ? subTrace?.run : undefined
  const detailDispatchedTrace = !subTiming && selected?.cycle.subagentId
    ? subagentTraces?.get(selected.cycle.subagentId)
    : undefined

  const subEntityName = useCallback(
    (entityId: string) => {
      const node = subTrace?.timeline.nodes.get(entityId)
      if (!node) return entityId
      // 子 agent 的图是用同一个构建器造的，它的编排节点也叫 "main agent" ——
      // 但在这条轨迹里那个编排者就是子 agent 自己。照搬会让人读成
      // 「主 agent 发的这次调用」，所以换成这个 agent 的名字。
      if (node.entityType === 'main_agent') return subTrace?.run.agentType ?? 'subagent'
      return node.displayName.replace(/^tool:/i, '')
    },
    [subTrace]
  )

  const selectMainCycle = useCallback(
    (time: number) => {
      setSelectedSub(null)
      onSeek(time)
    },
    [onSeek]
  )

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
   * 全会话 token 汇总。
   *
   * 用量按 API 响应计，去重发生在建图层（见 CanvasBuilder.takeUsageOnce）——
   * 一次响应会拆成多条 entry 且各自重复带同一份 usage。所以这里拿到的每一份
   * 都已经是唯一的，直接累加即可。
   *
   * 折叠出时间轴的事件也要算：如果一次响应的用量恰好落在被折叠的那条 entry 上
   * （比如「推理 + 工具调用」里推理排在前面），漏掉它就会少算这一整次响应。
   */
  const sessionTokens = useMemo(() => {
    let totals = EMPTY_TOKEN_TOTALS
    for (const timing of cycleTimings) {
      if (timing.cycle.usage) totals = addTokenTotals(totals, timing.cycle.usage)
    }
    for (const event of timeline.systemEvents) {
      if (event.usage) totals = addTokenTotals(totals, event.usage)
    }
    return totals
  }, [cycleTimings, timeline.systemEvents])

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
          {sumTokens(sessionTokens) > 0 && (
            <span
              title={
                `Input ${formatTokens(sessionTokens.inputTokens)} · ` +
                `output ${formatTokens(sessionTokens.outputTokens)} · ` +
                `cache read ${formatTokens(sessionTokens.cacheReadTokens)} · ` +
                `cache written ${formatTokens(sessionTokens.cacheWriteTokens)}`
              }
              style={{ color: COLORS.textDim }}
            >
              {formatTokens(sumTokens(sessionTokens))} tokens
            </span>
          )}
          {sessionTokens.outputTokens > 0 && (
            <span title="Tokens the model generated">{formatTokens(sessionTokens.outputTokens)} out</span>
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
                      onClick={() => selectMainCycle(timing.startTime)}
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
            const agentId = timing.cycle.subagentId
            const trace = agentId ? subagentTraces?.get(agentId) : undefined
            const isExpanded = Boolean(agentId && expandedAgents.has(agentId))
            return (
              <div key={timing.cycle.id}>
                {/* 展开钮和行是同级的两个按钮：一个 button 不能套另一个 button。 */}
                <div
                  className="flex w-full items-stretch border-b transition-colors hover:bg-white/[0.03]"
                  style={{
                    borderColor: 'rgba(148, 163, 184, 0.07)',
                    background: isActive ? COLORS.rowActive : 'transparent',
                  }}
                >
                  {/* 一千多行里只有一两行有子 agent，一个灰色小三角根本不会被注意到 ——
                      所以这里做成有底色有边框的实心控件，收起时尤其要跳出来。 */}
                  {agentId ? (
                    <span className="flex w-8 shrink-0 items-center justify-center">
                      <button
                        onClick={() => toggleAgent(agentId)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse the agent trace' : 'Expand the agent trace'}
                        title={isExpanded ? 'Collapse the agent trace' : 'Expand the agent trace'}
                        className="flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold leading-none transition-all hover:scale-110"
                        style={{
                          borderColor: isExpanded ? '#a78bfa' : 'rgba(167, 139, 250, 0.55)',
                          background: isExpanded ? '#a78bfa' : 'rgba(167, 139, 250, 0.16)',
                          color: isExpanded ? '#0b1220' : '#c4b5fd',
                          boxShadow: isExpanded ? 'none' : '0 0 0 3px rgba(167, 139, 250, 0.12)',
                        }}
                      >
                        {isExpanded ? '\u2212' : '+'}
                      </button>
                    </span>
                  ) : (
                    <span className="w-8 shrink-0" aria-hidden />
                  )}
                  <button
                    onClick={() => selectMainCycle(timing.startTime)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-1.5 pr-4 text-left text-xs"
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
                    {agentId && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                        style={{ background: 'rgba(167, 139, 250, 0.16)', color: '#c4b5fd' }}
                      >
                        {trace?.run.entries.length
                          ? `AGENT · ${trace.run.entries.length}`
                          : 'AGENT'}
                      </span>
                    )}
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
                </div>

                {isExpanded && agentId && (
                  <SubagentTraceRows
                    agentId={agentId}
                    trace={trace}
                    selectedCycleId={selectedSub?.agentId === agentId ? selectedSub.cycleId : undefined}
                    onSelectCycle={(cycleId) => setSelectedSub({ agentId, cycleId })}
                  />
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: COLORS.textMuted }}>
              No cycles match “{query}”.
            </div>
          )}
        </div>

        {/* 详情面板。主轨迹和子 agent 轨迹走的是同一个组件 —— 点开子 agent 的一行，
            看到的字段、标签页、hops 都和主 agent 的一模一样。 */}
        <div className="flex w-[380px] shrink-0 flex-col border-l" style={{ borderColor: COLORS.panelBorder }}>
          {detailTiming ? (
            <CycleDetail
              timing={detailTiming}
              detailTab={detailTab}
              onSelectTab={setDetailTab}
              dispatchedTrace={detailDispatchedTrace}
              withinRun={detailWithinRun}
              resolveEntity={subTiming ? subEntityName : entityName}
            />
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

/**
 * 一个回合的详情。
 *
 * 主轨迹和子 agent 的轨迹共用它 —— 两边的回合本来就是同一种东西（同一个构建器
 * 产出的 FlowCycle），详情如果各写一份，点开子 agent 的行看到的字段迟早会和上面
 * 那张表对不上。
 */
function CycleDetail({
  timing,
  detailTab,
  onSelectTab,
  dispatchedTrace,
  withinRun,
  resolveEntity,
}: {
  timing: CycleTiming
  detailTab: DetailTab
  onSelectTab: (tab: DetailTab) => void
  /** 这个回合派发出去的子 agent（如果它是一次派发）。 */
  dispatchedTrace?: SubagentTrace
  /** 这个回合本身属于哪个子 agent（如果它来自嵌套轨迹）。 */
  withinRun?: SubagentRun
  /**
   * 把 hop 两端的内部 entityId 换成节点名。
   * 必须跟着回合所属的那条轨迹走 —— 子 agent 有自己的一套节点，拿主轨迹去查会查不到。
   */
  resolveEntity: (entityId: string) => string
}) {
  return (
    <>
      {withinRun && (
        <div
          className="border-b px-4 py-2 text-[11px]"
          style={{ borderColor: COLORS.panelBorder, background: 'rgba(167, 139, 250, 0.08)' }}
        >
          <span className="font-semibold" style={{ color: '#c4b5fd' }}>
            Inside subagent
          </span>{' '}
          <span style={{ color: COLORS.textDim }}>{withinRun.agentType ?? withinRun.agentId}</span>
        </div>
      )}

            <div className="border-b px-4 py-3" style={{ borderColor: COLORS.panelBorder }}>
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                  style={{
                    background: `${KIND_META[timing.cycle.kind].color}22`,
                    color: KIND_META[timing.cycle.kind].color,
                  }}
                >
                  {KIND_META[timing.cycle.kind].label}
                </span>
                <span className="text-[11px] font-semibold" style={{ color: COLORS.textDim }}>
                  Cycle {timing.cycleNumber} · {timing.cycle.hops.length} hops
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold leading-5" style={{ color: COLORS.text }}>
                {truncate(timing.cycle.title, 120)}
              </div>
            </div>

            <div className="flex gap-1 border-b px-3" style={{ borderColor: COLORS.panelBorder }}>
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => onSelectTab(tab.key)}
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
                  <DetailRow label="Status" value={timing.cycle.isError ? 'Error' : 'Completed'} />
                  <DetailRow label="Kind" value={timing.cycle.kind} />
                  {timing.cycle.toolName && <DetailRow label="Tool" value={timing.cycle.toolName} />}
                  {timing.cycle.model && <DetailRow label="Model" value={timing.cycle.model} />}
                  {/* 派发回合本身几乎没有内容 —— 它的结果只是「agent 已启动」。
                      真正发生了什么在子 agent 那边，这里至少要指出去。 */}
                  {dispatchedTrace && (
                    <>
                      <DetailRow label="Agent" value={dispatchedTrace.run.agentType ?? dispatchedTrace.run.agentId} />
                      <DetailRow label="Agent status" value={dispatchedTrace.run.status} />
                      {dispatchedTrace.run.model && (
                        <DetailRow label="Agent model" value={dispatchedTrace.run.model} />
                      )}
                      <DetailRow label="Agent ran" value={formatDuration(dispatchedTrace.run.durationMs)} />
                      <DetailRow
                        label="Agent cost"
                        value={`${formatTokens(dispatchedTrace.run.tokens.totalTokens)} · ${
                          dispatchedTrace.run.toolCalls.length
                        } calls`}
                      />
                      <div className="pt-1 text-[11px] leading-4" style={{ color: COLORS.textMuted }}>
                        This cycle only launched the agent. Expand its row in the table to see what it did.
                      </div>
                    </>
                  )}
                  {timing.cycle.effort && <DetailRow label="Effort" value={timing.cycle.effort} />}
                  {timing.cycle.usage && (
                    <>
                      <DetailRow
                        label="Tokens"
                        value={`${formatTokens(timing.cycle.usage.inputTokens)} in · ${formatTokens(
                          timing.cycle.usage.outputTokens
                        )} out`}
                      />
                      <DetailRow
                        label="Cache"
                        value={`${formatTokens(timing.cycle.usage.cacheReadTokens)} read · ${formatTokens(
                          timing.cycle.usage.cacheWriteTokens
                        )} written`}
                      />
                    </>
                  )}
                  <div className="pt-2">
                    <div className="mb-1.5 text-[10px] font-semibold tracking-wider" style={{ color: COLORS.textMuted }}>
                      HOPS
                    </div>
                    <div className="space-y-1">
                      {timing.cycle.hops.map((hop, index) => (
                        <div key={hop.id} className="flex items-baseline gap-2">
                          <span className="w-4 tabular-nums" style={{ color: COLORS.textMuted }}>
                            {index + 1}
                          </span>
                          <span style={{ color: COLORS.text }}>{hop.linkType}</span>
                          <span className="truncate" style={{ color: COLORS.textMuted }}>
                            {resolveEntity(hop.source)} → {resolveEntity(hop.target)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'payload' && <CodeBlock text={toJsonText(timing.cycle.payload)} empty="No payload recorded." />}
              {detailTab === 'result' && <CodeBlock text={timing.cycle.result ?? ''} empty="No result recorded." />}

              {detailTab === 'timing' && (
                <div className="space-y-2">
                  <DetailRow label="Started" value={formatClock(timing.startedAtMs)} />
                  <DetailRow label="Ended" value={formatClock(timing.endedAtMs)} />
                  <DetailRow label="Duration" value={formatDuration(timing.durationMs)} />
                  {/* 播放位置只对主轨迹成立。子 agent 的回合在画布的时间轴上没有位置，
                      把它自己那条轨迹的秒数显示成 Playback 会让人以为可以跳过去。 */}
                  {!withinRun && <DetailRow label="Playback" value={`${timing.startTime.toFixed(1)}s`} />}
                  <DetailRow
                    label="Source"
                    value={withinRun ? 'Subagent transcript timestamps' : 'Session timestamps'}
                  />
                  {timing.cycle.kind === 'tool_call' && (
                    <div className="pt-1 text-[11px] leading-4" style={{ color: COLORS.textMuted }}>
                      Wall clock from request to result — includes any wait for permission or user input.
                    </div>
                  )}
                  {timing.cycle.requestId && <DetailRow label="Request" value={timing.cycle.requestId} />}
                </div>
              )}
            </div>
          
    </>
  )
}

/**
 * 派发回合展开后的内容：子 agent 自己那条轨迹。
 *
 * 用的是同一套回合模型和同样的列，只是缩进。点一行会把右侧详情面板切到那个回合，
 * 走的是主轨迹用的同一个组件，所以看到的字段完全一致。
 *
 * 但它不跳播放位置 —— 画布播的是主会话的时间轴，子 agent 的回合在上面没有位置，
 * 给一个会落到别处的跳转比不给更糟。
 */
function SubagentTraceRows({
  agentId,
  trace,
  selectedCycleId,
  onSelectCycle,
}: {
  agentId: string
  trace?: SubagentTrace
  selectedCycleId?: string
  onSelectCycle: (cycleId: string) => void
}) {
  const indent = { borderColor: 'rgba(148, 163, 184, 0.07)', background: 'rgba(167, 139, 250, 0.04)' }

  // 「日志没加载」和「什么都没做」在界面上长得一模一样，必须分开说：
  // 离线上传的会话文件里有派发记录，却永远不会有子 agent 的那份日志。
  if (!trace || !trace.run.hasTranscript) {
    return (
      <div className="border-b px-4 py-3 pl-14 text-[11px] leading-5" style={{ ...indent, color: COLORS.textMuted }}>
        No transcript loaded for <span className="font-mono" style={{ color: COLORS.textDim }}>{agentId}</span>. The
        dispatch is recorded here, but the agent writes its own transcript beside the session file — watching the
        session through the local server picks it up; an uploaded session file alone does not.
      </div>
    )
  }

  const { run, timeline } = trace
  const timings = timeline.cycleTimings

  return (
    <div className="border-b" style={indent}>
      {/* 这条 agent 是什么、跑了多久、花了多少 —— 展开后第一眼该看到的。 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 pl-14 text-[11px]" style={{ color: COLORS.textMuted }}>
        <span className="font-semibold" style={{ color: '#c4b5fd' }}>
          {run.agentType ?? 'agent'}
        </span>
        {run.model && <span className="font-mono">{run.model}</span>}
        <span>{formatDuration(run.durationMs)}</span>
        <span>{formatTokens(run.tokens.totalTokens)} tokens</span>
        <span>{run.toolCalls.length} tool calls</span>
        {run.errorCount > 0 && <span style={{ color: '#f87171' }}>{run.errorCount} errors</span>}
        <span style={{ color: run.status === 'error' ? '#f87171' : COLORS.textMuted }}>{run.status}</span>
      </div>

      {timings.length === 0 ? (
        <div className="px-4 py-2 pl-14 text-[11px]" style={{ color: COLORS.textMuted }}>
          The transcript holds {run.entries.length} entries but no cycles — nothing the agent did was recorded as
          a step.
        </div>
      ) : (
        timings.map((timing) => {
          const meta = KIND_META[timing.cycle.kind]
          return (
            <button
              key={timing.cycle.id}
              onClick={() => onSelectCycle(timing.cycle.id)}
              className="flex w-full items-center gap-3 py-1 pl-14 pr-4 text-left text-[11px] transition-colors hover:bg-white/[0.04]"
              style={{
                color: COLORS.textDim,
                background: timing.cycle.id === selectedCycleId ? 'rgba(167, 139, 250, 0.16)' : 'transparent',
              }}
            >
              <span className="w-6 shrink-0 text-right tabular-nums" style={{ color: COLORS.textMuted }}>
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
              <span className="min-w-0 flex-1 truncate">{truncate(timing.cycle.title, 100)}</span>
              {timing.cycle.result && (
                <span className="hidden min-w-0 flex-1 truncate lg:block" style={{ color: COLORS.textMuted }}>
                  → {truncate(timing.cycle.result, 80)}
                </span>
              )}
              <span
                className="w-16 shrink-0 text-right tabular-nums"
                style={{ color: timing.cycle.isError ? '#f87171' : COLORS.textMuted }}
              >
                {timing.cycle.isError ? 'error' : formatDuration(timing.durationMs)}
              </span>
            </button>
          )
        })
      )}

      {run.resultText && (
        <div className="px-4 py-2 pl-14 text-[11px] leading-5" style={{ color: COLORS.textMuted }}>
          <span className="font-semibold" style={{ color: COLORS.textDim }}>Returned </span>
          <span className="font-mono">{truncate(run.resultText, 240)}</span>
        </div>
      )}
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
