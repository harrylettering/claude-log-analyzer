/**
 * Agent Flow Dashboard - Canvas 2D based visualization.
 * Uses the new CallGraphBuilder with uuid/parentUuid tree structure
 * for accurate call chain visualization.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Share2, ListTree } from 'lucide-react'
import type { ParsedLogData, SubagentRun, HookExecution } from '../types/log'
import { AgentCanvasNew } from './AgentFlowView/AgentCanvasNew'
import { TraceInspector } from './AgentFlowView/TraceInspector'
import { buildFlowTimeline, EMPTY_TIMELINE } from './AgentFlowView/simulation/flowTimeline'
import type { FlowTimeline } from './AgentFlowView/simulation/flowTimeline'

type FlowMode = 'canvas' | 'trace'

const SEEN_TRACE_KEY = 'agent-flow.seen-trace'

const COLORS = {
  bg: '#07111f',
  tabBar: 'rgba(9, 16, 28, 0.72)',
  border: 'rgba(148, 163, 184, 0.16)',
  text: '#e5eefc',
  textDim: '#8ca2be',
  textMuted: '#60758f',
  accent: '#7dd3fc',
} as const

interface AgentFlowViewProps {
  data?: ParsedLogData | null
}

export function AgentFlowView({ data }: AgentFlowViewProps) {
  const [mode, setMode] = useState<FlowMode>('canvas')
  // 两个视图共享的播放位置：画布卸载/暂停时写回，轨迹表点行时写入。
  const [sharedTime, setSharedTime] = useState(0)
  // Trace 之前很难被发现，所以没点过时在标签上留一个提示点。
  const [hasSeenTrace, setHasSeenTrace] = useState(true)

  useEffect(() => {
    try {
      setHasSeenTrace(localStorage.getItem(SEEN_TRACE_KEY) === '1')
    } catch {
      // 隐私模式下 localStorage 不可用，那就当作已看过，不打扰。
      setHasSeenTrace(true)
    }
  }, [])

  const timeline = useMemo(
    () => (data?.entries?.length ? buildFlowTimeline(data.entries) : EMPTY_TIMELINE),
    [data]
  )

  /**
   * 每个子 agent 的轨迹，用的是同一个构建器。
   *
   * 子 agent 的执行过程和主会话是同一种东西 —— 一样的回合、一样的 hops、一样的耗时口径。
   * 给它单独造一套更弱的表示，只会让展开后的内容和上面那张表对不上。
   */
  const subagentTraces = useMemo(() => {
    const traces = new Map<string, { run: SubagentRun; timeline: FlowTimeline }>()
    for (const run of data?.subagents ?? []) {
      traces.set(run.agentId, {
        run,
        timeline: run.entries.length ? buildFlowTimeline(run.entries) : EMPTY_TIMELINE,
      })
    }
    return traces
  }, [data])

  /** hook 按它包裹的 tool_use id 索引，供轨迹逐回合拆分耗时。 */
  const hooksByToolUse = useMemo(() => {
    const map = new Map<string, HookExecution[]>()
    for (const hook of data?.hooks ?? []) {
      if (!hook.toolUseId) continue
      const existing = map.get(hook.toolUseId)
      if (existing) existing.push(hook)
      else map.set(hook.toolUseId, [hook])
    }
    return map
  }, [data])

  const handleSeek = useCallback((time: number) => setSharedTime(time), [])

  const selectMode = useCallback((next: FlowMode) => {
    setMode(next)
    if (next === 'trace') {
      setHasSeenTrace(true)
      try {
        localStorage.setItem(SEEN_TRACE_KEY, '1')
      } catch {
        // 存不下就算了，提示点只是锦上添花。
      }
    }
  }, [])

  const cycleCount = timeline.cycleTimings.length
  const tabs: { key: FlowMode; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      key: 'canvas',
      label: 'Canvas',
      hint: 'Replay the flow',
      icon: <Share2 className="w-3.5 h-3.5" />,
    },
    {
      key: 'trace',
      label: 'Trace',
      hint: cycleCount > 0 ? `${cycleCount} cycles` : 'Inspect each cycle',
      icon: <ListTree className="w-3.5 h-3.5" />,
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      <div
        className="flex shrink-0 items-end gap-1 border-b px-4 pt-2"
        style={{ background: COLORS.tabBar, borderColor: COLORS.border }}
      >
        {tabs.map((tab) => {
          const active = tab.key === mode
          const showDot = tab.key === 'trace' && !hasSeenTrace
          return (
            <button
              key={tab.key}
              onClick={() => selectMode(tab.key)}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                color: active ? COLORS.text : COLORS.textDim,
                background: active ? COLORS.bg : 'transparent',
                borderBottom: `2px solid ${active ? COLORS.accent : 'transparent'}`,
              }}
            >
              <span style={{ color: active ? COLORS.accent : COLORS.textMuted }}>{tab.icon}</span>
              {tab.label}
              <span className="text-[11px] font-medium" style={{ color: COLORS.textMuted }}>
                {tab.hint}
              </span>
              {showDot && (
                <span
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: COLORS.accent }}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1">
        {mode === 'trace' ? (
          <TraceInspector
            timeline={timeline}
            currentTime={sharedTime}
            onSeek={handleSeek}
            subagentTraces={subagentTraces}
            hooksByToolUse={hooksByToolUse}
          />
        ) : (
          <AgentCanvasNew timeline={timeline} initialTime={sharedTime} onTimeCommit={setSharedTime} />
        )}
      </div>
    </div>
  )
}
