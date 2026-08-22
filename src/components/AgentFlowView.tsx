/**
 * Agent Flow Dashboard - Canvas 2D based visualization.
 * Uses the new CallGraphBuilder with uuid/parentUuid tree structure
 * for accurate call chain visualization.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ParsedLogData } from '../types/log'
import { AgentCanvasNew } from './AgentFlowView/AgentCanvasNew'
import { TraceInspector } from './AgentFlowView/TraceInspector'
import { buildFlowTimeline, EMPTY_TIMELINE } from './AgentFlowView/simulation/flowTimeline'

type FlowMode = 'canvas' | 'trace'

const MODES: { key: FlowMode; label: string }[] = [
  { key: 'canvas', label: 'Canvas' },
  { key: 'trace', label: 'Trace' },
]

interface AgentFlowViewProps {
  data?: ParsedLogData | null
}

export function AgentFlowView({ data }: AgentFlowViewProps) {
  const [mode, setMode] = useState<FlowMode>('canvas')
  // 两个视图共享的播放位置：画布卸载/暂停时写回，轨迹表点行时写入。
  const [sharedTime, setSharedTime] = useState(0)

  const timeline = useMemo(
    () => (data?.entries?.length ? buildFlowTimeline(data.entries) : EMPTY_TIMELINE),
    [data]
  )

  const handleSeek = useCallback((time: number) => setSharedTime(time), [])

  const modeToggle = (
    <div className="flex items-center gap-1 rounded-full p-0.5" style={{ background: 'rgba(30, 41, 59, 0.72)' }}>
      {MODES.map((option) => (
        <button
          key={option.key}
          onClick={() => setMode(option.key)}
          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          style={{
            background: option.key === mode ? 'rgba(125, 211, 252, 0.2)' : 'transparent',
            color: option.key === mode ? '#e5eefc' : '#60758f',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  if (mode === 'trace') {
    return (
      <TraceInspector
        timeline={timeline}
        currentTime={sharedTime}
        onSeek={handleSeek}
        toolbarExtra={modeToggle}
      />
    )
  }

  return (
    <AgentCanvasNew
      timeline={timeline}
      initialTime={sharedTime}
      onTimeCommit={setSharedTime}
      toolbarExtra={modeToggle}
    />
  )
}
