import { useState, useCallback, useMemo } from 'react';
import type { BudgetConfig, BudgetUsage } from '../types/budget';
import { DEFAULT_BUDGET_CONFIG, BUDGET_STORAGE_KEY } from '../types/budget';

// 计算周期起始时间
function getPeriodStart(period: 'monthly' | 'weekly'): Date {
  const now = new Date();
  if (period === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff));
  }
}

// 加载预算配置
function loadBudgetConfig(): BudgetConfig {
  try {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_BUDGET_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load budget config:', e);
  }
  return DEFAULT_BUDGET_CONFIG;
}

// 保存预算配置
function saveBudgetConfig(config: BudgetConfig): void {
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save budget config:', e);
  }
}

// 计算预算使用状态
function calculateBudgetUsage(currentCost: number, budget: number, alertThreshold: number): BudgetUsage {
  const percentage = budget > 0 ? (currentCost / budget) * 100 : 0;
  const remaining = Math.max(0, budget - currentCost);

  let status: BudgetUsage['status'] = 'normal';
  if (percentage >= 100) {
    status = 'critical';
  } else if (percentage >= alertThreshold) {
    status = 'warning';
  }

  return {
    currentCost,
    budget,
    percentage: Math.min(percentage, 150),
    remaining,
    status,
  };
}

export function useBudget() {
  const [config, setConfigState] = useState<BudgetConfig>(loadBudgetConfig);
  const [trackedCosts, setTrackedCosts] = useState<Map<string, number>>(new Map());

  // 保存配置
  const setConfig = useCallback((newConfig: BudgetConfig) => {
    setConfigState(newConfig);
    saveBudgetConfig(newConfig);
  }, []);

  // 重置配置
  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_BUDGET_CONFIG);
  }, [setConfig]);

  // 更新单个会话成本
  const updateSessionCost = useCallback((sessionId: string, cost: number) => {
    setTrackedCosts(prev => {
      const next = new Map(prev);
      next.set(sessionId, cost);
      return next;
    });
  }, []);

  // 移除会话成本
  const removeSessionCost = useCallback((sessionId: string) => {
    setTrackedCosts(prev => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  // 当前预算金额
  const currentBudget = useMemo(() => {
    return config.budgetPeriod === 'monthly' ? config.monthlyBudget : config.weeklyBudget;
  }, [config]);

  // 总成本
  const totalCost = useMemo(() => {
    return Array.from(trackedCosts.values()).reduce((sum, cost) => sum + cost, 0);
  }, [trackedCosts]);

  // 预算使用状态
  const budgetUsage = useMemo(() => {
    return calculateBudgetUsage(totalCost, currentBudget, config.alertThreshold);
  }, [totalCost, currentBudget, config.alertThreshold]);

  // 周期信息
  const periodInfo = useMemo(() => {
    const start = getPeriodStart(config.budgetPeriod);
    return {
      start,
      end: config.budgetPeriod === 'monthly'
        ? new Date(start.getFullYear(), start.getMonth() + 1, 0)
        : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      period: config.budgetPeriod,
    };
  }, [config.budgetPeriod]);

  return {
    config,
    setConfig,
    resetConfig,
    currentBudget,
    totalCost,
    budgetUsage,
    periodInfo,
    updateSessionCost,
    removeSessionCost,
  };
}
