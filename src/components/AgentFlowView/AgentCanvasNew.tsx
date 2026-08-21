import { useCallback, useEffect, useRef, useState } from 'react'
import { PARTICLE_DURATION, POST_FADE_DURATION, SCENE_HOLD_DURATION } from './simulation/flowTimeline'
import type { EdgeCyclePosition, FlowTimeline, OrderedEdge, SceneInfo } from './simulation/flowTimeline'
import { compactPaths } from './lib/pathText'

type CanvasNodeData = {
  entityId: string
  entityType: string
  displayName: string
  x: number
  y: number
}

type CanvasEdgeData = {
  id: string
  source: string
  target: string
  linkType: string
  actionSummary?: string
  actionDetail?: string
  seqNum: number
}

type NodeBox = {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

type GraphBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type ActiveParticle = {
  edgeId: string
  progress: number
  color: string
}

type StepState = 'running' | 'done' | 'idle'

type EdgeStatus = {
  edgeId: string | null
  state: StepState
  stateLabel: string
  title: string
  phase?: string
  route?: string
  detail?: string
  cycleNumber?: number
  cycleTotal: number
  hopIndex?: number
  hopCount?: number
  nextUp?: string
}

type SceneRenderState = {
  opacity: number
  shiftX: number
  shiftY: number
}

type ShapeKind =
  | 'rounded'
  | 'chamfered'
  | 'hex'
  | 'diamond'
  | 'speech'
  | 'terminal'
  | 'stack'
  | 'bracket'

type EdgePoint = {
  x: number
  y: number
}

type EdgePath = {
  start: EdgePoint
  cp1: EdgePoint
  cp2: EdgePoint
  end: EdgePoint
}

type ToolVisualCategory =
  | 'file'
  | 'shell'
  | 'task'
  | 'agent'
  | 'plan'
  | 'network'
  | 'user'
  | 'system'
  | 'generic'

const COLORS = {
  bg: '#07111f',
  bgTop: '#10253c',
  panel: 'rgba(9, 16, 28, 0.9)',
  panelBorder: 'rgba(148, 163, 184, 0.16)',
  text: '#e5eefc',
  textDim: '#8ca2be',
  textMuted: '#60758f',
  lane: 'rgba(148, 163, 184, 0.05)',
  laneBorder: 'rgba(148, 163, 184, 0.08)',
  nodeFill: 'rgba(9, 16, 28, 0.94)',
  nodeShadow: 'rgba(7, 17, 31, 0.55)',
  glow: 'rgba(125, 211, 252, 0.18)',
  accent: '#7dd3fc',
  completed: '#38bdf8',
} as const

const NODE_THEME: Record<string, { accent: string; badge: string }> = {
  user: { accent: '#34d399', badge: 'USER' },
  main_agent: { accent: '#7dd3fc', badge: 'MAIN' },
  assistant: { accent: '#a78bfa', badge: 'MODEL' },
  tool: { accent: '#f59e0b', badge: 'TOOL' },
}

const TOOL_THEME: Record<ToolVisualCategory, { accent: string; badge: string }> = {
  file: { accent: '#38bdf8', badge: 'FILE' },
  shell: { accent: '#f59e0b', badge: 'SHELL' },
  task: { accent: '#22c55e', badge: 'TASK' },
  agent: { accent: '#c084fc', badge: 'AGENT' },
  plan: { accent: '#e879f9', badge: 'PLAN' },
  network: { accent: '#60a5fa', badge: 'NET' },
  user: { accent: '#2dd4bf', badge: 'ASK' },
  system: { accent: '#f472b6', badge: 'SYS' },
  generic: { accent: '#f59e0b', badge: 'TOOL' },
}

const STEP_STATE_COLORS: Record<StepState, string> = {
  running: '#38bdf8',
  done: '#64748b',
  idle: '#475569',
}

const EDGE_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  agent_call: '#c084fc',
  tool_call: '#f59e0b',
  tool_result: '#fb7185',
  agent_result: '#22c55e',
  user_input: '#34d399',
  agent_receive: '#7dd3fc',
  agent_response: '#38bdf8',
  response: '#60a5fa',
}

const LANE_LABELS = [
  { key: 'user', label: 'User Input' },
  { key: 'main_agent', label: 'Main Agent' },
  { key: 'assistant', label: 'Reasoning' },
  { key: 'tool', label: 'Tooling' },
]

const SPEED_OPTIONS = [0.25, 0.5, 1, 2]
const CAMERA_LERP = 0.12
const SCENE_SHIFT_DISTANCE = 260
const SCENE_SHIFT_Y_DISTANCE = 92

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getNodeBox(node: CanvasNodeData): NodeBox {
  const baseWidth = node.entityType === 'tool' ? 196 : 164
  const extraWidth = Math.min(96, Math.max(0, (node.displayName.length - 10) * 6))
  const width = baseWidth + extraWidth
  const height = node.entityType === 'tool' ? 58 : 76
  return {
    x: node.x - width / 2,
    y: node.y - height / 2,
    width,
    height,
    radius: node.entityType === 'tool' ? 18 : 22,
  }
}

function getToolCategory(displayName: string): ToolVisualCategory {
  const raw = displayName.replace(/^tool:/i, '').toLowerCase()
  if (['read', 'write', 'edit', 'glob', 'grep'].includes(raw)) return 'file'
  if (raw === 'bash') return 'shell'
  if (['taskcreate', 'taskget', 'tasklist', 'taskupdate'].includes(raw)) return 'task'
  if (raw === 'agent') return 'agent'
  if (['enterplanmode', 'exitplanmode'].includes(raw)) return 'plan'
  if (['webfetch', 'websearch'].includes(raw)) return 'network'
  if (raw === 'askuserquestion') return 'user'
  if (['skill', 'toolsearch'].includes(raw)) return 'system'
  return 'generic'
}

function getNodeTheme(node: CanvasNodeData) {
  if (node.entityType === 'tool') {
    return TOOL_THEME[getToolCategory(node.displayName)]
  }
  return NODE_THEME[node.entityType] ?? NODE_THEME.tool
}

function getDisplayLabel(node: CanvasNodeData) {
  return node.displayName.replace(/^tool:/i, '')
}

function truncateStepText(value: string | undefined, max = 96) {
  if (!value) return undefined
  const compact = compactPaths(value.replace(/\s+/g, ' ').trim())
  if (!compact) return undefined
  return compact.length > max ? `${compact.slice(0, max - 1).trimEnd()}…` : compact
}

function getNodeShapeKind(node: CanvasNodeData): ShapeKind {
  if (node.entityType === 'user') return 'speech'
  if (node.entityType === 'main_agent') return 'chamfered'
  if (node.entityType === 'assistant') return 'diamond'

  switch (getToolCategory(node.displayName)) {
    case 'file': return 'chamfered'
    case 'shell': return 'terminal'
    case 'task': return 'stack'
    case 'agent': return 'hex'
    case 'plan': return 'diamond'
    case 'network': return 'hex'
    case 'user': return 'speech'
    case 'system': return 'bracket'
    default: return 'rounded'
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getGraphBounds(nodes: Map<string, CanvasNodeData>): GraphBounds {
  const boxes = [...nodes.values()].map(getNodeBox)
  return {
    minX: Math.min(...boxes.map((box) => box.x)),
    minY: Math.min(...boxes.map((box) => box.y)),
    maxX: Math.max(...boxes.map((box) => box.x + box.width)),
    maxY: Math.max(...boxes.map((box) => box.y + box.height)),
  }
}

function constrainCamera(
  nextCamera: { scale: number; offsetX: number; offsetY: number },
  nodes: Map<string, CanvasNodeData>,
  dimensions: { width: number; height: number }
) {
  if (nodes.size === 0) return nextCamera
  const bounds = getGraphBounds(nodes)
  const padding = 120
  const contentWidth = (bounds.maxX - bounds.minX) * nextCamera.scale
  const contentHeight = (bounds.maxY - bounds.minY) * nextCamera.scale

  if (contentWidth + padding * 2 <= dimensions.width) {
    nextCamera.offsetX = dimensions.width / 2 - ((bounds.minX + bounds.maxX) / 2) * nextCamera.scale
  } else {
    const minOffsetX = dimensions.width - bounds.maxX * nextCamera.scale - padding
    const maxOffsetX = -bounds.minX * nextCamera.scale + padding
    nextCamera.offsetX = clamp(nextCamera.offsetX, minOffsetX, maxOffsetX)
  }

  if (contentHeight + padding * 2 <= dimensions.height) {
    nextCamera.offsetY = dimensions.height / 2 - ((bounds.minY + bounds.maxY) / 2) * nextCamera.scale
  } else {
    const minOffsetY = dimensions.height - bounds.maxY * nextCamera.scale - padding
    const maxOffsetY = -bounds.minY * nextCamera.scale + padding
    nextCamera.offsetY = clamp(nextCamera.offsetY, minOffsetY, maxOffsetY)
  }

  return nextCamera
}

function getShapePolygon(node: CanvasNodeData, box: NodeBox) {
  const kind = getNodeShapeKind(node)
  switch (kind) {
    case 'diamond':
      return [
        { x: box.x + box.width * 0.14, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width * 0.86, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ]
    case 'hex': {
      const inset = 18
      return [
        { x: box.x + inset, y: box.y },
        { x: box.x + box.width - inset, y: box.y },
        { x: box.x + box.width, y: box.y + box.height / 2 },
        { x: box.x + box.width - inset, y: box.y + box.height },
        { x: box.x + inset, y: box.y + box.height },
        { x: box.x, y: box.y + box.height / 2 },
      ]
    }
    case 'speech':
      return [
        { x: box.x + 8, y: box.y },
        { x: box.x + box.width - 8, y: box.y },
        { x: box.x + box.width, y: box.y + 18 },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x + 54, y: box.y + box.height },
        { x: box.x + 42, y: box.y + box.height + 12 },
        { x: box.x + 36, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
        { x: box.x, y: box.y + 18 },
      ]
    case 'chamfered': {
      const cut = 14
      return [
        { x: box.x + cut, y: box.y },
        { x: box.x + box.width - cut, y: box.y },
        { x: box.x + box.width, y: box.y + cut },
        { x: box.x + box.width, y: box.y + box.height - cut },
        { x: box.x + box.width - cut, y: box.y + box.height },
        { x: box.x + cut, y: box.y + box.height },
        { x: box.x, y: box.y + box.height - cut },
        { x: box.x, y: box.y + cut },
      ]
    }
    default:
      return null
  }
}

function getPolygonRayIntersection(
  polygon: { x: number; y: number }[],
  centerX: number,
  centerY: number,
  targetX: number,
  targetY: number
) {
  const dx = targetX - centerX
  const dy = targetY - centerY

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: centerX, y: centerY }
  }

  let bestT = Number.POSITIVE_INFINITY
  let bestPoint = { x: centerX, y: centerY }

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-6) continue

    const ax = a.x - centerX
    const ay = a.y - centerY
    const t = (ax * ey - ay * ex) / denom
    const u = (ax * dy - ay * dx) / denom

    if (t >= 0 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t
      bestPoint = {
        x: centerX + dx * t,
        y: centerY + dy * t,
      }
    }
  }

  return bestPoint
}

function getBoxAnchor(node: CanvasNodeData, box: NodeBox, centerX: number, centerY: number, targetX: number, targetY: number) {
  const dx = targetX - centerX
  const dy = targetY - centerY
  const polygon = getShapePolygon(node, box)
  if (polygon) {
    return getPolygonRayIntersection(polygon, centerX, centerY, targetX, targetY)
  }

  const halfW = box.width / 2 - 4
  const halfH = box.height / 2 - 4
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleX, scaleY)

  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale,
  }
}

function getEdgePath(source: CanvasNodeData, target: CanvasNodeData, offset = 0): EdgePath {
  const sourceBox = getNodeBox(source)
  const targetBox = getNodeBox(target)
  const sourceCenterX = source.x
  const sourceCenterY = source.y
  const targetCenterX = target.x
  const targetCenterY = target.y
  const direction = targetCenterX >= sourceCenterX ? 1 : -1
  const centerDeltaX = targetCenterX - sourceCenterX
  const centerDeltaY = targetCenterY - sourceCenterY
  const centerLength = Math.max(1, Math.hypot(centerDeltaX, centerDeltaY))
  const normalX = -centerDeltaY / centerLength
  const normalY = centerDeltaX / centerLength
  const shiftedTargetX = targetCenterX + normalX * offset
  const shiftedTargetY = targetCenterY + normalY * offset
  const shiftedSourceX = sourceCenterX + normalX * offset
  const shiftedSourceY = sourceCenterY + normalY * offset
  const start = getBoxAnchor(source, sourceBox, sourceCenterX, sourceCenterY, shiftedTargetX, shiftedTargetY)
  const end = getBoxAnchor(target, targetBox, targetCenterX, targetCenterY, shiftedSourceX, shiftedSourceY)
  const distance = Math.max(80, Math.abs(end.x - start.x))
  const verticalSwing = (targetCenterY - sourceCenterY) * 0.16 + offset * 0.22
  return {
    start,
    cp1: {
      x: start.x + direction * distance * 0.42 + normalX * offset * 0.35,
      y: start.y + verticalSwing + normalY * offset * 0.35,
    },
    cp2: {
      x: end.x - direction * distance * 0.42 + normalX * offset * 0.35,
      y: end.y - verticalSwing + normalY * offset * 0.35,
    },
    end,
  }
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function getBezierXY(path: EdgePath, t: number) {
  return {
    x: bezierPoint(t, path.start.x, path.cp1.x, path.cp2.x, path.end.x),
    y: bezierPoint(t, path.start.y, path.cp1.y, path.cp2.y, path.end.y),
  }
}

function getEdgeTiming(currentTime: number, edgeTime?: number) {
  if (edgeTime === undefined || currentTime < edgeTime) {
    return { active: false, pulseProgress: 0, pulseAlpha: 0 }
  }
  if (currentTime <= edgeTime + PARTICLE_DURATION) {
    const progress = (currentTime - edgeTime) / PARTICLE_DURATION
    return {
      active: true,
      pulseProgress: progress,
      pulseAlpha: 0.42 + (1 - Math.abs(progress - 0.45)) * 0.52,
    }
  }
  return { active: false, pulseProgress: 1, pulseAlpha: 0 }
}

function getNodeProgress(currentTime: number, nodeTime?: number) {
  if (nodeTime === undefined || currentTime < nodeTime) return 0
  return Math.min(1, (currentTime - nodeTime) / 0.5)
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, box.radius)
}

function drawChamferedRect(ctx: CanvasRenderingContext2D, box: NodeBox, cut = 14) {
  ctx.beginPath()
  ctx.moveTo(box.x + cut, box.y)
  ctx.lineTo(box.x + box.width - cut, box.y)
  ctx.lineTo(box.x + box.width, box.y + cut)
  ctx.lineTo(box.x + box.width, box.y + box.height - cut)
  ctx.lineTo(box.x + box.width - cut, box.y + box.height)
  ctx.lineTo(box.x + cut, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height - cut)
  ctx.lineTo(box.x, box.y + cut)
  ctx.closePath()
}

function drawHexPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  const inset = 18
  ctx.beginPath()
  ctx.moveTo(box.x + inset, box.y)
  ctx.lineTo(box.x + box.width - inset, box.y)
  ctx.lineTo(box.x + box.width, box.y + box.height / 2)
  ctx.lineTo(box.x + box.width - inset, box.y + box.height)
  ctx.lineTo(box.x + inset, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height / 2)
  ctx.closePath()
}

function drawTerminalPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 14)
  ctx.moveTo(box.x + 18, box.y + 10)
  ctx.lineTo(box.x + 42, box.y + 10)
  ctx.lineTo(box.x + 34, box.y + 20)
  ctx.closePath()
}

function drawStackPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x + 10, box.y - 6, box.width - 20, box.height, 16)
  ctx.roundRect(box.x + 5, box.y - 3, box.width - 10, box.height, 16)
  ctx.roundRect(box.x, box.y, box.width, box.height, 16)
}

function drawDiamondPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.moveTo(box.x + box.width * 0.14, box.y)
  ctx.lineTo(box.x + box.width, box.y)
  ctx.lineTo(box.x + box.width * 0.86, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height)
  ctx.closePath()
}

function drawSpeechPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 18)
  ctx.moveTo(box.x + 36, box.y + box.height)
  ctx.lineTo(box.x + 54, box.y + box.height)
  ctx.lineTo(box.x + 42, box.y + box.height + 12)
  ctx.closePath()
}

function drawBracketPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.moveTo(box.x + 14, box.y)
  ctx.lineTo(box.x + box.width - 14, box.y)
  ctx.lineTo(box.x + box.width, box.y + 14)
  ctx.lineTo(box.x + box.width, box.y + box.height - 14)
  ctx.lineTo(box.x + box.width - 14, box.y + box.height)
  ctx.lineTo(box.x + 14, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height - 14)
  ctx.lineTo(box.x, box.y + 14)
  ctx.closePath()
}

function drawNodeShape(ctx: CanvasRenderingContext2D, node: CanvasNodeData, box: NodeBox) {
  if (node.entityType === 'user') {
    drawSpeechPanel(ctx, box)
    return
  }
  if (node.entityType === 'main_agent') {
    drawChamferedRect(ctx, box, 16)
    return
  }
  if (node.entityType === 'assistant') {
    drawDiamondPanel(ctx, box)
    return
  }

  switch (getToolCategory(node.displayName)) {
    case 'file':
      drawChamferedRect(ctx, box, 18)
      break
    case 'shell':
      drawTerminalPanel(ctx, box)
      break
    case 'task':
      drawStackPanel(ctx, box)
      break
    case 'agent':
      drawHexPanel(ctx, box)
      break
    case 'plan':
      drawDiamondPanel(ctx, box)
      break
    case 'network':
      drawHexPanel(ctx, box)
      break
    case 'user':
      drawSpeechPanel(ctx, box)
      break
    case 'system':
      drawBracketPanel(ctx, box)
      break
    default:
      drawRoundedRect(ctx, box)
      break
  }
}

function drawSelfLoop(
  ctx: CanvasRenderingContext2D,
  node: CanvasNodeData,
  color: string,
  alpha: number,
  active: boolean
) {
  const box = getNodeBox(node)
  const loopX = node.x + box.width * 0.08
  const loopY = box.y - 16
  const radiusX = 34
  const radiusY = 18

  ctx.save()
  ctx.strokeStyle = withAlpha(color, alpha)
  ctx.lineWidth = active ? 3 : 2
  ctx.beginPath()
  ctx.ellipse(loopX, loopY, radiusX, radiusY, 0, Math.PI * 0.1, Math.PI * 1.8)
  ctx.stroke()

  const headX = loopX + radiusX * 0.9
  const headY = loopY - radiusY * 0.2
  ctx.beginPath()
  ctx.moveTo(headX, headY)
  ctx.lineTo(headX - 8, headY - 4)
  ctx.lineTo(headX - 6, headY + 5)
  ctx.closePath()
  ctx.fillStyle = withAlpha(color, alpha)
  ctx.fill()
  ctx.restore()
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  color: string,
  alpha: number
) {
  const size = 9
  ctx.save()
  ctx.translate(tipX, tipY)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, size * 0.52)
  ctx.lineTo(-size, -size * 0.52)
  ctx.closePath()
  ctx.fillStyle = withAlpha(color, alpha)
  ctx.fill()
  ctx.restore()
}

function getEdgeVisualCategory(source: CanvasNodeData, target: CanvasNodeData): ToolVisualCategory | 'generic' {
  if (source.entityType === 'tool') return getToolCategory(source.displayName)
  if (target.entityType === 'tool') return getToolCategory(target.displayName)
  return 'generic'
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  source: CanvasNodeData,
  target: CanvasNodeData,
  color: string,
  alpha: number,
  active: boolean,
  offset: number
) {
  const path = getEdgePath(source, target, offset)
  const edgeCategory = getEdgeVisualCategory(source, target)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.setLineDash([])

  if (edgeCategory === 'task' || edgeCategory === 'agent') {
    ctx.setLineDash(active ? [10, 7] : [7, 7])
  } else if (edgeCategory === 'system' || edgeCategory === 'plan') {
    ctx.setLineDash(active ? [3, 6] : [2, 6])
  }

  ctx.strokeStyle = withAlpha(color, alpha * 0.78)
  ctx.lineWidth = active ? 4.5 : 2.6
  ctx.beginPath()
  ctx.moveTo(path.start.x, path.start.y)
  ctx.bezierCurveTo(path.cp1.x, path.cp1.y, path.cp2.x, path.cp2.y, path.end.x, path.end.y)
  ctx.stroke()

  if (edgeCategory === 'network') {
    ctx.setLineDash([2, 10])
    ctx.lineDashOffset = active ? -6 : -2
  } else if (edgeCategory === 'file') {
    ctx.setLineDash([18, 999])
  } else {
    ctx.setLineDash([])
  }

  ctx.strokeStyle = withAlpha('#ffffff', active ? 0.24 : 0.12)
  ctx.lineWidth = active ? 1.25 : 0.8
  ctx.beginPath()
  ctx.moveTo(path.start.x, path.start.y)
  ctx.bezierCurveTo(path.cp1.x, path.cp1.y, path.cp2.x, path.cp2.y, path.end.x, path.end.y)
  ctx.stroke()

  if (edgeCategory === 'network') {
    const wavePath = getEdgePath(source, target, offset + (active ? 10 : 6))
    ctx.setLineDash([])
    ctx.strokeStyle = withAlpha(color, active ? alpha * 0.26 : alpha * 0.14)
    ctx.lineWidth = active ? 1.4 : 1
    ctx.beginPath()
    ctx.moveTo(wavePath.start.x, wavePath.start.y)
    ctx.bezierCurveTo(wavePath.cp1.x, wavePath.cp1.y, wavePath.cp2.x, wavePath.cp2.y, wavePath.end.x, wavePath.end.y)
    ctx.stroke()
  }

  const tip = getBezierXY(path, 1)
  const beforeTip = getBezierXY(path, 0.97)
  drawArrowHead(ctx, tip.x, tip.y, Math.atan2(tip.y - beforeTip.y, tip.x - beforeTip.x), color, Math.max(alpha, 0.24))
  ctx.restore()
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  source: CanvasNodeData,
  target: CanvasNodeData,
  progress: number,
  color: string,
  offset: number
) {
  const path = getEdgePath(source, target, offset)
  const head = getBezierXY(path, progress)
  const tail = getBezierXY(path, Math.max(0, progress - 0.08))
  const edgeCategory = getEdgeVisualCategory(source, target)

  ctx.save()
  ctx.strokeStyle = withAlpha(color, 0.65)
  ctx.lineWidth = edgeCategory === 'network' ? 3.2 : 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(tail.x, tail.y)
  ctx.lineTo(head.x, head.y)
  ctx.stroke()

  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14)
  glow.addColorStop(0, withAlpha(color, 0.95))
  glow.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(head.x, head.y, 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  if (edgeCategory === 'task' || edgeCategory === 'agent') {
    ctx.rect(head.x - 4, head.y - 4, 8, 8)
  } else if (edgeCategory === 'network') {
    ctx.arc(head.x, head.y, 3.8, 0, Math.PI * 2)
  } else {
    ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.restore()
}

function drawNodeGlyph(
  ctx: CanvasRenderingContext2D,
  node: CanvasNodeData,
  box: NodeBox,
  accent: string
) {
  const category = node.entityType === 'tool' ? getToolCategory(node.displayName) : node.entityType
  const cx = box.x + 18
  const cy = node.y

  ctx.save()
  ctx.strokeStyle = withAlpha(accent, 0.9)
  ctx.fillStyle = withAlpha(accent, 0.14)
  ctx.lineWidth = 1.4

  switch (category) {
    case 'user':
      ctx.beginPath()
      ctx.arc(cx, cy - 3, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy + 8, 8, Math.PI, 0)
      ctx.stroke()
      break
    case 'main_agent':
      ctx.beginPath()
      ctx.roundRect(cx - 8, cy - 8, 16, 16, 4)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 12, cy)
      ctx.lineTo(cx - 8, cy)
      ctx.moveTo(cx + 8, cy)
      ctx.lineTo(cx + 12, cy)
      ctx.moveTo(cx, cy - 12)
      ctx.lineTo(cx, cy - 8)
      ctx.moveTo(cx, cy + 8)
      ctx.lineTo(cx, cy + 12)
      ctx.stroke()
      break
    case 'assistant':
    case 'plan':
      ctx.beginPath()
      ctx.moveTo(cx, cy - 9)
      ctx.lineTo(cx + 8, cy)
      ctx.lineTo(cx, cy + 9)
      ctx.lineTo(cx - 8, cy)
      ctx.closePath()
      ctx.stroke()
      break
    case 'file':
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy - 9)
      ctx.lineTo(cx + 4, cy - 9)
      ctx.lineTo(cx + 8, cy - 5)
      ctx.lineTo(cx + 8, cy + 9)
      ctx.lineTo(cx - 8, cy + 9)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 4, cy - 3)
      ctx.lineTo(cx + 4, cy - 3)
      ctx.moveTo(cx - 4, cy + 1)
      ctx.lineTo(cx + 4, cy + 1)
      ctx.moveTo(cx - 4, cy + 5)
      ctx.lineTo(cx + 1, cy + 5)
      ctx.stroke()
      break
    case 'shell':
      ctx.beginPath()
      ctx.roundRect(cx - 10, cy - 8, 20, 16, 4)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy - 1)
      ctx.lineTo(cx - 2, cy + 3)
      ctx.lineTo(cx - 6, cy + 7)
      ctx.moveTo(cx, cy + 7)
      ctx.lineTo(cx + 5, cy + 7)
      ctx.stroke()
      break
    case 'task':
      ctx.beginPath()
      ctx.roundRect(cx - 9, cy - 9, 18, 18, 5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 5, cy)
      ctx.lineTo(cx - 1, cy + 4)
      ctx.lineTo(cx + 6, cy - 4)
      ctx.stroke()
      break
    case 'agent':
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6
        const x = cx + Math.cos(angle) * 9
        const y = cy + Math.sin(angle) * 9
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'network':
      ctx.beginPath()
      ctx.arc(cx, cy, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy)
      ctx.lineTo(cx + 8, cy)
      ctx.moveTo(cx, cy - 8)
      ctx.lineTo(cx, cy + 8)
      ctx.stroke()
      break
    case 'system':
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy - 7)
      ctx.lineTo(cx - 3, cy - 7)
      ctx.moveTo(cx - 8, cy - 7)
      ctx.lineTo(cx - 8, cy + 7)
      ctx.lineTo(cx - 3, cy + 7)
      ctx.moveTo(cx + 8, cy - 7)
      ctx.lineTo(cx + 3, cy - 7)
      ctx.moveTo(cx + 8, cy - 7)
      ctx.lineTo(cx + 8, cy + 7)
      ctx.lineTo(cx + 3, cy + 7)
      ctx.stroke()
      break
    default:
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.stroke()
      break
  }

  ctx.restore()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNodeData,
  progress: number,
  emphasis: number,
  mainPulse: number,
  actionSummary?: string
) {
  const theme = getNodeTheme(node)
  const box = getNodeBox(node)
  const accent = theme.accent
  const label = getDisplayLabel(node)
  const hasSummary = node.entityType === 'tool' && Boolean(actionSummary)
  const summaryText = hasSummary ? actionSummary!.trim() : ''
  const titleY = hasSummary ? node.y - 12 : node.y - 8
  const metaY = hasSummary ? node.y + 4 : node.y + 13

  ctx.save()
  if (emphasis > 0) {
    const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, box.width * 0.75)
    halo.addColorStop(0, withAlpha(accent, 0.24 * emphasis))
    halo.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }

  if (node.entityType === 'main_agent') {
    const stage = ctx.createRadialGradient(node.x, node.y, box.width * 0.12, node.x, node.y, box.width * (1.15 + mainPulse * 0.18))
    stage.addColorStop(0, withAlpha(accent, 0.22 + emphasis * 0.12 + mainPulse * 0.16))
    stage.addColorStop(0.55, withAlpha(accent, 0.08 + mainPulse * 0.08))
    stage.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = stage
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * (1.15 + mainPulse * 0.18), 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = withAlpha(accent, 0.28 + mainPulse * 0.2)
    ctx.lineWidth = 1 + mainPulse * 0.8
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * (0.72 + mainPulse * 0.08), 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * (0.9 + mainPulse * 0.12), 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.shadowColor = COLORS.nodeShadow
  ctx.shadowBlur = 24 + emphasis * 16
  ctx.shadowOffsetY = 12
  drawNodeShape(ctx, node, box)
  ctx.fillStyle = COLORS.nodeFill
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.strokeStyle = withAlpha(accent, 0.18 + progress * 0.7 + emphasis * 0.28)
  ctx.lineWidth = 1.5 + progress * 1.4 + emphasis * 1.2
  drawNodeShape(ctx, node, box)
  ctx.stroke()

  const glow = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height)
  glow.addColorStop(0, withAlpha(accent, 0.18 + progress * 0.15 + emphasis * 0.12))
  glow.addColorStop(1, withAlpha('#ffffff', progress * 0.04 + emphasis * 0.05))
  drawNodeShape(ctx, node, box)
  ctx.fillStyle = glow
  ctx.fill()

  ctx.strokeStyle = withAlpha(accent, 0.22)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(box.x + 14, box.y + 12)
  ctx.lineTo(box.x + box.width - 14, box.y + 12)
  ctx.moveTo(box.x + 14, box.y + box.height - 12)
  ctx.lineTo(box.x + box.width - 14, box.y + box.height - 12)
  ctx.stroke()

  ctx.fillStyle = withAlpha(accent, 0.12)
  ctx.beginPath()
  ctx.roundRect(box.x + 8, node.y - 13, 20, 26, 8)
  ctx.fill()
  drawNodeGlyph(ctx, node, box, accent)

  ctx.fillStyle = COLORS.text
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, box.x + 32, titleY)

  ctx.fillStyle = COLORS.textDim
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
  const metaText = node.entityType === 'tool' ? getToolCategory(node.displayName).toUpperCase() : node.entityId
  ctx.fillText(metaText, box.x + 32, metaY)

  const badgeWidth = 42 + theme.badge.length * 6.2
  ctx.fillStyle = withAlpha(accent, 0.14 + progress * 0.14)
  ctx.beginPath()
  ctx.roundRect(box.x + box.width - badgeWidth - 12, box.y + 10, badgeWidth, 22, 11)
  ctx.fill()
  ctx.strokeStyle = withAlpha(accent, 0.25 + progress * 0.35)
  ctx.stroke()

  ctx.fillStyle = withAlpha('#ffffff', 0.9)
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(theme.badge, box.x + box.width - badgeWidth / 2 - 12, box.y + 21)

  if (summaryText) {
    const chipX = box.x + 32
    const chipY = box.y + box.height - 22
    const chipHeight = 14
    const maxChipWidth = Math.max(68, box.width - 48)
    ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif'
    let chipText = summaryText
    while (chipText.length > 12 && ctx.measureText(chipText).width > maxChipWidth - 18) {
      chipText = `${chipText.slice(0, -2).trimEnd()}…`
    }

    const chipWidth = Math.min(maxChipWidth, ctx.measureText(chipText).width + 14)
    ctx.fillStyle = withAlpha(accent, 0.16 + emphasis * 0.08)
    ctx.beginPath()
    ctx.roundRect(chipX, chipY, chipWidth, chipHeight, 7)
    ctx.fill()
    ctx.strokeStyle = withAlpha(accent, 0.26 + emphasis * 0.14)
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = withAlpha('#ffffff', 0.92)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(chipText, chipX + 7, chipY + chipHeight / 2 + 0.5)
  }
  ctx.restore()
}

function getEdgePhaseLabel(linkType: string) {
  switch (linkType) {
    case 'user_input': return 'User Input'
    case 'agent_receive': return 'Agent Receive'
    case 'thinking': return 'Reasoning'
    case 'agent_call': return 'Agent Handoff'
    case 'tool_call': return 'Tool Invocation'
    case 'tool_result': return 'Tool Result'
    case 'agent_result': return 'Result Relay'
    case 'agent_response': return 'Response Prep'
    case 'response': return 'User Response'
    default: return 'Flow Step'
  }
}

function getEdgeRoute(edge: CanvasEdgeData, nodes: Map<string, CanvasNodeData>) {
  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  const sourceName = source ? getDisplayLabel(source) : edge.source
  const targetName = target ? getDisplayLabel(target) : edge.target
  return `${sourceName} -> ${targetName}`
}

/** 时间轴上最后一个开始时间 <= currentTime 的跳；-1 表示还没开始。 */
function findEdgeIndexAtOrBefore(orderedEdges: OrderedEdge[], currentTime: number) {
  let low = 0
  let high = orderedEdges.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (orderedEdges[mid].time <= currentTime) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

function getEdgeStatusAtTime(
  currentTime: number,
  orderedEdges: OrderedEdge[],
  edgeCycle: Map<string, EdgeCyclePosition>,
  cycleTotal: number,
  nodes: Map<string, CanvasNodeData>
): EdgeStatus {
  const index = findEdgeIndexAtOrBefore(orderedEdges, currentTime)
  const previous = index >= 0 ? orderedEdges[index] : undefined
  const active = previous && currentTime <= previous.time + PARTICLE_DURATION ? previous : undefined

  const focus = active ?? previous
  const focusCycle = focus ? edgeCycle.get(focus.edge.id) : undefined
  const nextCycleEdge = orderedEdges
    .slice(index + 1)
    .find((item) => edgeCycle.get(item.edge.id)?.cycleNumber !== focusCycle?.cycleNumber)
  const nextCycle = nextCycleEdge ? edgeCycle.get(nextCycleEdge.edge.id) : undefined
  const nextUp = nextCycle
    ? `Cycle ${nextCycle.cycleNumber} · ${truncateStepText(nextCycle.cycleTitle, 52)}`
    : undefined

  if (!focus) {
    return {
      edgeId: null,
      state: 'idle',
      stateLabel: 'Standby',
      title: 'Waiting for the first cycle',
      cycleTotal,
      nextUp,
    }
  }

  const { edge } = focus
  const phase = getEdgePhaseLabel(edge.linkType)
  return {
    edgeId: edge.id,
    state: active ? 'running' : 'done',
    stateLabel: active ? 'Running' : nextCycle ? 'Completed' : 'Flow complete',
    title: truncateStepText(edge.actionSummary, 88) ?? phase,
    phase,
    route: getEdgeRoute(edge, nodes),
    detail: edge.actionDetail ? truncateStepText(edge.actionDetail, 140) : undefined,
    cycleNumber: focusCycle?.cycleNumber,
    cycleTotal,
    hopIndex: focusCycle?.hopIndex,
    hopCount: focusCycle?.hopCount,
    nextUp,
  }
}

function getStepTheme(edge: CanvasEdgeData | null, nodes: Map<string, CanvasNodeData>) {
  if (!edge) {
    return { accent: '#7dd3fc', badge: 'FLOW', category: 'generic' as const }
  }

  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  const category = source?.entityType === 'tool'
    ? getToolCategory(source.displayName)
    : target?.entityType === 'tool'
      ? getToolCategory(target.displayName)
      : edge.linkType === 'user_input' || edge.linkType === 'response'
        ? 'user'
        : edge.linkType === 'thinking'
          ? 'plan'
          : 'generic'

  return {
    accent: TOOL_THEME[category]?.accent ?? '#7dd3fc',
    badge: TOOL_THEME[category]?.badge ?? 'FLOW',
    category,
  }
}

function getActiveEdgeAtTime(currentTime: number, orderedEdges: OrderedEdge[]) {
  const index = findEdgeIndexAtOrBefore(orderedEdges, currentTime)
  if (index < 0) return null
  const candidate = orderedEdges[index]
  return currentTime <= candidate.time + PARTICLE_DURATION ? candidate.edge : null
}

function getLastEdgeBeforeTime(currentTime: number, orderedEdges: OrderedEdge[]) {
  const index = findEdgeIndexAtOrBefore(orderedEdges, currentTime)
  return index >= 0 ? orderedEdges[index].edge : null
}

/**
 * 双向边要左右分开，否则去程与回程完全重叠。用 source/target 对判断，
 * 不能用边 id —— 边 id 现在带唯一后缀。
 */
function getEdgeOffset(edge: CanvasEdgeData, edgePairs: Set<string>) {
  if (!edgePairs.has(`${edge.target}->${edge.source}`)) return 0
  return edge.source < edge.target ? -42 : 42
}

function getSceneRenderState(currentTime: number, sceneId: number, scenes: Map<number, SceneInfo>): SceneRenderState {
  const scene = scenes.get(sceneId)
  if (!scene) return { opacity: 0, shiftX: 0, shiftY: 0 }

  const previousScene = scenes.get(sceneId - 1)
  const fadeInStart = previousScene ? previousScene.endTime : scene.startTime
  const verticalDirection = sceneId % 2 === 0 ? 1 : -1

  if (currentTime < fadeInStart) {
    return { opacity: 0, shiftX: SCENE_SHIFT_DISTANCE, shiftY: verticalDirection * SCENE_SHIFT_Y_DISTANCE }
  }

  if (currentTime <= fadeInStart + POST_FADE_DURATION) {
    const progress = (currentTime - fadeInStart) / POST_FADE_DURATION
    const easedTravel = 1 - Math.pow(1 - progress, 2.2)
    return {
      opacity: Math.max(0, Math.min(1, progress)),
      shiftX: (1 - easedTravel) * SCENE_SHIFT_DISTANCE,
      shiftY: verticalDirection * (1 - easedTravel) * SCENE_SHIFT_Y_DISTANCE,
    }
  }

  if (currentTime <= scene.endTime) {
    return { opacity: 1, shiftX: 0, shiftY: 0 }
  }

  if (currentTime <= scene.endTime + POST_FADE_DURATION) {
    const progress = (currentTime - scene.endTime) / POST_FADE_DURATION
    const easedTravel = Math.pow(progress, 0.72)
    return {
      opacity: Math.max(0, 1 - progress),
      shiftX: -easedTravel * SCENE_SHIFT_DISTANCE,
      shiftY: -verticalDirection * easedTravel * SCENE_SHIFT_Y_DISTANCE,
    }
  }

  return { opacity: 0, shiftX: -SCENE_SHIFT_DISTANCE, shiftY: -verticalDirection * SCENE_SHIFT_Y_DISTANCE }
}

function shiftNodeForScene(node: CanvasNodeData, shiftX: number, shiftY: number): CanvasNodeData {
  if (node.entityType !== 'tool') return node
  return {
    ...node,
    x: node.x + shiftX,
    y: node.y + shiftY,
  }
}

function getMainAgentPulse(currentTime: number, scenes: Map<number, SceneInfo>) {
  let pulse = 0
  for (const scene of scenes.values()) {
    const delta = currentTime - scene.endTime
    if (delta >= 0 && delta <= SCENE_HOLD_DURATION + POST_FADE_DURATION) {
      const progress = delta / (SCENE_HOLD_DURATION + POST_FADE_DURATION)
      pulse = Math.max(pulse, 1 - progress)
    }
  }
  return pulse
}

interface AgentCanvasNewProps {
  timeline: FlowTimeline
  /** 从轨迹视图切回来时的续播位置。 */
  initialTime?: number
  /** 播放位置变化时上报（暂停/跳转/结束时，不是每帧）。 */
  onTimeCommit?: (time: number) => void
  toolbarExtra?: React.ReactNode
}

export function AgentCanvasNew({ timeline, initialTime = 0, onTimeCommit, toolbarExtra }: AgentCanvasNewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [camera, setCamera] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(0.5)

  const canvasNodesRef = useRef<Map<string, CanvasNodeData>>(new Map())
  const canvasEdgesRef = useRef<Map<string, CanvasEdgeData>>(new Map())
  const edgeTimingRef = useRef<Map<string, number>>(new Map())
  const nodeTimingRef = useRef<Map<string, number>>(new Map())
  const edgeSceneRef = useRef<Map<string, number>>(new Map())
  const nodeSceneRef = useRef<Map<string, number>>(new Map())
  const sceneInfoRef = useRef<Map<number, SceneInfo>>(new Map())
  const edgePairsRef = useRef<Set<string>>(new Set())
  const edgeCycleRef = useRef<Map<string, EdgeCyclePosition>>(new Map())
  const orderedEdgesRef = useRef<OrderedEdge[]>([])
  const cycleCountRef = useRef(0)
  const systemEventCountRef = useRef(0)
  const totalDurationRef = useRef(0)

  const isPlayingRef = useRef(false)
  const speedRef = useRef(0.5)
  const animationIdRef = useRef<number>(0)
  const lastTimestampRef = useRef<number>(0)
  const currentTimeRef = useRef(0)
  const activeParticlesRef = useRef<ActiveParticle[]>([])

  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const wasPlayingBeforeSeekRef = useRef(false)

  const initialTimeRef = useRef(initialTime)
  const onTimeCommitRef = useRef(onTimeCommit)
  onTimeCommitRef.current = onTimeCommit

  // 卸载（例如切到轨迹视图）时把播放位置交回上层，两个视图才能接得上。
  useEffect(() => () => onTimeCommitRef.current?.(currentTimeRef.current), [])

  const syncParticlesAtTime = useCallback((time: number) => {
    const particles: ActiveParticle[] = []
    edgeTimingRef.current.forEach((edgeTime, edgeId) => {
      const elapsed = time - edgeTime
      if (elapsed >= 0 && elapsed <= PARTICLE_DURATION) {
        const edge = canvasEdgesRef.current.get(edgeId)
        if (!edge) return
        particles.push({
          edgeId,
          progress: Math.min(1, elapsed / PARTICLE_DURATION),
          color: EDGE_COLORS[edge.linkType] ?? COLORS.accent,
        })
      }
    })
    activeParticlesRef.current = particles
  }, [])

  const activeEdge = getActiveEdgeAtTime(currentTime, orderedEdgesRef.current)
  const activeEdgeStatus = getEdgeStatusAtTime(
    currentTime,
    orderedEdgesRef.current,
    edgeCycleRef.current,
    cycleCountRef.current,
    canvasNodesRef.current
  )
  const statusThemeEdge = activeEdgeStatus.edgeId ? canvasEdgesRef.current.get(activeEdgeStatus.edgeId) ?? activeEdge : activeEdge
  const activeStepTheme = getStepTheme(statusThemeEdge ?? null, canvasNodesRef.current)

  const fitToView = useCallback((nodes: Map<string, CanvasNodeData>, width: number, height: number) => {
    if (nodes.size === 0 || width <= 0 || height <= 0) return
    const bounds = getGraphBounds(nodes)
    const contentWidth = bounds.maxX - bounds.minX
    const contentHeight = bounds.maxY - bounds.minY
    const padding = 120
    const scale = Math.min(
      1.25,
      Math.max(
        0.45,
        Math.min((width - padding) / Math.max(contentWidth, 1), (height - padding) / Math.max(contentHeight, 1))
      )
    )
    const contentCenterX = (bounds.minX + bounds.maxX) / 2
    const contentCenterY = (bounds.minY + bounds.maxY) / 2
    setCamera(constrainCamera({
      scale,
      offsetX: width / 2 - contentCenterX * scale,
      offsetY: height / 2 - contentCenterY * scale,
    }, nodes, { width, height }))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      if (width > 0 && height > 0) {
        setDimensions({ width, height })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (timeline.cycleTimings.length === 0 || dimensions.width <= 0 || dimensions.height <= 0) {
      canvasNodesRef.current = new Map()
      canvasEdgesRef.current = new Map()
      edgeTimingRef.current = new Map()
      nodeTimingRef.current = new Map()
      orderedEdgesRef.current = []
      totalDurationRef.current = 0
      setIsPlaying(false)
      currentTimeRef.current = 0
      setCurrentTime(0)
      return
    }

    // 坐标依赖画布尺寸，只能在这里算；时间轴则由上层共享，保证与轨迹视图一致。
    timeline.builder.initializePositions(dimensions.width, dimensions.height)

    canvasNodesRef.current = timeline.nodes
    canvasEdgesRef.current = timeline.edges
    edgeTimingRef.current = timeline.edgeTiming
    nodeTimingRef.current = timeline.nodeTiming
    edgeSceneRef.current = timeline.edgeScene
    nodeSceneRef.current = timeline.nodeScene
    sceneInfoRef.current = timeline.sceneInfo
    edgePairsRef.current = timeline.edgePairs
    edgeCycleRef.current = timeline.edgeCycle
    orderedEdgesRef.current = timeline.orderedEdges
    cycleCountRef.current = timeline.cycleTimings.length
    systemEventCountRef.current = timeline.systemEvents.length
    totalDurationRef.current = timeline.totalDuration

    const startTime = clamp(initialTimeRef.current, 0, timeline.totalDuration)
    currentTimeRef.current = startTime
    setCurrentTime(startTime)
    syncParticlesAtTime(startTime)
    isPlayingRef.current = startTime < timeline.totalDuration
    setIsPlaying(startTime < timeline.totalDuration)
    fitToView(timeline.nodes, dimensions.width, dimensions.height)
  }, [timeline, dimensions, fitToView, syncParticlesAtTime])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== dimensions.width * dpr || canvas.height !== dimensions.height * dpr) {
      canvas.width = dimensions.width * dpr
      canvas.height = dimensions.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const bg = ctx.createLinearGradient(0, 0, 0, dimensions.height)
    bg.addColorStop(0, COLORS.bgTop)
    bg.addColorStop(1, COLORS.bg)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    ctx.save()
    ctx.translate(camera.offsetX, camera.offsetY)
    ctx.scale(camera.scale, camera.scale)

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.06)'
    ctx.lineWidth = 1
    for (let y = 70; y < dimensions.height / camera.scale; y += 72) {
      ctx.beginPath()
      ctx.moveTo(24, y)
      ctx.lineTo(dimensions.width / camera.scale - 24, y)
      ctx.stroke()
    }

    const highlightedNodes = new Set<string>()
    const visibleNodeOpacity = new Map<string, number>()
    const activeToolSummaries = new Map<string, string>()
    const nodeSceneShift = new Map<string, { x: number; y: number; weight: number }>()
    const mainPulse = getMainAgentPulse(currentTimeRef.current, sceneInfoRef.current)

    const placeNodeInScene = (node: CanvasNodeData) => {
      const claimed = nodeSceneShift.get(node.entityId)
      if (claimed) return shiftNodeForScene(node, claimed.x, claimed.y)
      const fallbackScene = nodeSceneRef.current.get(node.entityId)
      if (fallbackScene === undefined) return node
      const state = getSceneRenderState(currentTimeRef.current, fallbackScene, sceneInfoRef.current)
      return shiftNodeForScene(node, state.shiftX, state.shiftY)
    }

    const mainAgentNode = canvasNodesRef.current.get('1')
    if (mainAgentNode) {
      const focusGlow = ctx.createRadialGradient(
        mainAgentNode.x,
        mainAgentNode.y,
        0,
        mainAgentNode.x,
        mainAgentNode.y,
        380 + mainPulse * 120
      )
      focusGlow.addColorStop(0, withAlpha('#38bdf8', 0.12 + mainPulse * 0.12))
      focusGlow.addColorStop(0.4, withAlpha('#7dd3fc', 0.06 + mainPulse * 0.06))
      focusGlow.addColorStop(1, withAlpha('#7dd3fc', 0))
      ctx.fillStyle = focusGlow
      ctx.beginPath()
      ctx.arc(mainAgentNode.x, mainAgentNode.y, 380 + mainPulse * 120, 0, Math.PI * 2)
      ctx.fill()
    }

    const visibleEdges: {
      edge: CanvasEdgeData
      rawSource: CanvasNodeData
      rawTarget: CanvasNodeData
      timing: ReturnType<typeof getEdgeTiming>
      renderAlpha: number
    }[] = []

    canvasEdgesRef.current.forEach((edge) => {
      const edgeSceneId = edgeSceneRef.current.get(edge.id) ?? 0
      const sceneState = getSceneRenderState(currentTimeRef.current, edgeSceneId, sceneInfoRef.current)
      if (sceneState.opacity <= 0.01) return

      const rawSource = canvasNodesRef.current.get(edge.source)
      const rawTarget = canvasNodesRef.current.get(edge.target)
      if (!rawSource || !rawTarget) return
      const timing = getEdgeTiming(currentTimeRef.current, edgeTimingRef.current.get(edge.id))
      const reverseExists = canvasEdgesRef.current.has(`${edge.target}-${edge.source}`)
      const inactiveAlpha = reverseExists ? 0.08 : 0.2
      const renderAlpha = sceneState.opacity * (timing.active ? Math.max(0.46, timing.pulseAlpha) : inactiveAlpha)

      visibleNodeOpacity.set(edge.source, Math.max(visibleNodeOpacity.get(edge.source) ?? 0, Math.min(1, renderAlpha + 0.18)))
      visibleNodeOpacity.set(edge.target, Math.max(visibleNodeOpacity.get(edge.target) ?? 0, Math.min(1, renderAlpha + 0.12)))

      const shiftWeight = sceneState.opacity * (timing.active ? 4 : 1)
      const claimShift = (entityId: string) => {
        const current = nodeSceneShift.get(entityId)
        if (current && current.weight >= shiftWeight) return
        nodeSceneShift.set(entityId, { x: sceneState.shiftX, y: sceneState.shiftY, weight: shiftWeight })
      }
      claimShift(edge.source)
      claimShift(edge.target)

      if (timing.active) {
        highlightedNodes.add(edge.source)
        highlightedNodes.add(edge.target)
        if (edge.actionSummary) {
          if (edge.linkType === 'tool_call' && rawTarget.entityType === 'tool') {
            activeToolSummaries.set(edge.target, edge.actionSummary)
          } else if (edge.linkType === 'tool_result' && rawSource.entityType === 'tool') {
            activeToolSummaries.set(edge.source, edge.actionSummary)
          }
        }
      }

      visibleEdges.push({ edge, rawSource, rawTarget, timing, renderAlpha })
    })

    visibleEdges.forEach(({ edge, rawSource, rawTarget, timing, renderAlpha }) => {
      const source = placeNodeInScene(rawSource)
      const target = placeNodeInScene(rawTarget)
      const color = EDGE_COLORS[edge.linkType] ?? COLORS.accent
      const edgeOffset = getEdgeOffset(edge, edgePairsRef.current)

      if (edge.source === edge.target) {
        drawSelfLoop(ctx, source, color, renderAlpha, timing.active)
      } else {
        drawEdge(ctx, source, target, color, renderAlpha, timing.active, edgeOffset)
      }

      if (renderAlpha > 0.22 && timing.active) {
        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        ctx.fillStyle = withAlpha('#0b1627', 0.68 * renderAlpha)
        ctx.beginPath()
        ctx.roundRect(midX - 14, midY - 11, 28, 22, 11)
        ctx.fill()
        ctx.strokeStyle = withAlpha(color, 0.28 * renderAlpha)
        ctx.stroke()
        ctx.fillStyle = withAlpha('#c7d5e8', 0.85 * renderAlpha)
        ctx.font = '700 10px ui-monospace, SFMono-Regular, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(edge.seqNum), midX, midY)
      }
    })

    activeParticlesRef.current.forEach((particle) => {
      const edge = canvasEdgesRef.current.get(particle.edgeId)
      if (!edge) return
      const edgeSceneId = edgeSceneRef.current.get(edge.id) ?? 0
      const sceneState = getSceneRenderState(currentTimeRef.current, edgeSceneId, sceneInfoRef.current)
      if (sceneState.opacity <= 0.01) return
      const rawSource = canvasNodesRef.current.get(edge.source)
      const rawTarget = canvasNodesRef.current.get(edge.target)
      if (!rawSource || !rawTarget || edge.source === edge.target) return
      drawParticle(
        ctx,
        placeNodeInScene(rawSource),
        placeNodeInScene(rawTarget),
        particle.progress,
        particle.color,
        getEdgeOffset(edge, edgePairsRef.current)
      )
    })

    if (currentTimeRef.current >= (nodeTimingRef.current.get('1') ?? Number.POSITIVE_INFINITY)) {
      visibleNodeOpacity.set('1', 1)
    }

    canvasNodesRef.current.forEach((node) => {
      const opacity = visibleNodeOpacity.get(node.entityId) ?? 0
      if (opacity <= 0.02) return
      ctx.save()
      ctx.globalAlpha = Math.min(1, opacity)
      drawNode(
        ctx,
        placeNodeInScene(node),
        getNodeProgress(currentTimeRef.current, nodeTimingRef.current.get(node.entityId)),
        highlightedNodes.has(node.entityId) ? 1 : 0,
        node.entityId === '1' ? mainPulse : 0,
        activeToolSummaries.get(node.entityId)
      )
      ctx.restore()
    })

    ctx.restore()

    ctx.fillStyle = withAlpha(COLORS.textMuted, 0.7)
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    LANE_LABELS.forEach(({ key, label }) => {
      const laneNode = [...canvasNodesRef.current.values()].find((node) => node.entityType === key)
      if (!laneNode) return
      ctx.fillText(label.toUpperCase(), laneNode.x - 64, 30)
    })
  }, [camera, dimensions])

  const animateRef = useRef<(timestamp: number) => void>(() => {})

  animateRef.current = (timestamp: number) => {
    if (!lastTimestampRef.current) lastTimestampRef.current = timestamp
    const delta = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.1)
    lastTimestampRef.current = timestamp

    if (isPlayingRef.current) {
      const duration = totalDurationRef.current || 1
      currentTimeRef.current = Math.min(duration, currentTimeRef.current + delta * speedRef.current)
      setCurrentTime(currentTimeRef.current)

      const activeEdge = getActiveEdgeAtTime(currentTimeRef.current, orderedEdgesRef.current)
      if (activeEdge && !isDraggingRef.current) {
        const source = canvasNodesRef.current.get(activeEdge.source)
        const target = canvasNodesRef.current.get(activeEdge.target)
        if (source && target) {
          const path = getEdgePath(source, target, getEdgeOffset(activeEdge, edgePairsRef.current))
          const focusX = path.start.x
          const focusY = path.start.y
          setCamera((prev) => {
            const nextScale = prev.scale
            const targetOffsetX = dimensions.width / 2 - focusX * nextScale
            const targetOffsetY = dimensions.height / 2 - focusY * nextScale
            return constrainCamera({
              scale: nextScale,
              offsetX: prev.offsetX + (targetOffsetX - prev.offsetX) * CAMERA_LERP,
              offsetY: prev.offsetY + (targetOffsetY - prev.offsetY) * CAMERA_LERP,
            }, canvasNodesRef.current, dimensions)
          })
        }
      }

      syncParticlesAtTime(currentTimeRef.current)

      if (currentTimeRef.current >= duration) {
        isPlayingRef.current = false
        setIsPlaying(false)
        onTimeCommitRef.current?.(currentTimeRef.current)
      }
    }

    drawFrame()
    animationIdRef.current = requestAnimationFrame(animateRef.current)
  }

  useEffect(() => {
    animationIdRef.current = requestAnimationFrame(animateRef.current)
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    }
  }, [drawFrame])

  const handlePlayPause = useCallback(() => {
    if (currentTimeRef.current >= totalDurationRef.current) {
      currentTimeRef.current = 0
      setCurrentTime(0)
    }
    setIsPlaying((prev) => {
      if (prev) onTimeCommitRef.current?.(currentTimeRef.current)
      return !prev
    })
  }, [])

  const seekToTime = useCallback((time: number) => {
    const duration = totalDurationRef.current || 0
    const nextTime = clamp(time, 0, duration)
    currentTimeRef.current = nextTime
    lastTimestampRef.current = 0
    setCurrentTime(nextTime)
    syncParticlesAtTime(nextTime)
    onTimeCommitRef.current?.(nextTime)

    const edge =
      getActiveEdgeAtTime(nextTime, orderedEdgesRef.current) ??
      getLastEdgeBeforeTime(nextTime, orderedEdgesRef.current)
    if (!edge) return
    const source = canvasNodesRef.current.get(edge.source)
    const target = canvasNodesRef.current.get(edge.target)
    if (!source || !target) return
    const path = getEdgePath(source, target, getEdgeOffset(edge, edgePairsRef.current))
    setCamera((prev) => constrainCamera({
      scale: prev.scale,
      offsetX: dimensions.width / 2 - path.start.x * prev.scale,
      offsetY: dimensions.height / 2 - path.start.y * prev.scale,
    }, canvasNodesRef.current, dimensions))
  }, [dimensions, syncParticlesAtTime])

  const seekToClientX = useCallback((clientX: number) => {
    const track = progressTrackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    seekToTime(ratio * (totalDurationRef.current || 0))
  }, [seekToTime])

  const handleSeekPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // pointer capture is best effort; seeking still works without it
    }
    isSeekingRef.current = true
    wasPlayingBeforeSeekRef.current = isPlayingRef.current
    setIsPlaying(false)
    seekToClientX(e.clientX)
  }, [seekToClientX])

  const handleSeekPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    seekToClientX(e.clientX)
  }, [seekToClientX])

  const handleSeekPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // ignore: capture may already be released by the browser
    }
    if (wasPlayingBeforeSeekRef.current && currentTimeRef.current < totalDurationRef.current) {
      setIsPlaying(true)
    }
  }, [])

  const handleRestart = useCallback(() => {
    currentTimeRef.current = 0
    lastTimestampRef.current = 0
    activeParticlesRef.current = []
    setCurrentTime(0)
    setIsPlaying(true)
  }, [])

  const handleResetView = useCallback(() => {
    fitToView(canvasNodesRef.current, dimensions.width, dimensions.height)
  }, [dimensions, fitToView])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const zoom = e.deltaY > 0 ? 0.92 : 1.08
    setCamera((prev) => ({
      ...constrainCamera({
        ...prev,
        scale: Math.min(2.2, Math.max(0.35, prev.scale * zoom)),
      }, canvasNodesRef.current, dimensions),
    }))
  }, [dimensions])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastMousePosRef.current.x
    const dy = e.clientY - lastMousePosRef.current.y
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    setCamera((prev) => constrainCamera({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy,
    }, canvasNodesRef.current, dimensions))
  }, [dimensions])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const totalDuration = totalDurationRef.current || 1
  const progressPct = Math.min(100, (currentTime / totalDuration) * 100)

  return (
    <div className="relative flex h-full flex-col overflow-visible" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center gap-3 border-b px-4"
        style={{ height: 54, background: COLORS.panel, borderColor: COLORS.panelBorder }}
      >
        <button
          onClick={handlePlayPause}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: isPlaying ? withAlpha('#f59e0b', 0.2) : withAlpha('#38bdf8', 0.22),
            color: isPlaying ? '#fbbf24' : '#7dd3fc',
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleRestart}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: 'rgba(30, 41, 59, 0.72)', color: COLORS.textDim }}
        >
          Restart
        </button>
        <button
          onClick={handleResetView}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: 'rgba(30, 41, 59, 0.72)', color: COLORS.textDim }}
        >
          Reset View
        </button>

        {toolbarExtra}

        <div className="ml-3 flex items-center gap-2">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setSpeed(option)}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: option === speed ? withAlpha('#7dd3fc', 0.18) : 'rgba(30, 41, 59, 0.72)',
                color: option === speed ? COLORS.text : COLORS.textMuted,
                border: `1px solid ${option === speed ? withAlpha('#7dd3fc', 0.28) : 'transparent'}`,
              }}
            >
              {option}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex min-w-[280px] items-center gap-3">
          <div
            ref={progressTrackRef}
            role="slider"
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={Number(totalDuration.toFixed(1))}
            aria-valuenow={Number(currentTime.toFixed(1))}
            className="group relative flex-1 cursor-pointer py-2"
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/70">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #34d399 0%, #7dd3fc 55%, #a78bfa 100%)',
                }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                left: `${progressPct}%`,
                background: COLORS.text,
                boxShadow: `0 0 0 3px ${withAlpha('#7dd3fc', 0.35)}`,
                opacity: isSeekingRef.current ? 1 : undefined,
              }}
            />
          </div>
          <span className="w-24 text-right text-xs font-medium tabular-nums" style={{ color: COLORS.textMuted }}>
            {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
      >
        <canvas ref={canvasRef} className="h-full w-full" style={{ width: '100%', height: '100%' }} />
      </div>

      <div
        className="pointer-events-none absolute right-4 top-[70px] z-30 w-[320px] rounded-2xl border px-4 py-3 text-xs"
        style={{
          background: `linear-gradient(180deg, ${withAlpha(activeStepTheme.accent, 0.12)} 0%, ${COLORS.panel} 32%)`,
          borderColor: withAlpha(activeStepTheme.accent, 0.22),
          color: COLORS.textDim,
          boxShadow: `0 18px 40px ${withAlpha(activeStepTheme.accent, 0.12)}`,
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <div
            className="rounded-lg px-2 py-1 text-[10px] font-bold tracking-[0.18em]"
            style={{
              background: withAlpha(activeStepTheme.accent, 0.16),
              color: '#eef6ff',
              border: `1px solid ${withAlpha(activeStepTheme.accent, 0.28)}`,
            }}
          >
            {activeStepTheme.badge}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: STEP_STATE_COLORS[activeEdgeStatus.state],
                boxShadow: activeEdgeStatus.state === 'running'
                  ? `0 0 0 3px ${withAlpha(STEP_STATE_COLORS.running, 0.22)}`
                  : 'none',
              }}
            />
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: activeEdgeStatus.state === 'running' ? COLORS.text : COLORS.textMuted }}
            >
              {activeEdgeStatus.stateLabel}
            </span>
          </div>
          {activeEdgeStatus.cycleNumber && (
            <div className="ml-auto text-[11px] font-medium tabular-nums" style={{ color: COLORS.textMuted }}>
              CYCLE {activeEdgeStatus.cycleNumber} / {activeEdgeStatus.cycleTotal}
            </div>
          )}
        </div>
        <div className="mb-3">
          <div className="text-sm font-semibold leading-5" style={{ color: COLORS.text }}>
            {activeEdgeStatus.title}
          </div>
          {activeEdgeStatus.route && (
            <div
              className="mt-2 rounded-xl border px-3 py-2 text-[12px] font-medium"
              style={{
                background: withAlpha(activeStepTheme.accent, 0.1),
                borderColor: withAlpha(activeStepTheme.accent, 0.18),
                color: COLORS.text,
              }}
            >
              {activeEdgeStatus.phase} · {activeEdgeStatus.route}
            </div>
          )}
          {activeEdgeStatus.hopCount !== undefined && activeEdgeStatus.hopCount > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: activeEdgeStatus.hopCount }, (_, hop) => (
                  <span
                    key={hop}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: hop === activeEdgeStatus.hopIndex ? 16 : 8,
                      background: hop <= (activeEdgeStatus.hopIndex ?? -1)
                        ? withAlpha(activeStepTheme.accent, hop === activeEdgeStatus.hopIndex ? 0.95 : 0.5)
                        : withAlpha('#94a3b8', 0.22),
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] tabular-nums" style={{ color: COLORS.textMuted }}>
                hop {(activeEdgeStatus.hopIndex ?? 0) + 1} / {activeEdgeStatus.hopCount}
              </span>
            </div>
          )}
          {activeEdgeStatus.detail && (
            <div className="mt-2 leading-5" style={{ color: COLORS.textDim }}>
              {activeEdgeStatus.detail}
            </div>
          )}
          {activeEdgeStatus.nextUp && (
            <div className="mt-2 flex items-baseline gap-1.5 leading-5">
              <span className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: COLORS.textMuted }}>
                NEXT
              </span>
              <span style={{ color: COLORS.textMuted }}>{activeEdgeStatus.nextUp}</span>
            </div>
          )}
        </div>
        <div className="border-t pt-3" style={{ borderColor: withAlpha(activeStepTheme.accent, 0.18) }}>
          <div className="mb-2 text-[11px] font-semibold tracking-[0.18em]" style={{ color: COLORS.textMuted }}>
            VISUAL SYSTEM
          </div>
          <div className="space-y-1">
            <div>A cycle plays its hops in order: model request, dispatch, tool return, feed back.</div>
            <div>Previous nodes fade out while the next cycle fades in.</div>
            <div>The camera follows the active edge start so playback stays centered.</div>
            {systemEventCountRef.current > 0 && (
              <div style={{ color: COLORS.textMuted }}>
                {systemEventCountRef.current} environment events folded out of the timeline.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
