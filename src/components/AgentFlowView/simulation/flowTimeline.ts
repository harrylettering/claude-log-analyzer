/**
 * 回合时间轴：把 CanvasBuilder 产出的回合排成一条播放时间轴。
 *
 * 画布和轨迹检查器共用这一份结果 —— 两边的「第几步」「现在在哪」必须是同一个
 * 定义，否则点表格一行跳到画布上会对不上。这里只做时间，不碰坐标（坐标依赖画布
 * 尺寸，由画布自己算）。
 */

import { CanvasBuilder } from './canvasBuilder'
import type { CanvasEdge, CanvasNode, FlowCycle, FlowCycleKind, SystemEvent } from './canvasBuilder'
import type { LogEntry } from '../../../types/log'

/** 一跳的粒子动画时长，必须短于 HOP_INTERVAL，否则同一回合内相邻两跳会同时激活。 */
export const PARTICLE_DURATION = 0.42
export const POST_FADE_DURATION = 0.38
/** 回合内每跳的间隔，以及回合之间的停顿。 */
export const HOP_INTERVAL = 0.5
export const CYCLE_GAP = 0.55
export const SCENE_HOLD_DURATION = 0.3

export type TimedEdge = CanvasEdge & { seqNum: number }

export type SceneInfo = {
  sceneId: number
  startTime: number
  endTime: number
}

export type EdgeCyclePosition = {
  cycleNumber: number
  cycleTitle: string
  cycleKind: FlowCycleKind
  hopIndex: number
  hopCount: number
}

export type OrderedEdge = {
  edge: TimedEdge
  time: number
}

/** 回合在播放时间轴上的位置，以及它在真实时间里的位置。 */
export type CycleTiming = {
  cycle: FlowCycle
  cycleNumber: number
  startTime: number
  endTime: number
  startedAtMs?: number
  endedAtMs?: number
  durationMs?: number
}

export type FlowTimeline = {
  builder: CanvasBuilder
  nodes: Map<string, CanvasNode>
  edges: Map<string, TimedEdge>
  edgeTiming: Map<string, number>
  nodeTiming: Map<string, number>
  edgeScene: Map<string, number>
  nodeScene: Map<string, number>
  sceneInfo: Map<number, SceneInfo>
  edgePairs: Set<string>
  edgeCycle: Map<string, EdgeCyclePosition>
  orderedEdges: OrderedEdge[]
  cycleTimings: CycleTiming[]
  systemEvents: SystemEvent[]
  totalDuration: number
  /** 真实时间范围，供轨迹视图按真实耗时布局。 */
  realStartMs?: number
  realEndMs?: number
}

export const EMPTY_TIMELINE: FlowTimeline = {
  builder: new CanvasBuilder(),
  nodes: new Map(),
  edges: new Map(),
  edgeTiming: new Map(),
  nodeTiming: new Map(),
  edgeScene: new Map(),
  nodeScene: new Map(),
  sceneInfo: new Map(),
  edgePairs: new Set(),
  edgeCycle: new Map(),
  orderedEdges: [],
  cycleTimings: [],
  systemEvents: [],
  totalDuration: 1.8,
}

function toMs(value: string | undefined) {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

export function buildFlowTimeline(entries: LogEntry[]): FlowTimeline {
  const builder = new CanvasBuilder()
  builder.buildCanvasGraph(entries)

  const cycles = builder.getCycles()
  const systemEvents = builder.getSystemEvents()

  const edges = new Map<string, TimedEdge>()
  const edgeTiming = new Map<string, number>()
  const nodeTiming = new Map<string, number>()
  const edgeScene = new Map<string, number>()
  const nodeScene = new Map<string, number>()
  const sceneInfo = new Map<number, SceneInfo>()
  const edgePairs = new Set<string>()
  const edgeCycle = new Map<string, EdgeCyclePosition>()
  const orderedEdges: OrderedEdge[] = []
  const cycleTimings: CycleTiming[] = []

  let time = 0
  let realStartMs: number | undefined
  let realEndMs: number | undefined

  cycles.forEach((cycle, cycleIndex) => {
    const sceneId = cycleIndex
    const sceneStart = time

    cycle.hops.forEach((hop, hopIndex) => {
      const edge: TimedEdge = { ...hop, seqNum: cycleIndex + 1 }
      edges.set(hop.id, edge)
      edgeTiming.set(hop.id, time)
      edgeScene.set(hop.id, sceneId)
      edgePairs.add(`${hop.source}->${hop.target}`)
      edgeCycle.set(hop.id, {
        cycleNumber: cycleIndex + 1,
        cycleTitle: cycle.title,
        cycleKind: cycle.kind,
        hopIndex,
        hopCount: cycle.hops.length,
      })
      orderedEdges.push({ edge, time })

      if (!nodeScene.has(hop.source)) nodeScene.set(hop.source, sceneId)
      if (!nodeScene.has(hop.target)) nodeScene.set(hop.target, sceneId)
      nodeTiming.set(hop.source, Math.min(nodeTiming.get(hop.source) ?? Number.POSITIVE_INFINITY, time))
      nodeTiming.set(hop.target, Math.min(nodeTiming.get(hop.target) ?? Number.POSITIVE_INFINITY, time + 0.06))

      time += HOP_INTERVAL
    })

    const sceneEnd = time - HOP_INTERVAL + PARTICLE_DURATION + SCENE_HOLD_DURATION
    sceneInfo.set(sceneId, { sceneId, startTime: sceneStart, endTime: sceneEnd })

    const startedAtMs = toMs(cycle.startedAt)
    const endedAtMs = toMs(cycle.endedAt)
    if (startedAtMs !== undefined) {
      realStartMs = realStartMs === undefined ? startedAtMs : Math.min(realStartMs, startedAtMs)
      realEndMs = Math.max(realEndMs ?? startedAtMs, endedAtMs ?? startedAtMs)
    }

    cycleTimings.push({
      cycle,
      cycleNumber: cycleIndex + 1,
      startTime: sceneStart,
      endTime: sceneEnd,
      startedAtMs,
      endedAtMs,
      durationMs:
        startedAtMs !== undefined && endedAtMs !== undefined ? Math.max(0, endedAtMs - startedAtMs) : undefined,
    })

    time += CYCLE_GAP
  })

  return {
    builder,
    nodes: builder.getCanvasNodes(),
    edges,
    edgeTiming,
    nodeTiming,
    edgeScene,
    nodeScene,
    sceneInfo,
    edgePairs,
    edgeCycle,
    orderedEdges,
    cycleTimings,
    systemEvents,
    totalDuration: Math.max(time + 0.6, 1.8),
    realStartMs,
    realEndMs,
  }
}
