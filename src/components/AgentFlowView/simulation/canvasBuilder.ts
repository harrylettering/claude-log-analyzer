/**
 * CanvasBuilder - TypeScript implementation of Python build_call_graph.py
 *
 * Parses log entries and builds canvas nodes (SubNode) and edges (CallLink).
 * Canvas node unique identifier is entity_id.
 * Canvas edge connects source entity_id to target entity_id.
 */

import type { LogEntry } from '../../../types/log'
import { compactPaths } from '../lib/pathText'

// ─── Entity ID Constants ────────────────────────────────────────────────────────

export const ENTITY_ID = {
  USER: '0',
  MAIN_AGENT: '1',
  ASSISTANT: '2',
} as const

// ─── Enums ─────────────────────────────────────────────────────────────────────

enum Role {
  ASSISTANT = 'assistant',
  USER = 'user',
  SYSTEM = 'system',
  ATTACHMENT = 'attachment',
  UNKNOWN = 'unknown',
}

enum ContentType {
  TEXT = 'text',
  THINKING = 'thinking',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface CanvasNode {
  entityId: string
  entityType: 'user' | 'main_agent' | 'assistant' | 'tool'
  displayName: string
  x: number
  y: number
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  linkType: string
  actionSummary?: string
  actionDetail?: string
}

export interface VirtualNode {
  uuid: string
  role: Role
  contentType: ContentType
  toolName?: string
  parentUuid: string | null
  subNodes: CanvasNode[]
  callLinks: CanvasEdge[]
}

export type FlowCycleKind = 'user_input' | 'thinking' | 'tool_call' | 'response' | 'other'

/**
 * 一个回合 = trace 里一件完整的事，内部是有序的若干跳。
 * 工具调用回合有 4 跳：模型请求 → harness 派发 → 工具返回 → 结果回灌。
 * 这样时间轴按回合推进，既保留 4 跳的执行逻辑，又不会把一次调用摊成 4 个步骤。
 */
export interface FlowCycle {
  id: string
  kind: FlowCycleKind
  title: string
  toolName?: string
  hops: CanvasEdge[]
  entryUuids: string[]
  startedAt?: string
  endedAt?: string
  isError?: boolean
}

/** 没有语义的环境事件（attachment / system），不进时间轴，只做计数与刻度。 */
export interface SystemEvent {
  uuid: string
  kind: string
  timestamp?: string
  label: string
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

function parseContentType(item: Record<string, unknown>): { contentType: ContentType; toolName?: string } {
  const type = item.type as string
  switch (type) {
    case 'text': return { contentType: ContentType.TEXT }
    case 'thinking': return { contentType: ContentType.THINKING }
    case 'tool_use': return { contentType: ContentType.TOOL_USE, toolName: (item.name as string) || 'text' }
    case 'tool_result': return { contentType: ContentType.TOOL_RESULT }
    case 'image': return { contentType: ContentType.IMAGE }
    default: return { contentType: ContentType.UNKNOWN }
  }
}

function parseRole(entry: LogEntry): Role {
  if (entry.type === 'user') return Role.USER
  if (entry.type === 'assistant') return Role.ASSISTANT
  if (entry.type === 'system') return Role.SYSTEM
  if (entry.type === 'attachment') return Role.ATTACHMENT

  const msgRole = entry.message?.role
  if (msgRole === 'user') return Role.USER
  if (msgRole === 'assistant') return Role.ASSISTANT
  if (msgRole === 'system') return Role.SYSTEM
  return Role.UNKNOWN
}

function truncateText(value: unknown, maxLength = 84): string {
  if (value === undefined || value === null) return ''
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  // 先把长路径压成 …/父目录/文件名，再截断，避免截掉最有信息量的文件名
  const singleLine = compactPaths(raw.replace(/\s+/g, ' ').trim())
  if (!singleLine) return ''
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}…` : singleLine
}

function summarizeToolInput(toolName: string | undefined, input: Record<string, unknown> | undefined): string {
  const name = (toolName || 'tool').toLowerCase()
  const payload = input || {}
  const path = truncateText(payload.file_path ?? payload.path ?? payload.dir ?? payload.cwd ?? payload.destination ?? payload.to, 64)
  const pattern = truncateText(payload.pattern ?? payload.query ?? payload.regex, 56)
  const command = truncateText(payload.command ?? payload.script ?? payload.cmd, 72)
  const subject = truncateText(payload.subject ?? payload.activeForm ?? payload.taskId ?? payload.id, 64)
  const url = truncateText(payload.url, 72)
  const question = truncateText(payload.question ?? payload.prompt ?? payload.message, 72)
  const skillName = truncateText(payload.skill ?? payload.name ?? payload.query, 64)

  if (name === 'read') return path ? `Read ${path}` : 'Read file contents'
  if (name === 'write') return path ? `Write ${path}` : 'Write file contents'
  if (name === 'edit' || name.includes('edit')) return path ? `Edit ${path}` : 'Edit file contents'
  if (name === 'glob') return pattern ? `Glob ${pattern}` : 'Find matching files'
  if (name === 'grep') return pattern ? `Grep ${pattern}${path ? ` in ${path}` : ''}` : 'Search file contents'
  if (name === 'bash') return command ? `Bash ${command}` : 'Run terminal command'
  if (name === 'taskcreate') return subject ? `Create task: ${subject}` : 'Create task'
  if (name === 'taskget') return subject ? `Inspect task ${subject}` : 'Get task details'
  if (name === 'tasklist') return 'List tasks'
  if (name === 'taskupdate') {
    const status = truncateText(payload.status, 24)
    return subject || status ? `Update task ${subject || ''}${subject && status ? ' -> ' : ''}${status || ''}`.trim() : 'Update task'
  }
  if (name === 'agent') return question ? `Spawn agent: ${question}` : subject ? `Spawn agent: ${subject}` : 'Spawn sub-agent'
  if (name === 'enterplanmode') return 'Enter plan mode'
  if (name === 'exitplanmode') return 'Exit plan mode'
  if (name === 'webfetch') return url ? `Fetch ${url}` : 'Fetch web page'
  if (name === 'websearch') return pattern ? `Search ${pattern}` : 'Search the web'
  if (name === 'askuserquestion') return question ? `Ask user: ${question}` : 'Ask user question'
  if (name === 'skill') return skillName ? `Use skill: ${skillName}` : 'Use skill'
  if (name === 'toolsearch') return pattern ? `Find tool: ${pattern}` : 'Search tools'

  const firstMeaningful = [command, path, pattern, url, subject, question, skillName].find(Boolean)
  if (firstMeaningful) return `${toolName || 'Tool'} ${firstMeaningful}`

  const firstEntries = Object.entries(payload).slice(0, 2)
  if (firstEntries.length > 0) {
    return `${toolName || 'Tool'} ${truncateText(firstEntries.map(([key, value]) => `${key}: ${truncateText(value, 28)}`).join(', '), 84)}`
  }

  return toolName || 'Run tool'
}

function summarizeToolResult(toolName: string | undefined, item: Record<string, unknown> | null): string {
  if (!item) return `Receive ${toolName || 'tool'} result`
  const result = item.content
  const resultText = truncateText(result, 88)
  const prefix = item.is_error ? `Error from ${toolName || 'tool'}` : `Result from ${toolName || 'tool'}`
  return resultText ? `${prefix}: ${resultText}` : prefix
}

function summarizeMessageContent(contentType: ContentType, item: Record<string, unknown> | null): string {
  if (!item) return ''
  if (contentType === ContentType.THINKING) return truncateText(item.thinking, 88) || 'Reason about next step'
  if (contentType === ContentType.TEXT) return truncateText(item.text, 88) || 'Process message text'
  if (contentType === ContentType.IMAGE) return 'Handle image content'
  return ''
}

const CYCLE_FALLBACK_TITLE: Record<FlowCycleKind, string> = {
  user_input: 'User request',
  thinking: 'Model reasoning',
  tool_call: 'Tool call',
  response: 'Response to user',
  other: 'Agent event',
}

// ─── CanvasBuilder Class ───────────────────────────────────────────────────────

export class CanvasBuilder {
  private virtualNodes: Map<string, VirtualNode> = new Map()
  private canvasNodes: Map<string, CanvasNode> = new Map()  // entityId -> CanvasNode
  private canvasEdges: Map<string, CanvasEdge> = new Map()  // id -> CanvasEdge
  private layers: { level: number; nodes: VirtualNode[] }[] = []
  // 工具名称映射：tool_id -> tool_name（用于处理 tool_result 时获取工具名）
  private toolNames: Map<string, string> = new Map()
  private toolOrder: Map<string, number> = new Map()
  private toolSequence = 0
  private edgeSequence = 0
  private cycles: FlowCycle[] = []
  private pendingToolCycles: Map<string, FlowCycle> = new Map()
  private systemEvents: SystemEvent[] = []

  /**
   * Build canvas graph from log entries
   */
  buildCanvasGraph(entries: LogEntry[]): void {
    this.buildNodes(entries)
    this.registerCycleEdges()
    this.buildLayers()
  }

  /** 只有属于某个回合的跳才是画布上的边；环境事件与被抹掉的推理不进图。 */
  private registerCycleEdges(): void {
    for (const cycle of this.cycles) {
      for (const hop of cycle.hops) {
        this.canvasEdges.set(hop.id, hop)
      }
    }
  }

  /**
   * Build virtual nodes from entries
   * Matches Python build_nodes logic:
   * 1. If content is string → creates TEXT node with user input links
   * 2. If content is list → takes first element only, creates node based on that
   * 3. If content is empty → creates UNKNOWN node
   */
  private buildNodes(entries: LogEntry[]): void {
    for (const entry of entries) {
      const uuid = entry.uuid
      if (!uuid) continue  // Skip entries without uuid

      const message = entry.message
      const content = message?.content

      const role = parseRole(entry)

      let contentType: ContentType = ContentType.UNKNOWN
      let toolName: string | undefined
      let item: Record<string, unknown> | null = null
      let virtualNode: VirtualNode | null = null

      // Case 1: content is string (user input)
      if (typeof content === 'string') {
        contentType = ContentType.TEXT
        item = { type: 'text', text: content }
        virtualNode = this.createVirtualNode(entry, role, contentType, undefined, item)
      }
      // Case 2: content is non-empty list - take first element only
      else if (Array.isArray(content) && content.length > 0) {
        const firstItem = content[0]
        if (typeof firstItem === 'object' && firstItem !== null) {
          const parsed = parseContentType(firstItem as Record<string, unknown>)
          contentType = parsed.contentType
          toolName = parsed.toolName
          item = firstItem as Record<string, unknown>

          // 记录 tool_id -> tool_name 映射（用于 tool_result 时获取工具名）
          if (contentType === ContentType.TOOL_USE && toolName) {
            const toolId = (item as Record<string, unknown>).id as string
            if (toolId) {
              this.toolNames.set(toolId, toolName)
              if (!this.toolOrder.has(toolId)) {
                this.toolOrder.set(toolId, this.toolSequence++)
              }
            }
          }

          // 从映射获取工具名称（处理异步情况）
          if (contentType === ContentType.TOOL_USE && item) {
            const toolId = item.id as string
            if (toolId && this.toolNames.has(toolId)) {
              toolName = this.toolNames.get(toolId)
            }
          }

          virtualNode = this.createVirtualNode(entry, role, contentType, toolName, item)
        }
      }
      // Case 3: content is empty (None, [], "") - create UNKNOWN node
      else {
        // Fallback toolName from entry.type
        const fallbackToolName = entry.type || 'unknown'
        virtualNode = this.createVirtualNode(entry, role, ContentType.UNKNOWN, fallbackToolName, null)
      }

      if (virtualNode) {
        this.virtualNodes.set(virtualNode.uuid, virtualNode)

        // Register canvas nodes and edges
        for (const node of virtualNode.subNodes) {
          if (!this.canvasNodes.has(node.entityId)) {
            this.canvasNodes.set(node.entityId, node)
          }
        }

        this.collectCycle(entry, virtualNode, role, contentType, item, toolName)
      }
    }
  }

  /**
   * Create a virtual node with sub_nodes and call_links
   */
  private createVirtualNode(
    entry: LogEntry,
    role: Role,
    contentType: ContentType,
    toolName: string | undefined,
    item: Record<string, unknown> | null
  ): VirtualNode {
    const subNodes: CanvasNode[] = []
    const callLinks: CanvasEdge[] = []
    const messageSummary = summarizeMessageContent(contentType, item)

    // Build sub_nodes and call_links based on role and contentType
    switch (role) {
      case Role.ASSISTANT:
        if (contentType === ContentType.THINKING) {
          // assistant self-loop
          const sub = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          subNodes.push(sub)
          callLinks.push(this.makeEdge(
            ENTITY_ID.ASSISTANT,
            ENTITY_ID.ASSISTANT,
            'thinking',
            messageSummary || 'Reason about the next step',
            'Assistant is internally reasoning before the next action.'
          ))
        } else if (contentType === ContentType.TOOL_USE && item) {
          const toolId = item.id as string
          const toolAction = summarizeToolInput(toolName, (item.input ?? {}) as Record<string, unknown>)
          const subA = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          const subMa = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          const subT = this.makeNode('tool', toolId, `tool:${toolName}`)
          subNodes.push(subA, subMa, subT)
          callLinks.push(this.makeEdge(
            ENTITY_ID.ASSISTANT,
            ENTITY_ID.MAIN_AGENT,
            'agent_call',
            toolAction,
            `Assistant hands ${toolName || 'tool'} orchestration back to Main Agent.`
          ))
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            toolId,
            'tool_call',
            toolAction,
            `Main Agent dispatches ${toolName || 'tool'} to perform the requested action.`
          ))
        } else if (contentType === ContentType.TEXT) {
          const subA = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          const subMa = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          const subU = this.makeNode('user', ENTITY_ID.USER, 'user')
          subNodes.push(subA, subMa, subU)
          // assistant 回复 user：先 assistant → main_agent (agent_response)
          callLinks.push(this.makeEdge(
            ENTITY_ID.ASSISTANT,
            ENTITY_ID.MAIN_AGENT,
            'agent_response',
            messageSummary || 'Prepare final response',
            'Assistant packages the reply and hands it to Main Agent.'
          ))
          // 再 main_agent → user (response)
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            ENTITY_ID.USER,
            'response',
            messageSummary || 'Return result to user',
            'Main Agent returns the result to the user.'
          ))
        } else if (contentType === ContentType.IMAGE) {
          // assistant 图片回复，与 TEXT 相同处理
          const subA = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          const subMa = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          const subU = this.makeNode('user', ENTITY_ID.USER, 'user')
          subNodes.push(subA, subMa, subU)
          callLinks.push(this.makeEdge(
            ENTITY_ID.ASSISTANT,
            ENTITY_ID.MAIN_AGENT,
            'agent_response',
            'Prepare image response',
            'Assistant packages image output and hands it to Main Agent.'
          ))
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            ENTITY_ID.USER,
            'response',
            'Deliver image response',
            'Main Agent returns the image result to the user.'
          ))
        } else {
          // 其他未匹配情况：创建 main_agent 自引用，link_type 为角色值
          const subM = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          subNodes.push(subM)
          // role 是字符串枚举值
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            ENTITY_ID.MAIN_AGENT,
            `${role}`,
            'Process assistant event',
            'Main Agent processes an assistant-side event.'
          ))
        }
        break

      case Role.USER:
        if (contentType === ContentType.TOOL_RESULT && item) {
          const toolUseId = item.tool_use_id as string
          // 从 toolNames Map 获取工具名称（处理异步情况）
          const resolvedToolName = this.toolNames.get(toolUseId) || toolName || 'unknown'
          const toolResultSummary = summarizeToolResult(resolvedToolName, item)
          const subT = this.makeNode('tool', toolUseId, `tool:${resolvedToolName}`)
          const subMa = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          const subA = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          subNodes.push(subT, subMa, subA)
          // 工具结果返回：tool → main_agent (tool_result)
          callLinks.push(this.makeEdge(
            toolUseId,
            ENTITY_ID.MAIN_AGENT,
            'tool_result',
            toolResultSummary,
            `${resolvedToolName} returns output to Main Agent.`
          ))
          // main_agent 结果返回 assistant：main_agent → assistant (agent_result)
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            ENTITY_ID.ASSISTANT,
            'agent_result',
            toolResultSummary,
            'Main Agent forwards the tool result back into reasoning.'
          ))
        } else if (contentType === ContentType.TEXT || contentType === ContentType.IMAGE) {
          const subU = this.makeNode('user', ENTITY_ID.USER, 'user')
          const subMa = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
          const subA = this.makeNode('assistant', ENTITY_ID.ASSISTANT, 'assistant')
          subNodes.push(subU, subMa, subA)
          // 用户输入：user → main_agent (user_input)
          callLinks.push(this.makeEdge(
            ENTITY_ID.USER,
            ENTITY_ID.MAIN_AGENT,
            'user_input',
            messageSummary || 'Send user request',
            'User request enters the main agent pipeline.'
          ))
          // main_agent 接收：main_agent → assistant (agent_receive)
          callLinks.push(this.makeEdge(
            ENTITY_ID.MAIN_AGENT,
            ENTITY_ID.ASSISTANT,
            'agent_receive',
            messageSummary || 'Forward request to reasoning',
            'Main Agent forwards input into the reasoning stage.'
          ))
        }
        break

      case Role.UNKNOWN:
        // For UNKNOWN content type, create a placeholder node
        if (contentType === ContentType.UNKNOWN) {
          // Just create empty node
        }
        break

      case Role.ATTACHMENT:
      case Role.SYSTEM:
        // attachment 和 system 类型：创建 main_agent 自引用
        const subM = this.makeNode('main_agent', ENTITY_ID.MAIN_AGENT, 'main agent')
        subNodes.push(subM)
        callLinks.push(this.makeEdge(
          ENTITY_ID.MAIN_AGENT,
          ENTITY_ID.MAIN_AGENT,
          `${role}`,
          'Process system event',
          'Main Agent processes an environment or system event.'
        ))
        break
    }

    return {
      uuid: entry.uuid || `uuid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      role,
      contentType,
      toolName,
      parentUuid: entry.parentUuid || null,
      subNodes,
      callLinks,
    }
  }

  /**
   * 把一条 entry 归入一个回合。工具调用的后两跳（工具返回、结果回灌）会追加到
   * 发起它的那个回合上，靠 tool_use_id 配对。
   */
  private collectCycle(
    entry: LogEntry,
    virtualNode: VirtualNode,
    role: Role,
    contentType: ContentType,
    item: Record<string, unknown> | null,
    toolName: string | undefined
  ): void {
    const timestamp = entry.timestamp
    const uuid = virtualNode.uuid

    if (role === Role.ATTACHMENT || role === Role.SYSTEM) {
      this.systemEvents.push({
        uuid,
        kind: entry.type || `${role}`,
        timestamp,
        label: role === Role.SYSTEM ? 'System event' : 'Context attachment',
      })
      return
    }

    if (virtualNode.callLinks.length === 0) return

    // Claude Code 会把 thinking 内容抹掉只留 signature。没有文本的推理块不值得
    // 占一个回合（否则是几十个一模一样的自环），只记成标记；有文本的照常成为回合。
    if (role === Role.ASSISTANT && contentType === ContentType.THINKING) {
      const thinkingText = typeof item?.thinking === 'string' ? item.thinking.trim() : ''
      if (!thinkingText) {
        this.systemEvents.push({
          uuid,
          kind: 'thinking',
          timestamp,
          label: 'Model reasoning (content not recorded)',
        })
        return
      }
    }

    if (role === Role.USER && contentType === ContentType.TOOL_RESULT && item) {
      const toolUseId = item.tool_use_id as string
      const pending = this.pendingToolCycles.get(toolUseId)
      if (pending) {
        pending.hops.push(...virtualNode.callLinks)
        pending.entryUuids.push(uuid)
        pending.endedAt = timestamp
        pending.isError = Boolean(item.is_error)
        this.pendingToolCycles.delete(toolUseId)
        return
      }
    }

    const firstSummary = virtualNode.callLinks[0]?.actionSummary
    const kind: FlowCycleKind =
      role === Role.ASSISTANT && contentType === ContentType.THINKING
        ? 'thinking'
        : role === Role.ASSISTANT && contentType === ContentType.TOOL_USE
          ? 'tool_call'
          : role === Role.ASSISTANT && (contentType === ContentType.TEXT || contentType === ContentType.IMAGE)
            ? 'response'
            : role === Role.USER && (contentType === ContentType.TEXT || contentType === ContentType.IMAGE)
              ? 'user_input'
              : role === Role.USER && contentType === ContentType.TOOL_RESULT
                ? 'tool_call'
                : 'other'

    const cycle: FlowCycle = {
      id: uuid,
      kind,
      title: firstSummary || CYCLE_FALLBACK_TITLE[kind],
      toolName: kind === 'tool_call' ? toolName ?? this.toolNames.get((item?.tool_use_id as string) ?? '') : undefined,
      hops: [...virtualNode.callLinks],
      entryUuids: [uuid],
      startedAt: timestamp,
      endedAt: kind === 'tool_call' ? undefined : timestamp,
    }
    this.cycles.push(cycle)

    if (kind === 'tool_call' && contentType === ContentType.TOOL_USE && item) {
      const toolId = item.id as string
      if (toolId) this.pendingToolCycles.set(toolId, cycle)
    }
  }

  private makeNode(entityType: CanvasNode['entityType'], entityId: string, displayName: string): CanvasNode {
    return { entityType, entityId, displayName, x: 0, y: 0 }
  }

  private makeEdge(
    source: string,
    target: string,
    linkType: string,
    actionSummary?: string,
    actionDetail?: string
  ): CanvasEdge {
    // id 必须每跳唯一：`${source}-${target}` 会让 assistant/main agent/user 之间的边
    // 在整条 trace 里只剩一条，43 次交接会被压成 1 次。
    return { id: `${source}-${target}#${this.edgeSequence++}`, source, target, linkType, actionSummary, actionDetail }
  }

  /**
   * Build layers by breadth-first traversal of parentUuid tree
   */
  private buildLayers(): void {
    this.layers = []

    const rootNodes: VirtualNode[] = []
    const childNodes: VirtualNode[] = []

    for (const node of this.virtualNodes.values()) {
      if (!node.parentUuid || !this.virtualNodes.has(node.parentUuid)) {
        rootNodes.push(node)
      } else {
        childNodes.push(node)
      }
    }

    if (rootNodes.length === 0 && childNodes.length > 0) {
      rootNodes.push(childNodes.shift()!)
    }

    this.layers.push({ level: 0, nodes: [...rootNodes] })
    const processed = new Set<string>(rootNodes.map(n => n.uuid))

    let currentLevelNodes = rootNodes
    let level = 1

    while (true) {
      const nextLevelNodes: VirtualNode[] = []
      const currentParentUuids = new Set<string>(currentLevelNodes.map(n => n.uuid))

      for (const node of childNodes) {
        if (!processed.has(node.uuid) && node.parentUuid && currentParentUuids.has(node.parentUuid)) {
          nextLevelNodes.push(node)
          processed.add(node.uuid)
        }
      }

      if (nextLevelNodes.length === 0) break

      this.layers.push({ level, nodes: nextLevelNodes })
      currentLevelNodes = nextLevelNodes
      level++
    }

    // Add remaining unprocessed nodes
    for (const node of childNodes) {
      if (!processed.has(node.uuid)) {
        this.layers.push({ level, nodes: [node] })
        processed.add(node.uuid)
        level++
      }
    }
  }

  /**
   * Initialize positions for canvas nodes
   * Deterministic lane layout:
   * - User, main agent, and assistant occupy stable anchor positions
   * - Tools are grouped by category and stacked in right-hand columns
   * - No random jitter, so the same log always produces the same view
   */
  initializePositions(canvasWidth: number, canvasHeight: number): void {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const topInset = 96
    const bottomInset = 96
    const availableHeight = Math.max(320, canvasHeight - topInset - bottomInset)

    const userNode = this.canvasNodes.get(ENTITY_ID.USER)
    const mainAgentNode = this.canvasNodes.get(ENTITY_ID.MAIN_AGENT)
    const assistantNode = this.canvasNodes.get(ENTITY_ID.ASSISTANT)

    if (userNode) {
      userNode.x = clamp(centerX - 320, 120, canvasWidth - 480)
      userNode.y = centerY
    }

    if (mainAgentNode) {
      mainAgentNode.x = centerX - 70
      mainAgentNode.y = centerY
    }

    if (assistantNode) {
      assistantNode.x = centerX + 120
      assistantNode.y = centerY - 124
    }

    const toolNodes: CanvasNode[] = []
    this.canvasNodes.forEach((node) => {
      if (node.entityType === 'tool') {
        toolNodes.push(node)
      }
    })

    if (toolNodes.length === 0) return

    const getToolCategory = (displayName: string) => {
      const name = displayName.toLowerCase()
      if (name.includes('bash') || name.includes('terminal') || name.includes('shell')) return 'terminal'
      if (name.includes('read') || name.includes('write') || name.includes('edit') || name.includes('file') || name.includes('glob')) return 'file'
      if (name.includes('fetch') || name.includes('network') || name.includes('browser') || name.includes('search')) return 'network'
      if (name.includes('mcp') || name.includes('server')) return 'mcp'
      if (name.includes('database') || name.includes('sql') || name.includes('db')) return 'database'
      if (name.includes('agent') || name.includes('task') || name.includes('spawn')) return 'task'
      return 'generic'
    }

    const categoryOffset: Record<string, number> = {
      task: -56,
      terminal: -28,
      file: 0,
      network: 28,
      mcp: 56,
      database: 84,
      generic: 112,
    }
    const baseX = clamp(centerX + 320, 500, Math.max(500, canvasWidth - 300))
    const clusterGap = 168
    const rowGap = 96
    const maxOrder = Math.max(1, toolNodes.length - 1)

    const toolAnchors = new Map<string, { order: number; layer: number }>()
    for (const layer of this.layers) {
      for (const vNode of layer.nodes) {
        for (const link of vNode.callLinks) {
          const toolId =
            this.canvasNodes.get(link.target)?.entityType === 'tool'
              ? link.target
              : this.canvasNodes.get(link.source)?.entityType === 'tool'
                ? link.source
                : null

          if (!toolId || toolAnchors.has(toolId)) continue
          toolAnchors.set(toolId, {
            order: this.toolOrder.get(toolId) ?? toolAnchors.size,
            layer: layer.level,
          })
        }
      }
    }

    const maxLayer = Math.max(1, ...this.layers.map((layer) => layer.level))

    toolNodes
      .slice()
      .sort((a, b) => (this.toolOrder.get(a.entityId) ?? 0) - (this.toolOrder.get(b.entityId) ?? 0))
      .forEach((node, index) => {
        const category = getToolCategory(node.displayName)
        const anchor = toolAnchors.get(node.entityId) ?? { order: index, layer: 0 }
        const normalizedOrder = anchor.order / maxOrder
        const layerBias = anchor.layer / maxLayer
        const clusterIndex = Math.min(2, Math.floor(normalizedOrder * 3))
        const columnX = baseX + clusterIndex * clusterGap + (categoryOffset[category] ?? 0)
        const laneY = topInset + availableHeight * (normalizedOrder * 0.78 + layerBias * 0.12)
        const withinClusterIndex = toolNodes
          .filter((candidate) => {
            const candidateAnchor = toolAnchors.get(candidate.entityId) ?? { order: 0, layer: 0 }
            const candidateCluster = Math.min(2, Math.floor((candidateAnchor.order / maxOrder) * 3))
            return candidateCluster === clusterIndex && getToolCategory(candidate.displayName) === category
          })
          .sort((a, b) => (this.toolOrder.get(a.entityId) ?? 0) - (this.toolOrder.get(b.entityId) ?? 0))
          .findIndex((candidate) => candidate.entityId === node.entityId)

        node.x = columnX
        node.y = clamp(laneY + withinClusterIndex * rowGap * 0.36, topInset, topInset + availableHeight)
      })
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  getCanvasNodes(): Map<string, CanvasNode> {
    return this.canvasNodes
  }

  getCanvasEdges(): Map<string, CanvasEdge> {
    return this.canvasEdges
  }

  getLayers(): { level: number; nodes: VirtualNode[] }[] {
    return this.layers
  }

  /** 时间轴的唯一来源：按文件顺序（即时间顺序）排好的回合列表。 */
  getCycles(): FlowCycle[] {
    return this.cycles
  }

  getSystemEvents(): SystemEvent[] {
    return this.systemEvents
  }

  getVirtualNodes(): Map<string, VirtualNode> {
    return this.virtualNodes
  }
}
