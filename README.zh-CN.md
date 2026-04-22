# Claude Trace Replay

[English](./README.md) | [简体中文](./README.zh-CN.md)

<p align="center">
  <strong>面向 Claude Code 的开源 trace viewer 与可观测性工作台。</strong>
</p>

<p align="center">
  把 Claude Code <code>.jsonl</code> traces 变成可回放、可分析的可视化工作台，用来查看 agent 流程、工具调用、token 波动、会话差异，以及一次运行里到底发生了什么。
</p>

<p align="center">
  <a href="https://github.com/harrylettering/claude-trace-replay/stargazers">GitHub Star</a>
  ·
  <a href="#demo">观看 Demo</a>
  ·
  <a href="#quick-start">快速开始</a>
  ·
  <a href="#use-cases">使用场景</a>
  ·
  <a href="#feature-highlights">核心能力</a>
  ·
  <a href="#screenshots">界面截图</a>
  ·
  <a href="#who-its-for">适合谁</a>
</p>

<p align="center">
  <a href="https://github.com/harrylettering/claude-trace-replay/stargazers"><img src="https://img.shields.io/github/stars/harrylettering/claude-trace-replay?style=flat-square" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/Claude%20Code-Traces-black" alt="Claude Code Traces" />
  <img src="https://img.shields.io/badge/JSONL-Viewer-1f6feb" alt="JSONL Viewer" />
  <img src="https://img.shields.io/badge/AI%20Agent-Observability-0f766e" alt="AI Agent Observability" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
</p>


<a id="demo"></a>

## Demo

90 秒产品演示：

https://github.com/user-attachments/assets/be7374a6-5f6a-4c87-95f5-defe3974f6ea

## 一句话介绍

Claude Trace Replay 是一个面向 Claude Code 的开源 trace viewer，它把原始 `.jsonl` 会话变成可回放的调试、可观测性与 prompt 复盘工作台。

## 为什么值得关注

Claude Code 的 traces 信息量很大，但直接读原始 JSONL 通常既费眼也费脑。

Claude Trace Replay 会把原始会话日志变成可视化回放与调试空间，帮助你：

- 按顺序看清 agent 实际做了什么
- 找出哪些工具调用消耗了时间、token 和注意力
- 用回放方式理解 agent 与工具之间的交互，而不是硬啃原始事件块
- 对比两次会话，理解 prompt、模型或工作流到底哪里变了
- 在运行结束后复盘 prompt 质量和协作模式

如果你经常使用 Claude Code，它能帮你从“我抓到一份 trace”走到“我知道发生了什么”。

<a id="use-cases"></a>

## 使用场景

- **排查复杂 agent 运行**：快速定位哪一步开始变慢、打转或偏航
- **检查工具调用行为**：按执行顺序查看文件读取、diff、终端命令和工具结果
- **复盘 token 使用**：识别高消耗轮次和异常峰值，避免问题变成常态
- **对比 prompt 或模型调整**：看清为什么这次 Claude Code 会话比上次更好或更差
- **向团队分享经验**：把难读的原始 trace 变成大家都能一起讨论的可视化工作台

<a id="feature-highlights"></a>

## 核心能力

- **Agent Flow Replay**：按时间顺序动态回放主 agent 与各工具之间的调用链
- **Current Step Context**：聚焦当前步骤，而不只是最后结果
- **Searchable Timeline**：检索工具调用、思考内容、diff、文件读取、终端命令和执行结果
- **Token Analytics**：快速识别高消耗轮次和 token 峰值
- **Session Compare**：对比两次运行中的消息、token、工具和模型差异
- **AI Retrospective**：生成一轮运行后的优点、问题和改进建议
- **Prompt Review**：复盘 prompt 质量和协作方式

<a id="who-its-for"></a>

## 适合谁

- 需要排查复杂 Claude Code 会话的开发者
- 需要复盘长链路 agent 运行过程的人
- 想理解为什么某个 prompt 或工作流效果更好的团队
- 想从真实 AI 编码 traces 中总结经验的人

<a id="screenshots"></a>

## 界面截图

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

准备一份你自己的 Claude Code `.jsonl` trace，几分钟内就能在本地跑起来。

### 环境要求

- Node.js 18+
- npm

### 安装

```bash
git clone https://github.com/harrylettering/claude-trace-replay.git
cd claude-trace-replay
npm install
```

### 运行

```bash
./start.sh
```

打开 `http://localhost:3000`。

### 构建

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 首次使用

1. 在本地打开应用。
2. 加载一份 Claude Code `.jsonl` trace。
3. 在 timeline、token、flow、compare 和 analysis 视图之间切换。
4. 找出运行变慢、变乱或偏航的具体步骤。

提示：如果你准备分享这个项目，用真实 trace 录一段前后对比短视频，通常比单纯放截图更容易让别人秒懂价值。

## Workspace Views

| 视图 | 你能看到什么 |
| --- | --- |
| Session Overview | token、消息数、模型、时长和工具的整体统计 |
| Session Timeline | 按时间顺序查看操作、工具使用、diff 和结果 |
| Agent Flow | 动态回放 user、主 agent、assistant 与工具之间的交互 |
| Conversation Flow | 查看消息树结构和对话深度 |
| Token Usage | 查看 token 峰值、高成本轮次和趋势变化 |
| AI Analysis | 查看复盘结论和改进建议 |
| Prompt Optimizer | 查看 prompt 质量与协作建议 |
| Session Compare | 对比两次运行的差异 |
| Real-Time Log | 查看原始事件流和 trace 明细 |

## 为什么会做这个项目

Claude Code 会话往往很长、工具很多，只看原始 trace 数据很难复盘。

这个项目就是为了让这些会话更容易被理解和复查：

- 用于调试
- 用于性能优化
- 用于 prompt 迭代
- 用于 agent 工作流学习
- 用于和他人分享、对比运行结果

## 支持的 Trace 数据

Claude Trace Replay 主要围绕 Claude Code `.jsonl` 会话 traces 构建。

常见条目类型包括：

- `user`
- `assistant`
- `system`
- tool-use 和 tool-result 内容块
- permission 和 metadata 事件
- 文件历史快照

解析器会使用的一些常见字段包括：

- `uuid`
- `parentUuid`
- `timestamp`
- `type`
- `message`
- `isSidechain`
- `isMeta`

## 技术栈

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

## 项目结构

```text
claude-trace-replay/
├── docs/
│   └── screenshots/          # README 媒体资源和产品截图
├── src/
│   ├── components/           # 仪表盘和可视化 UI
│   ├── hooks/                # 回放和交互 hooks
│   ├── types/                # 领域类型
│   ├── utils/                # Trace 解析、分析和辅助工具
│   ├── App.tsx               # 应用壳层
│   ├── main.tsx              # 入口文件
│   └── index.css             # 全局样式
├── package.json
└── README.md
```

## 开发

```bash
npm run dev       # 启动 Vite 开发服务器
npm run build     # 类型检查并构建生产包
npm run preview   # 本地预览生产构建
npm run lint      # 运行 ESLint
```

## Roadmap

- 加入匿名 sample traces，方便第一次使用的人直接探索
- 优化大体量会话下的性能和可视化密度
- 为复杂 agent 链路增加更多 flow 布局模式
- 增加导出报告和复盘结果的预设

## Contributing

欢迎贡献。

适合参与的方向包括：

- parser 改进
- UI 打磨
- 大体量 traces 的性能优化
- 新的分析面板
- 示例数据集和可复现问题样例

如果这个项目帮你更快理解 Claude Code 会话，欢迎点一个 GitHub Star，让更多人看到它。

## License

MIT
