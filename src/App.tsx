import { useState, useCallback, useEffect, useRef } from 'react'
import { BarChart2, MessageSquare, Clock, Zap, AlertCircle, Loader2, GitMerge, Sparkles, Activity, Terminal, Search, HardDrive, PlayCircle, Upload, Share2 } from 'lucide-react'
import { parseLog } from './utils/logParser'
import type { ParsedLogData, LogEntry } from './types/log'
import { FileUpload } from './components/FileUpload'
import { SessionOverview } from './components/SessionOverview'
import { TokenDashboard } from './components/TokenDashboard'
import { TimelineView } from './components/TimelineView'
import { ConversationFlow } from './components/ConversationFlow'
import { SessionCompare } from './components/SessionCompare'
import { PromptOptimizer } from './components/PromptOptimizer'
import { AgentFlowView } from './components/AgentFlowView'

type ViewId = 'overview' | 'tokens' | 'timeline' | 'conversation' | 'compare' | 'prompt-optimizer' | 'agent-flow'

const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'agent-flow', label: 'Agent Flow', icon: <Share2 className="w-4 h-4" /> },
  { id: 'overview', label: 'Session Overview', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'prompt-optimizer', label: 'Retrospective', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'compare', label: 'Session Compare', icon: <GitMerge className="w-4 h-4" /> },
  { id: 'tokens', label: 'Token Stats', icon: <Zap className="w-4 h-4" /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
  { id: 'conversation', label: 'Conversation Flow', icon: <MessageSquare className="w-4 h-4" /> },
]

export default function App() {
  const [logData, setLogData] = useState<ParsedLogData | null>(null)
  const [currentView, setCurrentView] = useState<ViewId>('overview')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCliAnalyzing, setIsCliAnalyzing] = useState(false)
  const [claudeCliResult, setClaudeCliResult] = useState('')
  const [claudeCliError, setClaudeCliError] = useState<string | null>(null)

  // --- WebSocket live watch state ---
  const [isWsConnected, setIsWsConnected] = useState(false)
  const [discoveryList, setDiscoveryList] = useState<any[]>([])
  const [manualPath, setManualPath] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const activePathRef = useRef<string | null>(null)
  const offlineLogContentRef = useRef<string | null>(null)

  const resetClaudeCliAnalysis = useCallback(() => {
    setIsCliAnalyzing(false)
    setClaudeCliResult('')
    setClaudeCliError(null)
  }, [])

  // Establish the WebSocket connection.
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4000')
    wsRef.current = ws

    ws.onopen = () => {
      setIsWsConnected(true)
      console.log('[WS] Connected to log watcher service')
      ws.send(JSON.stringify({ type: 'get-discovery-list' }))
    }

    ws.onclose = () => {
      setIsWsConnected(false)
      console.log('[WS] Connection closed')
    }

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data)
        
        if (type === 'discovery-list') {
          setDiscoveryList(payload)
        } else if (type === 'log-entry') {
          const result = parseLog(payload)
          if (result.data.entries.length > 0) {
            updateLogDataIncrementally(result.data.entries[0])
          }
        } else if (type === 'session-reset') {
          setLogData(null)
          setCurrentView('overview')
          resetClaudeCliAnalysis()
        } else if (type === 'claude-analysis-start') {
          setIsCliAnalyzing(true)
          setClaudeCliResult('')
          setClaudeCliError(null)
        } else if (type === 'claude-analysis-chunk') {
          setClaudeCliResult(prev => prev + payload)
        } else if (type === 'claude-analysis-end') {
          setIsCliAnalyzing(false)
        } else if (type === 'claude-analysis-error') {
          setIsCliAnalyzing(false)
          setClaudeCliError(payload)
        }
      } catch (e) {
        console.error('[WS] Failed to parse message', e)
      }
    }

    return () => ws.close()
  }, [resetClaudeCliAnalysis])

  const startWatching = (path: string) => {
    if (wsRef.current && isWsConnected) {
      setLogData(null)
      resetClaudeCliAnalysis()
      offlineLogContentRef.current = null
      activePathRef.current = path
      wsRef.current.send(JSON.stringify({ type: 'start-watch', data: { path } }))
      setCurrentView('overview')
    }
  }

  const runClaudeCliAnalysis = useCallback((prompt?: string) => {
    const path = activePathRef.current
    const content = offlineLogContentRef.current
    console.log('[DEBUG] Preparing analysis request. WS state:', wsRef.current?.readyState, 'path:', path, 'has offline content:', Boolean(content), 'custom prompt:', prompt);
    if (wsRef.current && isWsConnected && (path || content)) {
      setIsCliAnalyzing(true)
      setClaudeCliResult('')
      setClaudeCliError(null)
      console.log('[DEBUG] Sending run-claude-analysis message:', path || '[offline-upload]');
      wsRef.current.send(JSON.stringify({
        type: 'run-claude-analysis',
        data: {
          path: path || undefined,
          content: path ? undefined : content,
          prompt,
        },
      }))
    } else {
      setClaudeCliResult('')
      setIsCliAnalyzing(false)
      setClaudeCliError('No Claude Code log is available for analysis. Please watch a live session or upload a JSONL file first.')
      console.warn('[DEBUG] Requirements not met: wsConnected:', isWsConnected, 'path:', path, 'has offline content:', Boolean(content));
    }
  }, [isWsConnected])

  // Incremental update logic.
  const updateLogDataIncrementally = useCallback((newEntry: LogEntry) => {
    setLogData(prev => {
      if (!prev) {
        return {
          entries: [newEntry],
          stats: { totalMessages: 1, userMessages: 0, assistantMessages: 0, toolCalls: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, sessionDuration: 0, modelsUsed: [] },
          toolCalls: [], tokenUsage: [], turnDurations: []
        }
      }
      const updatedEntries = [...prev.entries, newEntry];
      const fullContent = updatedEntries.map(e => JSON.stringify(e)).join('\n');
      return parseLog(fullContent).data;
    })
  }, [])

  const handleFileLoad = useCallback((content: string) => {
    setIsLoading(true)
    setError(null)
    resetClaudeCliAnalysis()
    activePathRef.current = null
    offlineLogContentRef.current = content

    setTimeout(() => {
      try {
        const result = parseLog(content)
        setLogData(result.data)
        setCurrentView('overview')
      } catch (e) {
        setError('Failed to parse log. Please check the file format.')
      } finally {
        setIsLoading(false)
      }
    }, 50)
  }, [resetClaudeCliAnalysis])

  const renderDiscoveryView = () => {
    return (
      <div className="max-w-5xl mx-auto space-y-10 py-10 animate-in fade-in duration-700">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <Activity className="w-3 h-3" /> Live Discovery
          </div>
          <h2 className="text-4xl font-black text-white tracking-tighter italic">
            CLAUDE<span className="text-blue-500">TRACE REPLAY</span>
          </h2>
          <p className="text-slate-400 text-lg">Automatically discover active sessions from the last 24 hours, or enter a path manually.</p>
        </div>

        {/* Auto-discovered session list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {discoveryList.map(session => (
            <button
              key={session.fullPath}
              onClick={() => startWatching(session.fullPath)}
              className="flex flex-col text-left p-6 rounded-3xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-blue-500/50 transition-all group relative overflow-hidden shadow-2xl backdrop-blur-sm"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 rounded-2xl bg-blue-600/10 text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Terminal className="w-6 h-6" />
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-black text-slate-500 uppercase">{new Date(session.lastUpdated).toLocaleDateString()}</div>
                   <div className="text-xs font-bold text-blue-400">{new Date(session.lastUpdated).toLocaleTimeString()}</div>
                </div>
              </div>

              <div className="mb-4">
                <span className="text-[10px] font-black text-blue-500/80 uppercase tracking-widest block mb-1">Folder Context</span>
                <h3 className="font-black text-slate-100 break-all text-sm leading-tight group-hover:text-blue-400 transition-colors">{session.folderName}</h3>
              </div>

              <div className="mb-6 space-y-2">
                <div>
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-1">JSONL File</span>
                  <p className="text-[10px] text-slate-400 font-mono break-all bg-black/30 p-2 rounded-lg border border-slate-800/50">
                    {session.id}
                  </p>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-slate-800/50 flex items-center justify-between">
                <div className="flex gap-3">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">JSONL</span>
                   <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{session.size}</span>
                </div>
                <div className="flex items-center gap-2 text-blue-500 font-black text-[10px] uppercase tracking-tighter group-hover:gap-3 transition-all">
                   Watch Session <PlayCircle className="w-4 h-4" />
                </div>
              </div>
            </button>
          ))}
          
          {discoveryList.length === 0 && (
            <div className="md:col-span-3 py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
              <Search className="w-12 h-12 text-slate-800 mx-auto mb-4 animate-bounce" />
              <p className="text-slate-500 text-lg font-bold">No active sessions found in the last 24 hours</p>
              <p className="text-slate-600 text-sm mt-1">Make sure Claude has been started in your terminal and at least one message has been sent.</p>
              <button 
                onClick={() => wsRef.current?.send(JSON.stringify({ type: 'get-discovery-list' }))}
                className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black rounded-full transition-all uppercase tracking-widest"
              >
                Force Rescan
              </button>
            </div>
          )}
        </div>

        {/* Bottom dual-mode entry points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10">
            <div className="p-8 rounded-3xl border border-slate-800 bg-slate-900/20 backdrop-blur-md relative group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                   <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">Watch Specific Path</h3>
              </div>
              <div className="space-y-4">
                <input 
                  type="text" 
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="Paste the absolute path to a .jsonl file..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm text-slate-300 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 transition-all placeholder:text-slate-700"
                />
                <button 
                  onClick={() => startWatching(manualPath)}
                  disabled={!manualPath}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-20 text-white rounded-2xl text-xs font-black transition-all shadow-xl shadow-orange-900/20 uppercase tracking-widest"
                >
                  Start Watching File
                </button>
              </div>
            </div>

            <div className="p-8 rounded-3xl border border-slate-800 bg-slate-900/20 backdrop-blur-md relative group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                   <Upload className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">Offline Analysis</h3>
              </div>
              <div className="h-full">
                <FileUpload onFileLoad={handleFileLoad} isDark={true} disabled={isLoading} />
                <p className="mt-4 text-[10px] text-slate-600 font-bold uppercase tracking-tight text-center">Drag a file here or click to select any JSONL file</p>
              </div>
            </div>
        </div>
      </div>
    )
  }

  const renderView = () => {
    if (currentView === 'compare') return <SessionCompare defaultSession={logData || undefined} />
    if (currentView === 'agent-flow') return (
      <div className="h-[calc(100vh-73px-64px)] flex flex-col">
        <AgentFlowView data={logData} />
      </div>
    )

    if (!logData) return null
    switch (currentView) {
      case 'overview': return <SessionOverview data={logData} />
      case 'prompt-optimizer': return (
        <PromptOptimizer
          data={logData}
          cliResult={claudeCliResult}
          isCliAnalyzing={isCliAnalyzing}
          cliError={claudeCliError || undefined}
          onRunCliAnalysis={runClaudeCliAnalysis}
          onResetCliAnalysis={resetClaudeCliAnalysis}
        />
      )
      case 'tokens': return <TokenDashboard data={logData} />
      case 'timeline': return (
        <TimelineView
          data={logData}
          cliResult={claudeCliResult}
          isCliAnalyzing={isCliAnalyzing}
          cliError={claudeCliError || undefined}
          onRunCliAnalysis={runClaudeCliAnalysis}
        />
      )
      case 'conversation': return <ConversationFlow data={logData} />
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-blue-500/30 font-sans">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tight">Claude Trace Replay</h1>
          {isWsConnected ? (
            <div className="flex items-center gap-2 ml-4 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-4 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 opacity-50">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Offline</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {logData && (
            <button
              onClick={() => { setLogData(null); wsRef.current?.send(JSON.stringify({ type: 'get-discovery-list' })); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-900 hover:bg-white transition-all shadow-xl"
            >
              <Search className="w-4 h-4" />
              Switch Session
            </button>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {(logData || currentView === 'compare') && (
          <aside className="w-56 border-r min-h-[calc(100vh-73px)] p-4 border-slate-800 bg-slate-900/50 sticky top-[73px]">
            <nav className="space-y-1.5">
              {navItems.map(item => {
                if (!logData && item.id !== 'compare') return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        currentView === item.id
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
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
        <main className="flex-1 min-w-0 overflow-x-hidden p-8">
          {isLoading && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-slate-500 font-medium">Parsing data...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {!isLoading && !logData ? (
            renderDiscoveryView()
          ) : (
            renderView()
          )}
        </main>
      </div>
    </div>
  )
}
