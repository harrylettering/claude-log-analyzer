export interface BudgetConfig {
  monthlyBudget: number;
  weeklyBudget: number;
  budgetPeriod: 'monthly' | 'weekly';
  alertThreshold: number;
}

export interface BudgetUsage {
  currentCost: number;
  budget: number;
  percentage: number;
  remaining: number;
  status: 'normal' | 'warning' | 'critical';
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  monthlyBudget: 50,
  weeklyBudget: 20,
  budgetPeriod: 'monthly',
  alertThreshold: 80,
};

export const BUDGET_STORAGE_KEY = 'claude-log-budget-config';
