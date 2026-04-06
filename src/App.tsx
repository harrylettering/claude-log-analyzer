import { useState, useCallback } from 'react'
import { BarChart2, MessageSquare, Clock, Wrench, Zap, FileText, Upload, History, Download, Bug, AlertCircle, Loader2, Brain, GitMerge, TrendingUp, Settings, PlayCircle, Sparkles, Layers } from 'lucide-react'
import { parseLog } from './utils/logParser'
import type { ParsedLogData } from './types/log'
import { FileUpload } from './components/FileUpload'
import { SessionOverview } from './components/SessionOverview'
import { TokenDashboard } from './components/TokenDashboard'
import { TimelineView } from './components/TimelineView'
import { ConversationFlow } from './components/ConversationFlow'
import { ToolAnalysis } from './components/ToolAnalysis'
import { PerformanceView } from './components/PerformanceView'
import { RealTimeLog } from './components/RealTimeLog'
import { FileHistory } from './components/FileHistory'
import { ExportPanel } from './components/ExportPanel'
import { DebugPanel } from './components/DebugPanel'
import { AIAnalysis } from './components/AIAnalysis'
import { SessionCompare } from './components/SessionCompare'
import { SessionAggregate } from './components/SessionAggregate'
import { SessionReplay } from './components/SessionReplay'
import { BudgetSettings } from './components/BudgetSettings'
import { PromptOptimizer } from './components/PromptOptimizer'
import { SessionPatternLibrary } from './components/SessionPatternLibrary'
import { useBudgetContext } from './contexts/BudgetContext'

type ViewId = 'overview' | 'tokens' | 'timeline' | 'conversation' | 'tools' | 'performance' | 'realtime' | 'history' | 'export' | 'debug' | 'ai-analysis' | 'compare' | 'aggregate' | 'replay' | 'prompt-optimizer' | 'pattern-library'

const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: '会话概览', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'ai-analysis', label: 'AI 分析', icon: <Brain className="w-4 h-4" /> },
  { id: 'prompt-optimizer', label: '提示词优化', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'pattern-library', label: '模式库', icon: <Layers className="w-4 h-4" /> },
  { id: 'compare', label: '会话对比', icon: <GitMerge className="w-4 h-4" /> },
  { id: 'aggregate', label: '多会话聚合', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'replay', label: '会话回放', icon: <PlayCircle className="w-4 h-4" /> },
  { id: 'tokens', label: 'Token 统计', icon: <Zap className="w-4 h-4" /> },
  { id: 'timeline', label: '时间轴', icon: <Clock className="w-4 h-4" /> },
  { id: 'conversation', label: '对话流程', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'tools', label: '工具分析', icon: <Wrench className="w-4 h-4" /> },
  { id: 'performance', label: '性能视图', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'realtime', label: '日志查看', icon: <FileText className="w-4 h-4" /> },
  { id: 'history', label: '文件历史', icon: <History className="w-4 h-4" /> },
  { id: 'export', label: '导出', icon: <Download className="w-4 h-4" /> },
  { id: 'debug', label: '调试面板', icon: <Bug className="w-4 h-4" /> },
]

export default function App() {
  const [logData, setLogData] = useState<ParsedLogData | null>(null)
  const [currentView, setCurrentView] = useState<ViewId>('overview')
  const [error, setError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showBudgetSettings, setShowBudgetSettings] = useState(false)
  const [replayStartIndex, setReplayStartIndex] = useState<number>(0)
  const { config, setConfig, resetConfig } = useBudgetContext()

  // 从指定位置开始回放
  const startReplayFrom = useCallback((index: number) => {
    setReplayStartIndex(index)
    setCurrentView('replay')
  }, [])

  const handleFileLoad = useCallback((content: string) => {
    setIsLoading(true)
    setError(null)
    setParseWarnings([])

    // 使用 setTimeout 让 UI 有时间渲染加载状态
    setTimeout(() => {
      try {
        const result = parseLog(content)
        setLogData(result.data)
        setCurrentView('overview')

        if (result.errors.length > 0) {
          setParseWarnings([
            `成功解析 ${result.data.entries.length} 条日志`,
            `有 ${result.errors.length} 行解析失败`,
          ])
        }
      } catch (e) {
        setError('解析日志失败，请检查文件格式')
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }, 50)
  }, [])

  const renderView = () => {
    if (currentView === 'compare') {
      return <SessionCompare defaultSession={logData || undefined} />
    }
    if (currentView === 'aggregate') {
      return <SessionAggregate defaultSession={logData || undefined} />
    }
    if (currentView === 'replay') {
      if (!logData) return null;
      return <SessionReplay data={logData} startIndex={replayStartIndex} />
    }
    if (currentView === 'prompt-optimizer') {
      if (!logData) return null;
      return <PromptOptimizer data={logData} />
    }
    if (currentView === 'pattern-library') {
      return (
        <SessionPatternLibrary
          currentSessionData={logData || undefined}
          currentSessionName="当前会话"
        />
      )
    }
    if (!logData) return null
    switch (currentView) {
      case 'overview': return <SessionOverview data={logData} />
      case 'ai-analysis': return <AIAnalysis data={logData} />
      case 'tokens': return <TokenDashboard data={logData} />
      case 'timeline': return <TimelineView data={logData} onStartReplay={startReplayFrom} />
      case 'conversation': return <ConversationFlow data={logData} />
      case 'tools': return <ToolAnalysis data={logData} />
      case 'performance': return <PerformanceView data={logData} />
      case 'realtime': return <RealTimeLog data={logData} onDataUpdate={(data) => setLogData(data)} />
      case 'history': return <FileHistory data={logData} />
      case 'export': return <ExportPanel data={logData} />
      case 'debug': return <DebugPanel data={logData} />
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold">Claude Log Visualizer</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBudgetSettings(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors border-slate-600 hover:bg-slate-700"
          >
            <Settings className="w-4 h-4" />
            预算设置
          </button>
          {!logData && (
            <div className="w-48">
              <FileUpload onFileLoad={handleFileLoad} isDark={true} disabled={isLoading} />
            </div>
          )}
          {logData && (
            <button
              onClick={() => setLogData(null)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors border-slate-600 hover:bg-slate-700"
            >
              <Upload className="w-4 h-4" />
              重新上传
            </button>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {(logData || currentView === 'compare' || currentView === 'aggregate' || currentView === 'replay') && (
          <aside className="w-48 border-r min-h-screen p-3 border-slate-700 bg-slate-800/30">
            <nav className="space-y-1">
              {navItems.map(item => {
                // 如果没有加载日志，只显示会话对比和多会话聚合
                if (!logData && item.id !== 'compare' && item.id !== 'aggregate') return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        currentView === item.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-x-hidden p-6">
          {/* 加载状态 */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-400">正在解析日志文件...</p>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* 解析警告 */}
          {parseWarnings.length > 0 && (
            <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-semibold">解析警告</span>
              </div>
              <ul className="list-disc list-inside space-y-1">
                {parseWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {!isLoading && !logData ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                  <BarChart2 className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Claude Log Visualizer</h2>
                <p className="text-sm mb-6 text-slate-400">
                  上传 Claude Code 日志文件 (.jsonl) 开始分析
                </p>
              </div>
              <div className="w-80">
                <FileUpload onFileLoad={handleFileLoad} isDark={true} disabled={isLoading} />
              </div>
            </div>
          ) : (
            renderView()
          )}
        </main>
      </div>

      {/* 预算设置弹窗 */}
      <BudgetSettings
        isOpen={showBudgetSettings}
        onClose={() => setShowBudgetSettings(false)}
        config={config}
        onSave={setConfig}
        onReset={resetConfig}
      />
    </div>
  )
}
