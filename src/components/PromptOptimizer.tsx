import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Info, FileJson, Brain, Loader2, Zap, ArrowRight, Terminal, RefreshCw } from 'lucide-react';
import type { LogEntry, ParsedLogData } from '../types/log';
import type { Lesson } from '../utils/rulesExtractor';
import { extractLessons } from '../utils/rulesExtractor';
import { ActionCardRenderer } from './AgentActionCards';

interface PromptOptimizerProps {
  data: ParsedLogData;
  cliResult?: string;
  isCliAnalyzing?: boolean;
  onRunCliAnalysis?: (prompt?: string) => void;
  onResetCliAnalysis?: () => void;
  cliError?: string;
}

export const PromptOptimizer: React.FC<PromptOptimizerProps> = ({ data, cliResult, isCliAnalyzing, onRunCliAnalysis, onResetCliAnalysis, cliError }) => {
  const [_copiedId, _setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cli' | 'rules'>('cli');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const defaultPrompt = `You are a top-tier AI collaboration expert. Please read the following conversation log (already structurally compressed) and produce a deep retrospective.
Please return the following directly:
1. Collaboration summary: a one-sentence overview of performance.
2. Wins to keep: which practices should continue?
3. Pitfalls to avoid: which behaviors caused inefficiency or errors?
4. Optimization suggestions: three concrete improvements for future sessions.
Please format the output clearly in Markdown.

Output language rule:
- Respond in English by default.
- Use another language only when the user's custom instructions explicitly request it.`;

  const runAnalysis = () => {
    const prompt = customPrompt.trim();
    onRunCliAnalysis?.(prompt.length > 0 ? prompt : undefined);
  };

  useEffect(() => {
    onResetCliAnalysis?.();
  }, [onResetCliAnalysis]);

  // Heuristic rule extraction.
  const lessons: Lesson[] = useMemo(() => extractLessons(data.entries), [data.entries]);
  const errorEntries: LogEntry[] = useMemo(() => {
    return data.entries.filter((entry) => {
      const action = entry.parsedAction;
      return action?.type === 'TaskResult' && Boolean(action.isError);
    });
  }, [data.entries]);

  // Export the retrospective report.
  const exportRetrospective = () => {
    const timestamp = new Date().toLocaleString('en-US');
    let content = `# Claude Session Retrospective\n\nGenerated: ${timestamp}\n\n---\n\n## Terminal Analysis Summary\n\n${cliResult || 'No terminal analysis available yet'}\n\n---\n\n## Error Log\n\n`;

    if (errorEntries.length === 0) {
      content += 'No failed tool executions were found.\n\n';
    } else {
      errorEntries.forEach((entry, index) => {
        const action = entry.parsedAction;
        if (!action || action.type !== 'TaskResult') return;
        content += `### ${index + 1}. ${new Date(entry.timestamp).toLocaleString('en-US')}\n\n`;
        content += `${action.content}\n\n---\n\n`;
      });
    }

    content += `## Automatically Extracted Rules\n\n`;

    if (lessons.length === 0) {
      content += 'No rules were extracted.';
    } else {
      lessons.forEach((lesson, index) => {
        content += `### ${index + 1}. Failed Command\n\`${lesson.errorCommand}\`\n\n### Suggested Rule\n${lesson.suggestedRule}\n\n---\n\n`;
      });
    }

    // Trigger the download.
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `claude-retrospective-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shadow-lg shadow-indigo-900/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight italic">BRAIN<span className="text-indigo-500">INSIGHTS</span></h2>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">Neural Experience Protocol</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-950/80 rounded-xl border border-slate-800/50 backdrop-blur-sm">
        {[
          { id: 'cli', label: 'AI Analysis', icon: <Terminal className="w-3 h-3" /> },
          { id: 'rules', label: 'Error Log', icon: <Zap className="w-3 h-3" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
        {/* CLI retrospective panel */}
        {activeTab === 'cli' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="space-y-4">
              <div className="cyber-card p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  Custom Analysis Instructions (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder='Optional: add custom instructions, e.g. "Focus on tool failures" or "Summarize code changes". Leave empty to use the default retrospective prompt.'
                  className="w-full h-[140px] bg-black/40 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-tight">
                    Default prompt preview
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-800 bg-black/30 p-3 text-[10px] leading-relaxed text-slate-500">
                    {defaultPrompt}
                  </pre>
                </details>
              </div>
              <button
                onClick={runAnalysis}
                disabled={isCliAnalyzing}
                className="cyber-btn w-full py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCliAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                {isCliAnalyzing ? 'Running Analysis' : 'Run Analysis'}
              </button>
            </div>

            {isCliAnalyzing && (
               <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-4">
                  <div className="relative">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <Terminal className="w-3 h-3 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Streaming from Terminal...</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">Claude is analyzing the current live log in real time</p>
                  </div>
               </div>
            )}

            {cliError && !isCliAnalyzing && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-[10px] font-black text-red-300 uppercase tracking-widest">Analysis Error</p>
                <p className="mt-2 text-sm text-red-100/80">{cliError}</p>
              </div>
            )}
            
            {!isCliAnalyzing && !cliResult && !cliError && (
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5 text-center">
                <p className="text-xs text-slate-500">
                  Run the analysis to generate a retrospective. The generated answer will appear here and will not be written back into the instruction box.
                </p>
              </div>
            )}

            {cliResult && !isCliAnalyzing && (
              <div className="space-y-3">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={runAnalysis}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Run Again
                  </button>
                </div>
                <div className="cyber-card p-6 shadow-2xl text-slate-300 relative group markdown-content">
                  <div className="absolute top-4 right-4 opacity-10">
                     <Terminal className="w-10 h-10" />
                  </div>
                  <ReactMarkdown>{cliResult}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Automatically extracted rules */}
        {activeTab === 'rules' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Error Log Collection</h3>
            {errorEntries.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                <Info className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium px-10">No failed tool executions were found in this session.</p>
              </div>
            ) : (
              errorEntries.map((entry) => (
                <div key={entry.uuid} className="mb-4">
                  {entry.parsedAction && (
                    <ActionCardRenderer action={entry.parsedAction} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer / Export */}
      {(errorEntries.length > 0 || lessons.length > 0 || cliResult) && (
        <div className="cyber-card p-4 bg-gradient-to-br from-indigo-600/20 to-blue-700/20 border-indigo-500/30 shadow-xl shadow-indigo-900/20">
          <div className="flex items-center gap-3 mb-2 text-white">
            <FileJson className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest gradient-text">Export Retrospective</span>
          </div>
          <p className="text-[10px] text-indigo-100/70 mb-4 font-medium">Export the retrospective summary and error log for future reference.</p>
          <button
            onClick={exportRetrospective}
            className="cyber-btn w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-2"
          >
            Download Markdown Report <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
