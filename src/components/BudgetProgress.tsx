import { AlertTriangle, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import type { BudgetUsage } from '../types/budget';

interface BudgetProgressProps {
  usage: BudgetUsage;
  showDetails?: boolean;
  compact?: boolean;
}

// 格式化成本显示
function formatCost(cost: number): string {
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}

// 获取状态颜色
function getStatusColors(status: BudgetUsage['status']) {
  switch (status) {
    case 'normal':
      return {
        bar: 'bg-green-500',
        bg: 'bg-green-500/20',
        text: 'text-green-400',
        border: 'border-green-500/30',
      };
    case 'warning':
      return {
        bar: 'bg-amber-500',
        bg: 'bg-amber-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
      };
    case 'critical':
      return {
        bar: 'bg-red-500',
        bg: 'bg-red-500/20',
        text: 'text-red-400',
        border: 'border-red-500/50',
      };
  }
}

// 获取状态图标
function getStatusIcon(status: BudgetUsage['status']) {
  switch (status) {
    case 'normal':
      return <CheckCircle className="w-4 h-4" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4" />;
    case 'critical':
      return <XCircle className="w-4 h-4" />;
  }
}

export function BudgetProgress({ usage, showDetails = true, compact = false }: BudgetProgressProps) {
  const colors = getStatusColors(usage.status);
  const displayPercentage = Math.min(usage.percentage, 100);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg ${colors.bg}`}>
          <div className={colors.text}>{getStatusIcon(usage.status)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-medium ${colors.text}`}>
              {usage.percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-400">
              {formatCost(usage.currentCost)} / {formatCost(usage.budget)}
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.bar} transition-all duration-500`}
              style={{ width: `${displayPercentage}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-5 rounded-xl border ${colors.border} ${colors.bg}`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${colors.bg}`}>
          <div className={colors.text}>
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                预算使用
                <span className={`inline-flex items-center gap-1 text-sm ${colors.text}`}>
                  {getStatusIcon(usage.status)}
                  {usage.status === 'normal' && '正常'}
                  {usage.status === 'warning' && '接近预算'}
                  {usage.status === 'critical' && '已超支'}
                </span>
              </h3>
            </div>
            <div className={`text-2xl font-bold ${colors.text}`}>
              {usage.percentage.toFixed(1)}%
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full ${colors.bar} transition-all duration-500 rounded-full`}
              style={{ width: `${displayPercentage}%` }}
            />
          </div>

          {showDetails && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-400 text-xs mb-1">已使用</div>
                <div className="font-medium">{formatCost(usage.currentCost)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">预算</div>
                <div className="font-medium">{formatCost(usage.budget)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">剩余</div>
                <div className={`font-medium ${usage.status === 'critical' ? 'text-red-400' : 'text-green-400'}`}>
                  {usage.status === 'critical' ? '-' : ''}{formatCost(usage.remaining)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
