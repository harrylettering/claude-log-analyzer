import { useState, useCallback } from 'react';
import { X, DollarSign, Calendar, AlertTriangle, RotateCcw, Save } from 'lucide-react';
import type { BudgetConfig } from '../types/budget';

interface BudgetSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: BudgetConfig;
  onSave: (config: BudgetConfig) => void;
  onReset: () => void;
}

export function BudgetSettings({ isOpen, onClose, config, onSave, onReset }: BudgetSettingsProps) {
  const [localConfig, setLocalConfig] = useState<BudgetConfig>(config);

  // 当 config 变化时更新本地状态
  const updateLocalConfig = useCallback((updates: Partial<BudgetConfig>) => {
    setLocalConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // 保存并关闭
  const handleSave = useCallback(() => {
    onSave(localConfig);
    onClose();
  }, [localConfig, onSave, onClose]);

  // 重置
  const handleReset = useCallback(() => {
    if (confirm('确定要重置为默认设置吗？')) {
      onReset();
      onClose();
    }
  }, [onReset, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">预算设置</h2>
              <p className="text-sm text-slate-400">配置您的成本预算和告警</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-6 space-y-6">
          {/* 预算周期 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <Calendar className="w-4 h-4" />
              预算周期
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => updateLocalConfig({ budgetPeriod: 'monthly' })}
                className={`flex-1 py-3 px-4 rounded-lg border transition-all ${
                  localConfig.budgetPeriod === 'monthly'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-medium">月度</div>
                <div className="text-xs opacity-70">自然月</div>
              </button>
              <button
                onClick={() => updateLocalConfig({ budgetPeriod: 'weekly' })}
                className={`flex-1 py-3 px-4 rounded-lg border transition-all ${
                  localConfig.budgetPeriod === 'weekly'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-medium">周度</div>
                <div className="text-xs opacity-70">周一至周日</div>
              </button>
            </div>
          </div>

          {/* 预算金额 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <DollarSign className="w-4 h-4" />
              {localConfig.budgetPeriod === 'monthly' ? '月度预算' : '周度预算'}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={localConfig.budgetPeriod === 'monthly' ? localConfig.monthlyBudget : localConfig.weeklyBudget}
                onChange={(e) => {
                  const value = Math.max(0, Number(e.target.value) || 0);
                  updateLocalConfig(
                    localConfig.budgetPeriod === 'monthly'
                      ? { monthlyBudget: value }
                      : { weeklyBudget: value }
                  );
                }}
                className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入预算金额"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              设置为 0 表示不启用预算限制
            </p>
          </div>

          {/* 告警阈值 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
              <AlertTriangle className="w-4 h-4" />
              告警阈值
            </label>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={localConfig.alertThreshold}
                  onChange={(e) => updateLocalConfig({ alertThreshold: Number(e.target.value) })}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="w-16 text-right font-mono text-blue-400">
                  {localConfig.alertThreshold}%
                </span>
              </div>
              <p className="text-xs text-slate-500">
                当预算使用达到 {localConfig.alertThreshold}% 时显示警告，超过 100% 时显示危险提示
              </p>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-3 p-6 border-t border-slate-700">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重置默认
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
