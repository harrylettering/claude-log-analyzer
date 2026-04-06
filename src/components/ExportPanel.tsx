
import { useState } from 'react';
import { Download, FileText, FileJson, FileSpreadsheet, CheckCircle } from 'lucide-react';
import type { ParsedLogData } from '../types/log';

interface ExportPanelProps {
  data: ParsedLogData;
}

export function ExportPanel({ data }: ExportPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    setExporting('json');
    setTimeout(() => {
      const content = JSON.stringify(data, null, 2);
      downloadFile(content, 'claude-log-export.json', 'application/json');
      setExporting(null);
      setExported('json');
      setTimeout(() => setExported(null), 2000);
    }, 500);
  };

  const exportCSV = () => {
    setExporting('csv');
    setTimeout(() => {
      // 导出消息为 CSV
      const headers = ['timestamp', 'type', 'role', 'content_preview', 'tokens_input', 'tokens_output', 'tokens_total'];
      const rows = data.entries.map(entry => {
        const msg = entry.message;
        let contentPreview = '';
        let inputTokens = '';
        let outputTokens = '';
        let totalTokens = '';

        if (msg?.content) {
          if (typeof msg.content === 'string') {
            contentPreview = msg.content.substring(0, 100).replace(/\n/g, ' ');
          } else if (Array.isArray(msg.content)) {
            const first = msg.content[0];
            if (first?.type === 'text') {
              contentPreview = ((first as any).text || '').substring(0, 100).replace(/\n/g, ' ');
            } else if (first?.type === 'tool_use') {
              contentPreview = `tool:${(first as any).name}`;
            }
          }
        }

        if (msg?.usage) {
          const usage = msg.usage as unknown as Record<string, unknown>;
          inputTokens = String(usage.input_tokens ?? usage.inputTokens ?? '');
          outputTokens = String(usage.output_tokens ?? usage.outputTokens ?? '');
          totalTokens = String(usage.total_tokens ?? usage.totalTokens ?? '');
        }

        return [
          entry.timestamp,
          entry.type,
          msg?.role || '',
          `"${contentPreview.replace(/"/g, '""')}"`,
          inputTokens,
          outputTokens,
          totalTokens,
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      downloadFile(csvContent, 'claude-log-export.csv', 'text/csv');
      setExporting(null);
      setExported('csv');
      setTimeout(() => setExported(null), 2000);
    }, 500);
  };

  const exportReport = () => {
    setExporting('report');
    setTimeout(() => {
      const { stats } = data;
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claude Log Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f8fafc; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; }
    h2 { color: #334155; margin-top: 32px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f1f5f9; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .stat-value { font-size: 28px; font-weight: bold; color: #1e293b; }
    .stat-label { color: #64748b; font-size: 14px; margin-top: 4px; }
    .tool-list { list-style: none; padding: 0; }
    .tool-item { padding: 12px; background: #f8fafc; border-radius: 6px; margin: 8px 0; }
    .token-summary { background: #eff6ff; padding: 20px; border-radius: 8px; margin: 16px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Claude Log 报告</h1>

    <h2>会话概览</h2>
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${stats.totalMessages}</div>
        <div class="stat-label">总消息数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.userMessages}</div>
        <div class="stat-label">用户消息</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.assistantMessages}</div>
        <div class="stat-label">助手消息</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.toolCalls}</div>
        <div class="stat-label">工具调用</div>
      </div>
    </div>

    <h2>Token 使用</h2>
    <div class="token-summary">
      <div class="stats">
        <div class="stat-card" style="border-left-color: #3b82f6;">
          <div class="stat-value">${stats.inputTokens.toLocaleString()}</div>
          <div class="stat-label">输入 Token</div>
        </div>
        <div class="stat-card" style="border-left-color: #8b5cf6;">
          <div class="stat-value">${stats.outputTokens.toLocaleString()}</div>
          <div class="stat-label">输出 Token</div>
        </div>
        <div class="stat-card" style="border-left-color: #f59e0b;">
          <div class="stat-value">${stats.totalTokens.toLocaleString()}</div>
          <div class="stat-label">总计 Token</div>
        </div>
      </div>
    </div>

    <h2>使用的模型</h2>
    <ul class="tool-list">
      ${stats.modelsUsed.map(m => `<li class="tool-item">${m}</li>`).join('')}
    </ul>

    <h2>工具使用</h2>
    <ul class="tool-list">
      ${data.toolCalls.length > 0
        ? data.toolCalls.slice(0, 10).map(t => `
          <li class="tool-item">
            <strong>${t.name}</strong> - ${new Date(t.timestamp).toLocaleString()}
            ${t.isError ? '<span style="color: #ef4444;">(失败)</span>' : '<span style="color: #10b981;">(成功)</span>'}
          </li>
        `).join('')
        : '<li class="tool-item">无工具调用</li>'
      }
    </ul>
    ${data.toolCalls.length > 10 ? `<p style="color: #64748b;">... 还有 ${data.toolCalls.length - 10} 个工具调用</p>` : ''}

    <div class="footer">
      报告生成时间: ${new Date().toLocaleString()}<br>
      Claude Log Visualization
    </div>
  </div>
</body>
</html>`;
      downloadFile(htmlContent, 'claude-log-report.html', 'text/html');
      setExporting(null);
      setExported('report');
      setTimeout(() => setExported(null), 2000);
    }, 500);
  };

  const exportRaw = () => {
    setExporting('raw');
    setTimeout(() => {
      // 将所有条目导出为 JSONL
      const content = data.entries.map(e => JSON.stringify(e)).join('\n');
      downloadFile(content, 'claude-log-raw.jsonl', 'application/jsonl');
      setExporting(null);
      setExported('raw');
      setTimeout(() => setExported(null), 2000);
    }, 500);
  };

  const exportOptions = [
    {
      id: 'json',
      title: '导出 JSON',
      description: '完整的解析数据，包含所有统计信息',
      icon: <FileJson className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      action: exportJSON,
    },
    {
      id: 'csv',
      title: '导出 CSV',
      description: '表格格式，适合在 Excel 中分析',
      icon: <FileSpreadsheet className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
      action: exportCSV,
    },
    {
      id: 'report',
      title: '导出 HTML 报告',
      description: '美观的可视化报告，便于分享',
      icon: <FileText className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      action: exportReport,
    },
    {
      id: 'raw',
      title: '导出原始 JSONL',
      description: '原始日志格式，可重新导入',
      icon: <FileText className="w-6 h-6" />,
      color: 'from-orange-500 to-amber-500',
      action: exportRaw,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">导出数据</h2>
        <p className="text-slate-400">选择格式导出日志数据</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportOptions.map((option) => (
          <button
            key={option.id}
            onClick={option.action}
            disabled={exporting !== null}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-slate-600 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg bg-gradient-to-br ${option.color} opacity-20 group-hover:opacity-30 transition-opacity`}>
                <div className={option.color.replace('from-', 'text-').replace(' to-', '-500').split(' ')[0]}>
                  {option.icon}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{option.title}</h3>
                  {exported === option.id && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-1">{option.description}</p>
              </div>
              <Download className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            </div>
            {exporting === option.id && (
              <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                导出中...
              </div>
            )}
          </button>
        ))}
      </div>

      {/* 导出预览 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">数据概览</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm">会话数</div>
            <div className="text-2xl font-bold mt-1">1</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm">消息条目</div>
            <div className="text-2xl font-bold mt-1">{data.entries.length}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm">工具调用</div>
            <div className="text-2xl font-bold mt-1">{data.toolCalls.length}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Token 统计</div>
            <div className="text-2xl font-bold mt-1">{data.stats.totalTokens.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
