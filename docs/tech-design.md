# Agent Flow Technical Design

This document summarizes the Agent Flow module architecture used by Claude Trace Replay.
The goal of Agent Flow is to make a Claude Code session understandable as a call-and-return workflow: who called whom, which tool ran, what happened, and how control returned to the main agent.

## Goals

- Visualize Claude Code conversations as an animated workflow instead of a static message list.
- Keep `Main Agent` as the central control point.
- Show only the currently relevant scene during playback to avoid visual clutter.
- Explain every step through the `Current Step` panel.
- Support tool-category styling for file, shell, task, agent, planning, network, user-interaction, and system tools.
- Preserve enough static structure for navigation while making playback the primary reading mode.

## High-Level Architecture

```text
ParsedLogData
    |
    v
CanvasBuilder
    |-- normalize trace entries
    |-- extract virtual events
    |-- build nodes and edges
    |-- attach action summaries
    v
AgentCanvasNew
    |-- render canvas scene
    |-- animate active edge particles
    |-- manage camera follow behavior
    |-- render Current Step overlay
    v
Replay Controls
```

## Core Modules

| Module | Responsibility |
| --- | --- |
| `AgentFlowView` | Top-level container for Agent Flow playback. |
| `AgentCanvasNew` | Canvas renderer, playback animation, camera, current-step overlay, and node/edge drawing. |
| `simulation/canvasBuilder.ts` | Converts parsed JSONL data into canvas nodes, edges, step metadata, and action summaries. |
| `simulation/*` | Supporting simulation and graph-building utilities. |
| `AgentCanvas.tsx` / React Flow files | Legacy or alternative implementations kept for reference. |

## Data Model

Agent Flow separates trace structure from visual structure.

### Virtual Events

Virtual events represent ordered semantic steps extracted from Claude Code traces.
They are derived from JSONL entries, message roles, and content blocks such as `text`, `thinking`, `tool_use`, and `tool_result`.

Typical step types include:

- `user_input`
- `agent_receive`
- `thinking`
- `tool_call`
- `tool_result`
- `agent_response`
- `response`

### Canvas Nodes

Canvas nodes are visual entities shown on the graph.

```typescript
type CanvasNodeType =
  | 'user'
  | 'main_agent'
  | 'assistant'
  | 'tool';
```

Important nodes:

- `User`: source of the original request.
- `Main Agent`: central orchestration node.
- `Assistant`: reasoning/model response node.
- `Tool`: concrete Claude Code tools such as `Read`, `Bash`, `Edit`, or `WebSearch`.

### Canvas Edges

Canvas edges represent the active relationship between two nodes.
Each edge includes metadata for the `Current Step` panel.

```typescript
interface CanvasEdgeData {
  type: string;
  actionSummary?: string;
  actionDetail?: string;
  toolName?: string;
}
```

Examples:

- `main agent -> tool:Read`
- `tool:Bash -> main agent`
- `assistant -> main agent`
- `main agent -> user`

## Tool Categorization

Tool nodes are grouped into visual categories so users can understand the workflow faster.

| Category | Tools |
| --- | --- |
| File operations | `Read`, `Write`, `Edit`, `Glob`, `Grep` |
| Terminal / Shell | `Bash` |
| Task management | `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` |
| Agent / Sub-agent | `Agent` |
| Planning / Flow | `EnterPlanMode`, `ExitPlanMode` |
| Network operations | `WebFetch`, `WebSearch` |
| User interaction | `AskUserQuestion` |
| Tool system | `Skill`, `ToolSearch` |

Each category can influence:

- Node shape
- Badge label
- Accent color
- Edge style
- Particle style
- Current Step panel styling

## Playback Model

Agent Flow uses a scene-based playback model.
Instead of rendering every node and edge at full strength, it focuses on the current step and nearby transition.

Key rules:

- `Main Agent` remains visible after it first appears.
- Current scene nodes and edges are emphasized.
- Previous scene elements fade out when control returns to `Main Agent`.
- Next scene elements fade in as the workflow advances.
- The camera follows the active edge start point so the current call stays readable.

This keeps dense sessions readable even when many tools are used.

## Current Step Panel

The `Current Step` panel is the narrative layer for Agent Flow.
It should answer three questions:

1. Who called whom?
2. What action happened?
3. What does this step mean in the workflow?

Example:

```text
tool:Bash -> main agent

Result from Bash: npm run build -> exit 0

Bash returns output to Main Agent.
```

The panel is intentionally independent from the canvas transform so it remains visible during panning and playback.

## Action Summary Generation

`CanvasBuilder` generates lightweight action summaries for tool calls and tool results.
Summaries must be short enough for UI display and must not include long raw outputs.

Examples:

- `Read src/App.tsx -> 218 lines`
- `Bash npm run build -> exit 0`
- `Glob src/**/*.tsx -> 14 files`
- `Grep useEffect in src -> 6 hits`
- `WebSearch react compiler -> 8 results`

For large or unknown results, summaries should fall back to a compact description such as:

- `Result from Read`
- `Object result with 4 keys`
- `Array result with 12 items`
- `error`

## Rendering Strategy

The primary renderer uses Canvas 2D because it allows fine-grained control over:

- Custom node shapes
- Particle motion
- Edge glow and arrowheads
- Scene fade transitions
- Camera transforms
- Background grid and ambient effects

React remains responsible for surrounding UI controls, panels, and layout.

## Layout Strategy

The layout is deterministic rather than force-directed.
This avoids jitter across replays and makes screenshots reproducible.

General lanes:

- User input
- Main Agent
- Reasoning / Assistant
- Tooling

Tool placement uses call order and category hints so tools from the same local workflow stay near each other without displaying every tool at full opacity during playback.

## Known Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Large sessions can produce many nodes and edges | Visual clutter and lower frame rate | Scene-based rendering and deterministic clustering |
| Edge endpoints can look imprecise on custom shapes | Lower visual trust | Shape-aware anchor calculation and conservative edge offsets |
| Tool outputs can be very large | UI noise and performance cost | Summary-only rendering |
| Trace schemas may evolve | Missed steps or incorrect labels | Keep parser logic block-aware and tolerant of unknown content types |

## Future Improvements

- Add a short README hero GIF for Agent Flow playback.
- Add sample anonymized JSONL traces for demos and regression testing.
- Add parser fixtures for `tool_use`, `tool_result`, and mixed content blocks.
- Add visual regression screenshots for dense tool sessions.
- Add more layout modes for very large sessions.
