# Claude Trace Replay

<p align="center">
  <strong>Replay Claude Code traces and understand what actually happened.</strong>
</p>

<p align="center">
  Turn raw Claude Code JSONL traces into a replayable workspace for agent behavior, tool calls, token spikes, session comparison, and post-run analysis.
</p>

<p align="center">
  <a href="https://github.com/harrylettering/claude-trace-replay/stargazers">Star on GitHub</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#feature-highlights">Feature Highlights</a>
  ·
  <a href="#screenshots">Screenshots</a>
  ·
  <a href="#who-its-for">Who It's For</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite 5" />
  <img src="https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
</p>

## Demo
https://github.com/user-attachments/assets/be7374a6-5f6a-4c87-95f5-defe3974f6ea

## Why People Star This

Most Claude Code traces are technically rich and visually painful.

Claude Trace Replay turns `.jsonl` session data into a visual replay and review workspace so you can:

- See what the agent actually did, in order
- Understand which tool calls consumed time and tokens
- Replay agent-to-tool handoffs instead of reading raw event blocks
- Compare two sessions to learn what changed
- Review prompt quality and collaboration patterns after a run

If you use Claude Code seriously, this helps you move from "I captured a trace" to "I know what happened."

## Feature Highlights

- **Agent Flow Replay**: watch the call graph animate step by step around the main agent
- **Current Step Context**: inspect what is happening right now, not just the final output
- **Searchable Timeline**: browse tool calls, thoughts, diffs, file reads, terminal commands, and results
- **Token Analytics**: identify expensive turns and usage spikes fast
- **Session Compare**: diff two runs across messages, tokens, tools, and models
- **AI Retrospective**: surface strengths, weaknesses, and next-step improvements
- **Prompt Review**: inspect prompt and collaboration quality after the fact

## Who It's For

- Developers debugging noisy Claude Code sessions
- People reviewing long agent runs with many tools
- Teams trying to understand why one prompt or workflow worked better than another
- Anyone who wants to learn from real AI coding traces instead of guessing
## Screenshots

### Session Intelligence

| Session Overview | Token Usage |
| --- | --- |
| ![Session Overview](docs/screenshots/session-overview.png) | ![Token Usage](docs/screenshots/token-usage.png) |

| Session Timeline | AI Analysis |
| --- | --- |
| ![Session Timeline](docs/screenshots/session-timeline.png) | ![AI Analysis](docs/screenshots/ai-analysis.png) |

### Flow Visualization

| Conversation Flow | Agent Flow |
| --- | --- |
| ![Conversation Flow](docs/screenshots/conversation-flow.png) | ![Agent Flow Bash Return](docs/screenshots/agent-flow-bash.png) |

| Session Compare | Agent Flow Assistant Return |
| --- | --- |
| ![Session Compare](docs/screenshots/session-compare.png) | ![Agent Flow Assistant Return](docs/screenshots/agent-flow-assistant.png) |

## Quick Start

### Requirements

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/harrylettering/claude-trace-replay.git
cd claude-trace-replay
npm install
```

### Run

```bash
./start.sh
```

Open `http://localhost:3000`.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## First Run

1. Open the app locally.
2. Load a Claude Code `.jsonl` trace.
3. Jump between timeline, token, flow, compare, and analysis views.
4. Find the exact step where the run slowed down, got noisy, or went off track.

## Workspace Views

| View | What You Learn |
| --- | --- |
| Session Overview | High-level stats for tokens, messages, models, duration, and tools |
| Session Timeline | Chronological actions, tool usage, diffs, and results |
| Agent Flow | Animated handoffs between user, main agent, assistant, and tools |
| Conversation Flow | Parent-child structure and message depth |
| Token Usage | Spikes, cost-heavy turns, and usage trends |
| AI Analysis | Retrospective insights and suggested improvements |
| Prompt Optimizer | Prompt quality review and collaboration guidance |
| Session Compare | What changed between two runs |
| Real-Time Log | Raw event stream and trace inspection |

## Why It Exists

Claude Code sessions can become long, tool-heavy, and hard to audit from raw trace data alone.

This project exists to make those sessions reviewable:

- for debugging
- for performance tuning
- for prompt iteration
- for agent workflow learning
- for sharing and comparing runs with others

## Supported Trace Data

Claude Trace Replay is built around Claude Code `.jsonl` session traces.

Typical entry types include:

- `user`
- `assistant`
- `system`
- tool-use and tool-result content blocks
- permission and metadata events
- file history snapshots

Common fields used by the parser include:

- `uuid`
- `parentUuid`
- `timestamp`
- `type`
- `message`
- `isSidechain`
- `isMeta`

## Tech Stack

- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- Recharts
- Framer Motion
- Lucide React
- html2canvas
- Zustand
- XYFlow / React Flow

## Project Structure

```text
claude-trace-replay/
├── docs/
│   └── screenshots/          # README media and product visuals
├── src/
│   ├── components/           # Dashboards and visualization UI
│   ├── hooks/                # Playback and interaction hooks
│   ├── types/                # Domain types
│   ├── utils/                # Trace parsing, analysis, and helper logic
│   ├── App.tsx               # Application shell
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styling
├── package.json
└── README.md
```

## Development

```bash
npm run dev       # Start the Vite development server
npm run build     # Type-check and build for production
npm run preview   # Preview the production build locally
npm run lint      # Run ESLint
```

## Roadmap

- Ship a stronger README hero with a short looping demo
- Add anonymized sample traces so first-time users can explore instantly
- Improve large-session performance and visualization density
- Add more flow layout modes for complex agent chains
- Add export presets for reports and retrospectives

## Contributing

Contributions are welcome.

Good contribution areas:

- parser improvements
- UI polish
- performance work for large traces
- new analysis panels
- sample datasets and reproducible bug cases

If this project helped you understand Claude Code sessions faster, a GitHub Star really helps other people find it.

## License

MIT
