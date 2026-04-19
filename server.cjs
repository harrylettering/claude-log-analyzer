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

// --- Discovery scanner with exclusions and full-path output ---
function getRecentSessions() {
    if (!fs.existsSync(CLAUDE_BASE_DIR)) {
        return [];
    }
    
    const sessions = [];
    const now = Date.now();
    // Scan the last 24 hours to keep discovery stable while avoiding stale sessions.
    const SCAN_WINDOW = 24 * 60 * 60 * 1000;

    try {
        const projects = fs.readdirSync(CLAUDE_BASE_DIR);

        projects.forEach(project => {
            // Exclude the subagents folder.
            if (project === 'subagents') return;

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
                        sessions.push({
                            id: file, // Full filename
                            folderName: project.replace(/^-Users-/, '').replace(/^-Users/, ''), // Strip the -Users prefix
                            fullPath: filePath,
                            lastUpdated: stats.mtime,
                            size: (stats.size / 1024).toFixed(1) + ' KB'
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
        this.currentPos = 0;
        this.activeFile = null;
    }

    watchPath(filePath) {
        if (this.watcher) this.watcher.close();
        this.activeFile = filePath;
        this.currentPos = 0; 

        console.log(`[Watcher] Starting live watch: ${filePath}`);
        
        // Attach the watcher.
        this.watcher = chokidar.watch(filePath, { 
            persistent: true,
            ignoreInitial: false 
        });
        
        // Initial read.
        this.readNewLines();
        
        this.watcher.on('change', () => this.readNewLines());
    }

    readNewLines() {
        if (!this.activeFile || !fs.existsSync(this.activeFile)) return;
        const stats = fs.statSync(this.activeFile);
        
        if (stats.size > this.currentPos) {
            const stream = fs.createReadStream(this.activeFile, {
                start: this.currentPos,
                end: stats.size
            });

            let buffer = '';
            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                if (buffer.includes('\n')) {
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach(line => {
                        if (line.trim()) {
                            this.sendToFrontend('log-entry', line);
                        }
                    });
                }
            });
            this.currentPos = stats.size;
        } else if (stats.size < this.currentPos) {
            this.currentPos = stats.size;
        }
    }

    sendToFrontend(type, payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    stop() {
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
                const list = getRecentSessions();
                ws.send(JSON.stringify({ type: 'discovery-list', payload: list }));
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
                    const command = `cat "${tempFilePath}" | claude --bare -p "${finalPrompt.replace(/"/g, '\\"')}"`;
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

                        if (code !== 0 && !fullOutput) {
                            ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `Analysis process exited unexpectedly (code: ${code}). Please check whether the local Claude CLI is available.` }));
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
                    const command = `cat "${tempFilePath}" | claude --bare -p "${COMPARE_ANALYSIS_PROMPT.replace(/"/g, '\\"')}"`;
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

                        if (code !== 0 && !fullOutput) {
                            ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `Analysis process exited unexpectedly (code: ${code})` }));
                        } else {
                            ws.send(JSON.stringify({ type: 'compare-analysis-end', payload: fullOutput }));
                        }
                    });

                } catch (err) {
                    console.error('[DEBUG] Execution Exception:', err);
                    ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `Execution error: ${err.message}` }));
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
