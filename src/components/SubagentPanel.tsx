import { useMemo, useState } from 'react';
import {
  Bot, ChevronRight, Clock, Zap, Wrench, AlertTriangle,
  CheckCircle2, Loader2, HelpCircle, Terminal, MessageSquare,
} from 'lucide-react';
import type { ParsedLogData, SubagentRun, SubagentStatus, LogEntry } from '../types/log';
import { formatDuration, formatTokens } from '../utils/logParser';

interface SubagentPanelProps {
  data: ParsedLogData;
}

const STATUS_STYLES: Record<SubagentStatus, { label: string; className: string; icon: React.ReactNode }> = {
  completed: {
    label: 'Completed',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  running: {
    label: 'Running',
    className: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: <Loader2 className="w-3.5 h-3.5" />,
  },
  error: {
    label: 'Had errors',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  dispatched: {
    label: 'No transcript',
    className: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
  },
};

function StatusPill({ status }: { status: SubagentStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${style.className}`}>
      {style.icon}
      {style.label}
    </span>
  );
}

/** The label to show for a run: what it was asked to do beats what it is. */
function runTitle(run: SubagentRun): string {
  if (run.description) return run.description;
  if (run.prompt) return run.prompt.split('\n')[0].slice(0, 80);
  return run.agentId;
}

/**
 * One line per entry in a transcript: what the agent did, in order.
 *
 * Every entry gets a line. A transcript of eight entries that renders six
 * reads as a rendering bug, and the ones most likely to be dropped —
 * attachments carrying the tool and skill listings the agent was given — are
 * exactly what you want when asking why it behaved the way it did.
 */
function describeEntry(entry: LogEntry): { kind: string; text: string } {
  if (entry.type === 'attachment') {
    const attachment = (entry as any).attachment ?? {};
    const names = Array.isArray(attachment.addedNames) ? ` — ${attachment.addedNames.length} items` : '';
    return { kind: 'context', text: `${attachment.type ?? 'attachment'}${names}` };
  }

  const content = entry.message?.content;

  if (typeof content === 'string') {
    return { kind: 'prompt', text: content };
  }
  if (!Array.isArray(content)) return { kind: entry.type ?? 'entry', text: '' };

  for (const block of content as any[]) {
    if (block?.type === 'tool_use') {
      const input = block.input ?? {};
      const detail = input.command ?? input.file_path ?? input.pattern ?? input.description ?? '';
      return { kind: 'tool', text: `${block.name}${detail ? ` — ${String(detail)}` : ''}` };
    }
    if (block?.type === 'tool_result') {
      const body = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      return { kind: block.is_error ? 'error' : 'result', text: body ?? '' };
    }
    if (block?.type === 'text' && block.text?.trim()) {
      return { kind: 'text', text: block.text };
    }
    // A thinking block with no text is a signature-only record — it marks that
    // the agent reasoned here, and showing it as an empty row is still useful.
    if (block?.type === 'thinking') {
      return { kind: 'thinking', text: block.thinking?.trim() || '(reasoning)' };
    }
  }
  return { kind: entry.type ?? 'entry', text: '' };
}

const KIND_COLORS: Record<string, string> = {
  prompt: 'text-blue-300',
  tool: 'text-amber-300',
  result: 'text-slate-400',
  error: 'text-red-300',
  text: 'text-emerald-300',
  thinking: 'text-violet-300',
  context: 'text-slate-500',
};

function RunDetail({ run }: { run: SubagentRun }) {
  if (!run.hasTranscript) {
    return (
      <div className="px-5 py-4 text-sm text-slate-400 border-t border-slate-800">
        The session dispatched this agent but its transcript was not loaded, so there is nothing
        to show beyond what the dispatch itself recorded. Transcripts live next to the session
        file, under <code className="text-slate-300">&lt;session-id&gt;/subagents/</code> — watching
        the session through the local server picks them up; a manually uploaded session file does not.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800">
      {run.prompt && (
        <div className="px-5 py-4 border-b border-slate-800/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Prompt</div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{run.prompt}</pre>
        </div>
      )}

      <div className="px-5 py-4 border-b border-slate-800/60">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          Transcript · {run.entries.length} entries
        </div>
        <ol className="space-y-1.5">
          {run.entries.map((entry, idx) => {
            const described = describeEntry(entry);
            return (
              <li key={entry.uuid ?? idx} className="flex gap-3 text-xs font-mono">
                <span className="text-slate-600 shrink-0 w-6 text-right">{idx + 1}</span>
                <span className={`shrink-0 w-16 ${KIND_COLORS[described.kind] ?? 'text-slate-400'}`}>
                  {described.kind}
                </span>
                <span className="text-slate-400 break-all line-clamp-2">{described.text}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {run.toolCalls.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-800/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Tool calls</div>
          <div className="flex flex-wrap gap-2">
            {run.toolCalls.map((call, idx) => (
              <span
                key={call.id ?? idx}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${
                  call.isError
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-slate-700 bg-slate-800/60 text-slate-300'
                }`}
              >
                {call.name}
                {call.durationMs !== undefined && (
                  <span className="text-slate-500"> · {formatDuration(call.durationMs)}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {run.resultText && (
        <div className="px-5 py-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
            Returned to the parent
          </div>
          <pre className="text-xs text-emerald-300/90 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
            {run.resultText}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SubagentPanel({ data }: SubagentPanelProps) {
  const { subagents, stats } = data;
  const [expanded, setExpanded] = useState<string | null>(
    subagents.length === 1 ? subagents[0].agentId : null
  );

  const totals = useMemo(() => {
    const tokens = subagents.reduce((sum, run) => sum + run.tokens.totalTokens, 0);
    const toolCalls = subagents.reduce((sum, run) => sum + run.toolCalls.length, 0);
    const withTranscript = subagents.filter((run) => run.hasTranscript).length;
    const busiest = subagents.reduce<SubagentRun | null>(
      (best, run) => (best === null || run.tokens.totalTokens > best.tokens.totalTokens ? run : best),
      null
    );
    return { tokens, toolCalls, withTranscript, busiest };
  }, [subagents]);

  if (subagents.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Subagents</h2>
          <p className="text-slate-400">Work this session handed off to agents of its own</p>
        </div>
        <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
          <Bot className="w-12 h-12 text-slate-800 mx-auto mb-4" />
          <p className="text-slate-500 text-lg font-bold">This session dispatched no subagents</p>
          <p className="text-slate-600 text-sm mt-2 max-w-lg mx-auto">
            A dispatch is recorded in the session log itself, so an empty list here means none
            happened — not that a file is missing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Subagents</h2>
        <p className="text-slate-400">Work this session handed off to agents of its own</p>
      </div>

      {/* Summary. Subagent cost is reported next to the session's own rather
          than folded into it: the session total is what this conversation
          spent, and quietly adding delegated work to it would change what a
          number people already read means. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl font-bold mb-1">{subagents.length}</div>
          <div className="text-slate-400 text-sm">Dispatched</div>
          {totals.withTranscript < subagents.length && (
            <div className="text-slate-500 text-xs mt-1">
              {subagents.length - totals.withTranscript} without a transcript
            </div>
          )}
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl font-bold mb-1">{formatTokens(totals.tokens)}</div>
          <div className="text-slate-400 text-sm">Subagent tokens</div>
          <div className="text-slate-500 text-xs mt-1">
            {formatTokens(stats.totalTokens + totals.tokens)} including this session
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl font-bold mb-1">{totals.toolCalls}</div>
          <div className="text-slate-400 text-sm">Tool calls made</div>
          <div className="text-slate-500 text-xs mt-1">Not counted in the session's own {stats.toolCalls}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-2xl font-bold mb-1 truncate">
            {totals.busiest ? formatTokens(totals.busiest.tokens.totalTokens) : '—'}
          </div>
          <div className="text-slate-400 text-sm">Most expensive run</div>
          {totals.busiest && (
            <div className="text-slate-500 text-xs mt-1 truncate">{runTitle(totals.busiest)}</div>
          )}
        </div>
      </div>

      {/* Runs */}
      <div className="space-y-3">
        {subagents.map((run) => {
          const isOpen = expanded === run.agentId;
          return (
            <div key={run.agentId} className="bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : run.agentId)}
                className="w-full text-left px-5 py-4 hover:bg-slate-800 transition-colors"
                aria-expanded={isOpen}
              >
                <div className="flex items-start gap-3">
                  <ChevronRight
                    className={`w-4 h-4 mt-1 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-semibold text-slate-100 truncate">{runTitle(run)}</span>
                      <StatusPill status={run.status} />
                      {run.agentType && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[11px] font-mono">
                          {run.agentType}
                        </span>
                      )}
                      {run.isAsync && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 text-[11px]">async</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      {run.model && (
                        <span className="flex items-center gap-1.5 font-mono">
                          <Bot className="w-3.5 h-3.5 text-slate-500" />
                          {run.model}
                        </span>
                      )}
                      {run.durationMs !== undefined && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {formatDuration(run.durationMs)}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-slate-500" />
                        {formatTokens(run.tokens.totalTokens)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-slate-500" />
                        {run.toolCalls.length} calls
                      </span>
                      {run.errorCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {run.errorCount} tool errors
                        </span>
                      )}
                      {run.launchLatencyMs !== undefined && run.launchLatencyMs > 0 && (
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Terminal className="w-3.5 h-3.5" />
                          queued {formatDuration(run.launchLatencyMs)}
                        </span>
                      )}
                    </div>

                    {!isOpen && run.resultText && (
                      <div className="mt-2 text-xs text-slate-500 flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="line-clamp-1 font-mono">{run.resultText}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {isOpen && <RunDetail run={run} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
