const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const os = require('os');

const CLAUDE_BASE_DIR = path.join(os.homedir(), '.claude', 'projects');

const { spawn, exec } = require('child_process');

// --- Retrospective prompt for Claude CLI ---
const LANGUAGE_RULE = `Output language rule:
- Respond in English by default.
- Use another language only when the user's custom instructions explicitly request it.`;

const CLI_ANALYSIS_PROMPT = `You are a top-tier AI collaboration expert. Read the following conversation log, which has already been structurally compressed, and produce a deep retrospective.

Return the following sections directly:
1. Collaboration summary: a one-sentence overview of performance.
2. Wins to keep: which practices should continue?
3. Pitfalls to avoid: which behaviors caused inefficiency or errors?
4. Optimization suggestions: three concrete improvements for future sessions.

Use clear Markdown formatting.

${LANGUAGE_RULE}`;

// --- Session comparison prompt ---
const COMPARE_ANALYSIS_PROMPT = `You are a top-tier AI collaboration expert. Compare the following two conversation sessions, evaluate which one performed better, and provide a detailed analysis.

Return the following sections directly:
1. **Overall assessment**: which session performed better? (A / B / tie)
2. **Quality comparison**: compare answer quality, efficiency, tool usage, and execution reliability.
3. **Difference analysis**: identify the most important differences between the sessions.
4. **Recommendations**: provide concrete optimization suggestions based on this comparison.

Use clear Markdown formatting and support judgments with concrete data where possible.

${LANGUAGE_RULE}`;

const ANALYSIS_COMPRESSION_LIMITS = {
    maxChars: 24000,
    minRemainingChars: 80,
    maxLineChars: {
        user: 520,
        thinking: 260,
        toolCall: 260,
        toolError: 320,
        toolResult: 220,
        reply: 360,
        summary: 280
    },
    maxLines: {
        user: 80,
        thinking: 40,
        toolCall: 140,
        toolError: 80,
        toolResult: 60,
        reply: 60
    }
};

const PRIORITY_SUCCESS_RESULT_TOOLS = new Set([
    'bash',
    'run',
    'execute_command',
    'read',
    'view',
    'read_file',
    'grep',
    'search',
    'find',
    'glob',
    'list_files',
    'ls',
    'edit',
    'write',
    'str_replace_editor',
    'create',
    'save',
    'delete',
    'remove',
    'move',
    'rename',
    'mv'
]);

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeToolName(name) {
    return typeof name === 'string' ? name.toLowerCase() : '';
}

function getToolInputPath(input = {}) {
    return input.path || input.file_path || input.pattern || input.dir || input.dir_path || '';
}

function extractResultText(content) {
    if (typeof content === 'string') return content.trim();

    if (Array.isArray(content)) {
        return content
            .map(block => {
                if (typeof block === 'string') return block;
                if (block?.type === 'text' && typeof block.text === 'string') return block.text;
                return '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    if (content && typeof content === 'object') {
        const stdout = typeof content.stdout === 'string' ? content.stdout.trim() : '';
        const stderr = typeof content.stderr === 'string' ? content.stderr.trim() : '';
        const combined = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '');
        if (combined) return combined;
        return JSON.stringify(content);
    }

    return '';
}

function countListItems(text) {
    if (!text) return 0;
    return text.split('\n').map(line => line.trim()).filter(Boolean).length;
}

function extractExitCode(resultContent, fallbackText, isError) {
    if (resultContent && typeof resultContent === 'object' && !Array.isArray(resultContent)) {
        const directValues = [resultContent.exitCode, resultContent.exit_code, resultContent.code];
        for (const value of directValues) {
            if (typeof value === 'number' && Number.isInteger(value)) return value;
            if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
        }
    }

    const match = fallbackText.match(/exit code\s+(-?\d+)/i) || fallbackText.match(/\bexit[_ ]?code\b\s*[:=]?\s*(-?\d+)/i);
    if (match) return Number(match[1]);

    return isError ? 1 : 0;
}

function summarizeToolResult(toolName, input, content, isError) {
    const normalizedName = normalizeToolName(toolName);
    const resultText = extractResultText(content);
    const preview = truncateText(resultText.replace(/\s+/g, ' ').trim(), 220);

    if (normalizedName === 'bash' || normalizedName === 'run' || normalizedName === 'execute_command') {
        const exitCode = extractExitCode(content, resultText, isError);
        const command = truncateText((input.command || input.script || '').trim(), 120);
        const status = `exit ${exitCode}`;
        return `${command ? `${command} -> ` : ''}${status}${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'read' || normalizedName === 'view' || normalizedName === 'read_file') {
        const target = getToolInputPath(input) || 'content';
        const lineCount = countListItems(resultText);
        return `${target} -> ${lineCount || 0} lines${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'grep' || normalizedName === 'search' || normalizedName === 'find') {
        const target = input.query || input.pattern || getToolInputPath(input) || 'query';
        const hitCount = countListItems(resultText);
        return `${target} -> ${hitCount || 0} hits${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'glob' || normalizedName === 'list_files' || normalizedName === 'ls') {
        const target = getToolInputPath(input) || 'files';
        const fileCount = countListItems(resultText);
        return `${target} -> ${fileCount || 0} entries${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'edit' || normalizedName === 'write' || normalizedName === 'str_replace_editor' || normalizedName === 'create' || normalizedName === 'save') {
        const target = getToolInputPath(input) || 'file';
        return `${isError ? 'failed' : 'completed'}: ${target}${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'delete' || normalizedName === 'remove') {
        const target = getToolInputPath(input) || 'file';
        return `${isError ? 'failed to delete' : 'deleted'} ${target}${preview ? ` | ${preview}` : ''}`;
    }

    if (normalizedName === 'move' || normalizedName === 'rename' || normalizedName === 'mv') {
        const from = input.source || input.from || input.old_path || 'old path';
        const to = input.destination || input.to || input.new_path || 'new path';
        return `${from} -> ${to}${preview ? ` | ${preview}` : ''}`;
    }

    if (!preview) {
        return isError ? 'error' : 'completed successfully';
    }

    return preview;
}

function createCompressionBudget() {
    return {
        usedChars: 0,
        linesByCategory: {
            user: 0,
            thinking: 0,
            toolCall: 0,
            toolError: 0,
            toolResult: 0,
            reply: 0,
            summary: 0
        },
        omittedByCategory: {
            user: 0,
            thinking: 0,
            toolCall: 0,
            toolError: 0,
            toolResult: 0,
            reply: 0,
            summary: 0
        },
        totalSkippedForBudget: 0
    };
}

function addCompressedLine(compressedLines, budget, category, line) {
    if (!line) return false;

    const maxLines = ANALYSIS_COMPRESSION_LIMITS.maxLines[category];
    if (typeof maxLines === 'number' && budget.linesByCategory[category] >= maxLines) {
        budget.omittedByCategory[category] += 1;
        return false;
    }

    const remainingChars = ANALYSIS_COMPRESSION_LIMITS.maxChars - budget.usedChars;
    if (remainingChars <= ANALYSIS_COMPRESSION_LIMITS.minRemainingChars) {
        budget.totalSkippedForBudget += 1;
        budget.omittedByCategory[category] += 1;
        return false;
    }

    const categoryCap = ANALYSIS_COMPRESSION_LIMITS.maxLineChars[category] || 240;
    const safeLimit = Math.min(categoryCap, remainingChars - 1);
    if (safeLimit <= 0) {
        budget.totalSkippedForBudget += 1;
        budget.omittedByCategory[category] += 1;
        return false;
    }

    const finalLine = truncateText(line, safeLimit);
    compressedLines.push(finalLine);
    budget.usedChars += Buffer.byteLength(`${finalLine}\n`, 'utf-8');
    budget.linesByCategory[category] += 1;
    return true;
}

function shouldIncludeToolResult(toolName, isError) {
    if (isError) return true;
    return PRIORITY_SUCCESS_RESULT_TOOLS.has(normalizeToolName(toolName));
}

function appendCompressionSummary(compressedLines, budget) {
    const omittedParts = Object.entries(budget.omittedByCategory)
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${category}:${count}`);

    if (omittedParts.length === 0 && budget.totalSkippedForBudget === 0) return;

    const suffix = budget.totalSkippedForBudget > 0
        ? ` | skipped for budget: ${budget.totalSkippedForBudget}`
        : '';

    const summaryLine = `[Compression summary] omitted ${omittedParts.join(', ')}${suffix}`;
    addCompressedLine(compressedLines, budget, 'summary', summaryLine);
}

// --- Lossless-style log compression helper ---
function compressLogContentForAnalysis(content, sourceLabel = 'uploaded content') {
    try {
        const lines = content.split('\n').filter(line => line.trim());
        const originalSize = Buffer.byteLength(content, 'utf-8');

        const compressedLines = [];
        const toolUseMap = new Map();
        const budget = createCompressionBudget();

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'unknown time';

                // User messages
                if (entry.type === 'user') {
                    let userText = '';
                    if (typeof entry.message?.content === 'string') {
                        userText = entry.message.content;
                    } else if (Array.isArray(entry.message?.content)) {
                        const blocks = entry.message.content;
                        userText = blocks
                            .filter(block => block.type === 'text')
                            .map(block => block.text)
                            .join('\n');

                        const toolResultBlocks = blocks.filter(block => block.type === 'tool_result');
                        for (const result of toolResultBlocks) {
                            const toolMeta = toolUseMap.get(result.tool_use_id) || {};
                            const toolName = toolMeta.name || 'tool';
                            const input = toolMeta.input || {};
                            if (!shouldIncludeToolResult(toolName, Boolean(result.is_error))) {
                                budget.omittedByCategory.toolResult += 1;
                                continue;
                            }
                            const summary = summarizeToolResult(toolName, input, result.content, Boolean(result.is_error));
                            const label = Boolean(result.is_error) ? 'Tool error' : 'Tool result';
                            addCompressedLine(
                                compressedLines,
                                budget,
                                Boolean(result.is_error) ? 'toolError' : 'toolResult',
                                `[${timestamp}] ${label} (${toolName}): ${summary}`
                            );
                        }
                    }
                    if (userText.trim()) {
                        addCompressedLine(compressedLines, budget, 'user', `[${timestamp}] User: ${truncateText(userText.trim(), 500)}`);
                    }
                    continue;
                }

                // Assistant messages
                if (entry.type === 'assistant') {
                    const contentBlocks = Array.isArray(entry.message?.content) ? entry.message.content : [];

                    // Extract thinking
                    const thinkingBlock = contentBlocks.find(block => block.type === 'thinking');
                    if (thinkingBlock?.thinking) {
                        const shortThinking = thinkingBlock.thinking.slice(0, 200) + (thinkingBlock.thinking.length > 200 ? '...' : '');
                        addCompressedLine(compressedLines, budget, 'thinking', `[${timestamp}] Assistant thinking: ${shortThinking}`);
                    }

                    // Extract tool calls
                    const toolUseBlocks = contentBlocks.filter(block => block.type === 'tool_use');
                    for (const toolUse of toolUseBlocks) {
                        const name = toolUse.name.toLowerCase();
                        const input = toolUse.input || {};
                        if (toolUse.id) {
                            toolUseMap.set(toolUse.id, { name, input });
                        }

                        if (name === 'bash' || name === 'execute_command') {
                            const cmd = (input.command || input.script || '').trim();
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant ran command: ${cmd.slice(0, 300)}${cmd.length > 300 ? '...' : ''}`);
                        } else if (name === 'edit' || name === 'write' || name === 'str_replace_editor') {
                            const filePath = input.path || input.file_path || 'unknown file';
                            const action = input.command === 'view' ? 'viewed file' : 'modified file';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant ${action}: ${filePath}`);
                        } else if (name === 'delete' || name === 'remove') {
                            const filePath = input.path || input.file_path || 'unknown file';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant deleted file: ${filePath}`);
                        } else if (name === 'move' || name === 'rename' || name === 'mv') {
                            const from = input.source || input.from || 'old path';
                            const to = input.destination || input.to || 'new path';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant renamed/moved: ${from} -> ${to}`);
                        } else if (name === 'grep' || name === 'search' || name === 'find') {
                            const query = input.query || input.pattern || '';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant searched: ${query}`);
                        } else if (name === 'view' || name === 'read_file' || name === 'glob' || name === 'list_files' || name === 'ls') {
                            const path = input.path || input.pattern || input.file_path || '';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant read/listed files: ${path}`);
                        } else if (name === 'computer' || name === 'computer_use') {
                            const action = input.action || 'unknown action';
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant used computer: ${action}`);
                        } else {
                            addCompressedLine(compressedLines, budget, 'toolCall', `[${timestamp}] Assistant called tool: ${name}`);
                        }
                    }

                    // Extract text replies
                    const textBlocks = contentBlocks.filter(block => block.type === 'text');
                    if (textBlocks.length > 0) {
                        const text = textBlocks.map(block => block.text).join('\n').trim();
                        if (text) {
                            addCompressedLine(compressedLines, budget, 'reply', `[${timestamp}] Assistant reply: ${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`);
                        }
                    }

                    // Tool results embedded in assistant content (if present)
                    if (Array.isArray(entry.message?.content)) {
                        const toolResultBlocks = entry.message.content.filter(block => block.type === 'tool_result');
                        for (const result of toolResultBlocks) {
                            const toolMeta = toolUseMap.get(result.tool_use_id) || {};
                            const toolName = toolMeta.name || 'tool';
                            const input = toolMeta.input || {};
                            if (!shouldIncludeToolResult(toolName, Boolean(result.is_error))) {
                                budget.omittedByCategory.toolResult += 1;
                                continue;
                            }
                            const summary = summarizeToolResult(toolName, input, result.content, Boolean(result.is_error));
                            const label = Boolean(result.is_error) ? 'Tool error' : 'Tool result';
                            addCompressedLine(
                                compressedLines,
                                budget,
                                Boolean(result.is_error) ? 'toolError' : 'toolResult',
                                `[${timestamp}] ${label} (${toolName}): ${summary}`
                            );
                        }
                    }
                }
            } catch (e) {
                // Ignore malformed lines
                continue;
            }
        }

        appendCompressionSummary(compressedLines, budget);
        const compressedContent = compressedLines.join('\n');
        const compressedSize = Buffer.byteLength(compressedContent, 'utf-8');
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        console.log(`[Compression complete] Original: ${(originalSize/1024).toFixed(1)}KB -> Compressed: ${(compressedSize/1024).toFixed(1)}KB -> Ratio: ${compressionRatio}%`);

        return compressedContent;
    } catch (e) {
        console.error(`[Compression failed] ${sourceLabel}`, e);
        return null;
    }
}

function compressLogForAnalysis(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return compressLogContentForAnalysis(content, filePath);
    } catch (e) {
        console.error('[Failed to read log file]', e);
        return null;
    }
}

// --- Parse session names from history.jsonl ---
function parseSessionNamesFromHistory() {
    const sessionNames = new Map(); // sessionId -> { name: string, timestamp: number }
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
    
    if (!fs.existsSync(historyPath)) {
        return sessionNames;
    }

    try {
        const content = fs.readFileSync(historyPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                // Check if this is a /rename command
                if (entry.display && entry.display.startsWith('/rename ') && entry.sessionId) {
                    const name = entry.display.replace(/^\/rename\s+/, '').trim();
                    const timestamp = entry.timestamp || 0;
                    
                    // Only keep the latest rename for each session
                    const existing = sessionNames.get(entry.sessionId);
                    if (!existing || existing.timestamp < timestamp) {
                        sessionNames.set(entry.sessionId, { name, timestamp });
                    }
                }
            } catch (e) {
                // Ignore malformed lines
            }
        }
    } catch (e) {
        console.error('[History] Failed to parse history.jsonl:', e);
    }
    
    return sessionNames;
}


/**
 * How to invoke the Claude CLI for a one-shot analysis.
 *
 * This used to pass `--bare`. On CLI 2.1.245 that flag skips enough of the
 * startup path that credentials never load, so every analysis came back as
 * "Not logged in · Please run /login" — while `claude -p` on the same machine
 * answered fine. `--safe-mode` is what `--bare` was reaching for (start
 * without customizations, so a user's hooks and plugins do not run as a side
 * effect of reading a log) and it keeps authentication.
 */
const CLAUDE_CLI_FLAGS = '--safe-mode';

/**
 * Decide whether the CLI actually produced an analysis.
 *
 * It exits 0 when it refuses to run: "Not logged in · Please run /login" is
 * printed on stdout and the process reports success. Checking only the exit
 * code meant that sentence was rendered to the user as the analysis — a
 * failure presented as a finished report, which is worse than an error,
 * because there is nothing to tell you it went wrong.
 *
 * Returns an error message, or null when the output looks like a real report.
 */
function describeAnalysisFailure(code, output) {
    const text = (output || '').trim();

    if (!text) {
        return code === 0
            ? 'The Claude CLI produced no output. Check that `claude -p` works in your terminal.'
            : `Analysis process exited unexpectedly (code: ${code}). Please check whether the local Claude CLI is available.`;
    }

    if (/not logged in|please run \/login/i.test(text)) {
        return 'The Claude CLI is not authenticated. Run `claude` in a terminal and complete /login, then try again.';
    }
    if (/invalid api key|authentication_error|401/i.test(text)) {
        return `The Claude CLI rejected the request: ${text.split('\n')[0]}`;
    }
    if (/credit balance|rate limit|quota/i.test(text)) {
        return `The Claude CLI could not run the analysis: ${text.split('\n')[0]}`;
    }

    // A report is long and multi-line. A single short line that came back in
    // well under the time an analysis takes is a status message, not a result.
    if (code === 0 && !text.includes('\n') && text.length < 120) {
        return `The Claude CLI returned a status message instead of an analysis: ${text}`;
    }

    if (code !== 0) {
        return `Analysis process exited unexpectedly (code: ${code}). Output so far: ${text.slice(0, 200)}`;
    }

    return null;
}

/**
 * Flatten hook attribution into one lookup the frontend can use directly:
 * command string → who owns it, or nothing when it cannot be told.
 */
function buildHookSourceIndex(projectCwd) {
    const sources = getHookSources(projectCwd);
    const resolved = {};

    for (const [command, origin] of Object.entries(sources.commands)) {
        resolved[command] = origin;
    }

    // Commands seen in logs but declared nowhere still resolve if exactly one
    // installed plugin ships the script they point at.
    return {
        ...sources,
        resolve: resolved,
        // Handed over so the client can ask about a command the scan never saw
        // declared — the server answers those on demand below.
        canResolveByFile: sources.pluginRoots.length > 0,
    };
}

// --- Discovery scanner with exclusions and full-path output ---
/**
 * Work out which plugin (or settings file) a hook command came from.
 *
 * The log records the command verbatim, and a plugin's hooks are written with
 * `${CLAUDE_PLUGIN_ROOT}` left unexpanded — so every plugin's PreToolUse hook
 * reads as `bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/pre-tool-use.sh` and the
 * session alone cannot say whose it is.
 *
 * It can be recovered, because the string in the log is byte-identical to the
 * one declared in the plugin's hooks.json. That is the primary match; failing
 * that, the path after the placeholder is checked against each plugin's install
 * directory.
 *
 * This resolves against what is installed on THIS machine right now, which is
 * not necessarily what was installed when the trace was recorded. Callers are
 * expected to say so rather than present the answer as fact.
 */
const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';

function readJsonSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

/** Pull every declared command out of a hooks config block. */
function collectDeclaredCommands(hooksConfig, into, origin) {
    if (!hooksConfig || typeof hooksConfig !== 'object') return;
    for (const [event, matchers] of Object.entries(hooksConfig)) {
        if (!Array.isArray(matchers)) continue;
        for (const matcher of matchers) {
            const entries = matcher && Array.isArray(matcher.hooks) ? matcher.hooks : [];
            for (const hook of entries) {
                if (!hook || typeof hook.command !== 'string') continue;
                const existing = into.get(hook.command);
                if (existing) {
                    // Two sources declaring the same command cannot be told
                    // apart from the log, so neither is claimed.
                    if (existing.name !== origin.name) existing.ambiguous = true;
                    if (!existing.events.includes(event)) existing.events.push(event);
                    continue;
                }
                into.set(hook.command, {
                    ...origin,
                    events: [event],
                    timeout: typeof hook.timeout === 'number' ? hook.timeout : undefined,
                    ambiguous: false,
                });
            }
        }
    }
}

function getHookSources(projectCwd) {
    const byCommand = new Map();
    const plugins = [];

    // 1. Installed plugins: their declared commands, and their install roots.
    const installed = readJsonSafe(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'));
    for (const [key, entries] of Object.entries(installed?.plugins ?? {})) {
        const list = Array.isArray(entries) ? entries : [entries];
        for (const entry of list) {
            const root = entry?.installPath;
            if (!root) continue;
            const [name, marketplace] = key.split('@');
            const origin = { source: 'plugin', name: name || key, marketplace, root, version: entry.version };
            plugins.push(origin);

            const hooksJson =
                readJsonSafe(path.join(root, 'hooks', 'hooks.json')) ??
                readJsonSafe(path.join(root, '.claude-plugin', 'hooks.json'));
            collectDeclaredCommands(hooksJson?.hooks ?? hooksJson, byCommand, origin);
        }
    }

    // 2. Settings files, whose commands are literal paths and need no resolving
    //    but should still be attributable.
    const settingsFiles = [
        path.join(os.homedir(), '.claude', 'settings.json'),
        path.join(os.homedir(), '.claude', 'settings.local.json'),
    ];
    if (projectCwd) {
        settingsFiles.push(path.join(projectCwd, '.claude', 'settings.json'));
        settingsFiles.push(path.join(projectCwd, '.claude', 'settings.local.json'));
    }
    for (const file of settingsFiles) {
        const settings = readJsonSafe(file);
        if (!settings?.hooks) continue;
        collectDeclaredCommands(settings.hooks, byCommand, {
            source: 'settings',
            name: file.replace(os.homedir(), '~'),
        });
    }

    return {
        commands: Object.fromEntries(byCommand),
        // Kept so a command nobody declared can still be traced by looking for
        // the script inside each plugin.
        pluginRoots: plugins.map(({ name, marketplace, root, version }) => ({ name, marketplace, root, version })),
        placeholder: PLUGIN_ROOT_TOKEN,
        scannedAt: new Date().toISOString(),
    };
}

/** Fallback: find which plugin actually ships the script a command points at. */
function resolveByFile(command, pluginRoots) {
    const index = command.indexOf(PLUGIN_ROOT_TOKEN);
    if (index < 0) return null;
    const relative = command.slice(index + PLUGIN_ROOT_TOKEN.length).trim().split(/\s/)[0].replace(/^\/+/, '');
    if (!relative) return null;

    const matches = pluginRoots.filter((plugin) => {
        try {
            return fs.statSync(path.join(plugin.root, relative)).isFile();
        } catch {
            return false;
        }
    });
    if (matches.length !== 1) return matches.length > 1 ? { ambiguous: true } : null;
    return { source: 'plugin', name: matches[0].name, marketplace: matches[0].marketplace, root: matches[0].root, ambiguous: false };
}

const SUBAGENT_DIR_NAME = 'subagents';
// How often to look for transcripts of agents dispatched mid-session.
const SUBAGENT_SCAN_INTERVAL_MS = 2000;

/**
 * Locate the transcripts of the agents a session dispatched.
 *
 * They live one level below the session file, at
 *   <project>/<sessionId>/subagents/agent-<agentId>.jsonl
 * — a directory the scanner never descended into, so none of this work has
 * ever been visible. (The old `project === 'subagents'` exclusion guarded
 * <project-root>/subagents, a path that does not exist.)
 */
function getSubagentDir(projectPath, sessionId) {
    return path.join(projectPath, sessionId, SUBAGENT_DIR_NAME);
}

function findSubagentLogs(projectPath, sessionId) {
    const dir = getSubagentDir(projectPath, sessionId);
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        // No dispatches, or no permission — either way there is nothing to add.
        return [];
    }

    const found = [];
    for (const name of names) {
        if (!name.endsWith('.jsonl')) continue;
        const fullPath = path.join(dir, name);
        try {
            const stats = fs.statSync(fullPath);
            if (!stats.isFile()) continue;
            found.push({
                agentId: name.replace(/^agent-/, '').replace(/\.jsonl$/, ''),
                fileName: name,
                fullPath,
                lastUpdated: stats.mtime,
                size: (stats.size / 1024).toFixed(1) + ' KB',
            });
        } catch {
            // Ignore per-file read errors.
        }
    }
    return found.sort((a, b) => a.lastUpdated - b.lastUpdated);
}

/** The subagent directory that belongs to a session's log file, if any. */
function subagentDirForLogFile(filePath) {
    const sessionId = path.basename(filePath).replace(/\.jsonl$/, '');
    if (sessionId === path.basename(filePath)) return null; // not a .jsonl
    return getSubagentDir(path.dirname(filePath), sessionId);
}

function getRecentSessions(hours = 24) {
    if (!fs.existsSync(CLAUDE_BASE_DIR)) {
        return [];
    }
    
    const sessions = [];
    const now = Date.now();
    // Calculate scan window based on hours parameter (default 24 hours)
    const SCAN_WINDOW = hours * 60 * 60 * 1000;
    
    // Parse session names from history.jsonl
    const sessionNames = parseSessionNamesFromHistory();

    try {
        const projects = fs.readdirSync(CLAUDE_BASE_DIR);

        projects.forEach(project => {
            const projectPath = path.join(CLAUDE_BASE_DIR, project);
            if (!fs.statSync(projectPath).isDirectory()) return;

            const files = fs.readdirSync(projectPath);
            files.forEach(file => {
                if (!file.endsWith('.jsonl')) return;
                
                const filePath = path.join(projectPath, file);
                try {
                    const stats = fs.statSync(filePath);
                    // Collect recently active sessions.
                    if (now - stats.mtimeMs <= SCAN_WINDOW) {
                        // Extract sessionId from filename (remove .jsonl extension)
                        const sessionId = file.replace(/\.jsonl$/, '');
                        const renameInfo = sessionNames.get(sessionId);
                        const subagents = findSubagentLogs(projectPath, sessionId);

                        sessions.push({
                            id: file, // Full filename
                            folderName: project.replace(/^-Users-/, '').replace(/^-Users/, ''), // Strip the -Users prefix
                            fullPath: filePath,
                            lastUpdated: stats.mtime,
                            size: (stats.size / 1024).toFixed(1) + ' KB',
                            sessionName: renameInfo?.name || null,
                            // Reported alongside the session rather than as sessions of
                            // their own: a transcript with no user in it is not something
                            // you would open on its own.
                            subagents
                        });
                    }
                } catch (e) {
                    // Ignore per-file read errors.
                }
            });
        });
    } catch (err) {
        console.error('[Discovery] Scan failed:', err);
    }

    // Sort from newest to oldest.
    return sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

// --- File watcher class ---
class LogFileWatcher {
    constructor(ws) {
        this.ws = ws;
        this.watcher = null;
        this.activeFile = null;
        /**
         * Per-file read state, keyed by path.
         *
         * A session is no longer a single file: the agents it dispatches write
         * their own transcripts beside it, and each of those grows on its own
         * schedule. One shared position would make every file clobber the
         * others' offsets.
         *
         * Each value is { pos, lineBuffer }, where lineBuffer holds a trailing
         * partial line across reads — a watch event can fire while a line is
         * only half-written, and the remainder must survive until the rest of
         * it lands.
         */
        this.tracked = new Map();
        // Reads are async, so serialize them: two overlapping reads of the same
        // file would interleave their chunks and corrupt every line.
        this.readChain = Promise.resolve();
        // Polls the subagent directory into existence; see watchPath.
        this.subagentScanTimer = null;
        this.subagentDir = null;
    }

    watchPath(filePath) {
        if (this.watcher) this.watcher.close();
        this.activeFile = filePath;
        this.tracked = new Map();

        console.log(`[Watcher] Starting live watch: ${filePath}`);

        const targets = [filePath];

        const subagentDir = subagentDirForLogFile(filePath);
        if (subagentDir && fs.existsSync(subagentDir)) {
            targets.push(subagentDir);
            console.log(`[Watcher] Also watching subagent transcripts: ${subagentDir}`);
        }

        this.watcher = chokidar.watch(targets, {
            persistent: true,
            ignoreInitial: false
        });

        // Initial read of the session file. The 'add' event covers it too, but
        // only if chokidar emits one — this makes the first read unconditional.
        this.readNewLines(filePath);

        this.watcher.on('add', (p) => this.onFileEvent(p));
        this.watcher.on('change', (p) => this.onFileEvent(p));

        this.startSubagentScan(subagentDir);
    }

    /**
     * Find subagent transcripts that appear after the watch has started.
     *
     * The directory does not exist until the session dispatches its first
     * agent, and chokidar (v4+) will not watch a path that is not there yet —
     * so the case that matters most, an agent dispatched while you are
     * watching, is exactly the one an ordinary watch misses. A cheap poll
     * finds it, and hands the file to chokidar so its appends still arrive
     * without waiting for the next tick.
     */
    startSubagentScan(subagentDir) {
        this.stopSubagentScan();
        if (!subagentDir) return;
        this.subagentDir = subagentDir;

        const scan = () => {
            let names;
            try {
                names = fs.readdirSync(this.subagentDir);
            } catch {
                return; // Not dispatched yet.
            }
            for (const name of names) {
                if (!name.endsWith('.jsonl')) continue;
                const full = path.join(this.subagentDir, name);
                if (this.tracked.has(full)) continue;
                console.log(`[Watcher] New subagent transcript: ${name}`);
                this.readNewLines(full);
                if (this.watcher) this.watcher.add(full);
            }
        };

        scan();
        this.subagentScanTimer = setInterval(scan, SUBAGENT_SCAN_INTERVAL_MS);
    }

    stopSubagentScan() {
        if (this.subagentScanTimer) clearInterval(this.subagentScanTimer);
        this.subagentScanTimer = null;
    }

    onFileEvent(filePath) {
        // The subagent watch is on a directory, so it reports whatever lands
        // in it. Only transcripts are log data.
        if (!filePath.endsWith('.jsonl')) return;
        this.readNewLines(filePath);
    }

    /** Register a file's read position, creating it on first sight. */
    trackFile(filePath) {
        let state = this.tracked.get(filePath);
        if (!state) {
            state = { pos: 0, lineBuffer: '' };
            this.tracked.set(filePath, state);
        }
        return state;
    }

    readNewLines(filePath) {
        // Registered up front, not inside the queued read: the scan uses
        // `tracked` to tell new files from known ones, and a read that only
        // registers when it runs would let the next tick queue it again.
        this.trackFile(filePath);
        // Queue behind any in-flight read so chunks stay in file order.
        this.readChain = this.readChain.then(() => this.readNewLinesOnce(filePath));
        return this.readChain;
    }

    readNewLinesOnce(filePath) {
        return new Promise((resolve) => {
            if (!filePath || !fs.existsSync(filePath)) return resolve();

            const state = this.trackFile(filePath);

            let stats;
            try {
                stats = fs.statSync(filePath);
            } catch {
                return resolve();
            }

            if (stats.size < state.pos) {
                // The file was truncated or replaced; start over.
                state.pos = stats.size;
                state.lineBuffer = '';
                return resolve();
            }

            if (stats.size === state.pos) return resolve();

            const readTo = stats.size;
            const stream = fs.createReadStream(filePath, {
                start: state.pos,
                end: readTo,
            });

            // Decode as UTF-8 across chunk boundaries. Without this, a
            // multi-byte character split between two chunks is decoded
            // independently on each side and becomes replacement characters.
            stream.setEncoding('utf8');

            stream.on('data', (chunk) => {
                state.lineBuffer += chunk;
                const lines = state.lineBuffer.split('\n');
                // The tail is only a complete line if the data ended on a
                // newline; otherwise it waits here for the rest.
                state.lineBuffer = lines.pop();
                lines.forEach((line) => {
                    if (line.trim()) {
                        // Subagent lines ride the same channel as the session's
                        // own: every one of them carries `agentId`, so the
                        // parser attributes them by field rather than by which
                        // file or in what order they arrived.
                        this.sendToFrontend('log-entry', line);
                    }
                });
            });

            // Advance only once the bytes are actually buffered, so a failed
            // read does not silently skip them.
            stream.on('end', () => {
                state.pos = readTo;
                resolve();
            });

            stream.on('error', (err) => {
                console.error('[Watcher] Read failed:', err);
                resolve();
            });
        });
    }

    sendToFrontend(type, payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    stop() {
        this.stopSubagentScan();
        if (this.watcher) this.watcher.close();
    }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get('/', (_req, res) => {
    res.json({
        name: 'Claude Trace Replay backend',
        status: 'ok',
        websocket: 'ws://localhost:4000',
        frontend: 'http://localhost:3000'
    });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

wss.on('connection', (ws) => {
    const watcher = new LogFileWatcher(ws);

    ws.on('message', (message) => {
        try {
            const { type, data } = JSON.parse(message);
            if (type === 'get-discovery-list') {
                const hours = data?.hours || 24;
                const list = getRecentSessions(hours);
                ws.send(JSON.stringify({ type: 'discovery-list', payload: list }));
                // Sent alongside the list because the frontend cannot read the
                // filesystem, and a hook command in a log names no owner.
                ws.send(JSON.stringify({ type: 'hook-sources', payload: buildHookSourceIndex(data?.cwd) }));
            } else if (type === 'get-hook-sources') {
                // Requested again once a session is open, because a project's
                // own .claude/settings.json can only be found via its cwd.
                ws.send(JSON.stringify({ type: 'hook-sources', payload: buildHookSourceIndex(data?.cwd) }));
            } else if (type === 'resolve-hook-command') {
                // For a command the declared-hooks scan did not cover, look for
                // the script inside each installed plugin.
                const command = typeof data?.command === 'string' ? data.command : '';
                const sources = getHookSources(data?.cwd);
                const byFile = command ? resolveByFile(command, sources.pluginRoots) : null;
                ws.send(JSON.stringify({
                    type: 'hook-command-resolved',
                    payload: { command, origin: sources.commands[command] ?? byFile ?? null },
                }));
            } else if (type === 'start-watch') {
                console.log(`[DEBUG] Received start-watch: ${data.path}`);
                watcher.watchPath(data.path);
            } else if (type === 'run-claude-analysis') {
                console.log('[DEBUG] Received run-claude-analysis request:', JSON.stringify(data));
                const targetPath = data?.path || watcher.activeFile;
                const rawContent = typeof data?.content === 'string' ? data.content : '';
                const customPrompt = data?.prompt;

                if (!targetPath && !rawContent) {
                    console.error('[DEBUG] Analysis failed: no valid path or log content was provided.');
                    ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: 'No active file path or uploaded log content was provided.' }));
                    return;
                }

                console.log(`[DEBUG] Analysis source confirmed: ${targetPath || 'offline uploaded content'}`);
                console.log(`[DEBUG] Using custom prompt: ${customPrompt ? 'yes' : 'no (using default)'}`);
                ws.send(JSON.stringify({ type: 'claude-analysis-start' }));

                try {
                    // Compress the log before handing it to the CLI.
                    const sourceContent = targetPath ? fs.readFileSync(targetPath, 'utf-8') : rawContent;
                    const compressedContent = compressLogContentForAnalysis(sourceContent, targetPath || 'offline uploaded content');
                    if (!compressedContent) {
                        ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: 'Failed to compress the log. Please check the file content.' }));
                        return;
                    }

                    // Write a temporary file.
                    const tempFilePath = path.join(os.tmpdir(), `claude_compressed_${Date.now()}.txt`);
                    fs.writeFileSync(tempFilePath, compressedContent, 'utf-8');
                    console.log(`[Temp file] Written: ${tempFilePath}`);

                    // Use either the custom prompt or the default prompt.
                    const finalPrompt = customPrompt
                        ? `${customPrompt}\n\n${LANGUAGE_RULE}`
                        : CLI_ANALYSIS_PROMPT;

                    // Execute through the shell, matching the existing CLI workflow.
                    const command = `cat "${tempFilePath}" | claude ${CLAUDE_CLI_FLAGS} -p "${finalPrompt.replace(/"/g, '\\"')}"`;
                    console.log(`[Executing command] ${command.slice(0, 200)}...`);

                    const claudeProcess = exec(command, { shell: '/bin/bash' });

                    let fullOutput = '';

                    claudeProcess.stdout.on('data', (chunk) => {
                        const text = chunk.toString();
                        fullOutput += text;
                        console.log(`[DEBUG] Claude Output: ${text.slice(0, 20)}...`);
                        ws.send(JSON.stringify({ type: 'claude-analysis-chunk', payload: text }));
                    });

                    claudeProcess.stderr.on('data', (chunk) => {
                        const text = chunk.toString();
                        console.error(`[DEBUG] Claude Stderr: ${text}`);
                        // Filter out common noisy output.
                        if (!text.includes('Progress')) {
                            ws.send(JSON.stringify({ type: 'claude-analysis-chunk', payload: `\n[CLI Info]: ${text}` }));
                        }
                    });

                    claudeProcess.on('error', (err) => {
                        console.error('[DEBUG] Claude Process Error:', err);
                        // Clean up the temporary file.
                        fs.unlinkSync(tempFilePath);
                        ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `Failed to start Claude: ${err.message}. Please make sure the Claude CLI is installed and available in PATH.` }));
                    });

                    claudeProcess.on('close', (code) => {
                        console.log(`[DEBUG] Claude CLI process exited. Exit code: ${code}`);
                        // Clean up the temporary file.
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}

                        const failure = describeAnalysisFailure(code, fullOutput);
                        if (failure) {
                            ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: failure }));
                        } else {
                            ws.send(JSON.stringify({ type: 'claude-analysis-end', payload: fullOutput }));
                        }
                    });

                } catch (err) {
                    console.error('[DEBUG] Execution Exception:', err);
                    ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `Execution error: ${err.message}` }));
                }
            } else if (type === 'compare-sessions-analysis') {
                // Session comparison analysis
                const { sessionA, sessionB } = data || {};
                console.log('[DEBUG] Received compare-sessions-analysis request');

                if (!sessionA || !sessionB) {
                    ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: 'Missing session data.' }));
                    return;
                }

                ws.send(JSON.stringify({ type: 'compare-analysis-start' }));

                try {
                    // Combine the two sessions into a single comparison payload.
                    const compareContent = `[Session A]\n${sessionA}\n\n[Session B]\n${sessionB}`;

                    // Write a temporary file.
                    const tempFilePath = path.join(os.tmpdir(), `claude_compare_${Date.now()}.txt`);
                    fs.writeFileSync(tempFilePath, compareContent, 'utf-8');
                    console.log(`[Temp file] Written: ${tempFilePath}`);

                    // Execute through the shell.
                    const command = `cat "${tempFilePath}" | claude ${CLAUDE_CLI_FLAGS} -p "${COMPARE_ANALYSIS_PROMPT.replace(/"/g, '\\"')}"`;
                    console.log(`[Executing command] ${command.slice(0, 200)}...`);

                    const claudeProcess = exec(command, { shell: '/bin/bash' });

                    let fullOutput = '';

                    claudeProcess.stdout.on('data', (chunk) => {
                        const text = chunk.toString();
                        fullOutput += text;
                        ws.send(JSON.stringify({ type: 'compare-analysis-chunk', payload: text }));
                    });

                    claudeProcess.stderr.on('data', (chunk) => {
                        const text = chunk.toString();
                        if (!text.includes('Progress')) {
                            ws.send(JSON.stringify({ type: 'compare-analysis-chunk', payload: `\n[CLI Info]: ${text}` }));
                        }
                    });

                    claudeProcess.on('error', (err) => {
                        console.error('[DEBUG] Claude Process Error:', err);
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}
                        ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `Failed to start Claude: ${err.message}` }));
                    });

                    claudeProcess.on('close', (code) => {
                        console.log(`[DEBUG] Claude CLI process exited. Exit code: ${code}`);
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}

                        const failure = describeAnalysisFailure(code, fullOutput);
                        if (failure) {
                            ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: failure }));
                        } else {
                            ws.send(JSON.stringify({ type: 'compare-analysis-end', payload: fullOutput }));
                        }
                    });

                } catch (err) {
                    console.error('[DEBUG] Execution Exception:', err);
                    ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `Execution error: ${err.message}` }));
                }
            } else if (type === 'load-session-content') {
                // Load session content for comparison
                const { path: sessionPath } = data || {};
                console.log(`[DEBUG] Received load-session-content request: ${sessionPath}`);

                if (!sessionPath) {
                    ws.send(JSON.stringify({ type: 'session-content-error', payload: { error: 'No path provided' } }));
                    return;
                }

                try {
                    if (fs.existsSync(sessionPath)) {
                        const content = fs.readFileSync(sessionPath, 'utf-8');
                        ws.send(JSON.stringify({
                            type: 'session-content',
                            payload: { content, path: sessionPath }
                        }));
                        console.log(`[DEBUG] Session content loaded: ${sessionPath}, size: ${content.length} chars`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'session-content-error',
                            payload: { error: 'File not found' }
                        }));
                        console.error(`[DEBUG] Session file not found: ${sessionPath}`);
                    }
                } catch (err) {
                    console.error('[DEBUG] Failed to load session content:', err);
                    ws.send(JSON.stringify({
                        type: 'session-content-error',
                        payload: { error: err.message }
                    }));
                }
            }
        } catch (e) { }
    });

    ws.on('close', () => watcher.stop());
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`✅ Discovery Server Ready: http://localhost:${PORT}`);
});
