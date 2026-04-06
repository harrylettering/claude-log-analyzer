import { createContext, useContext, ReactNode } from 'react';
import { useBudget } from '../hooks/useBudget';
import type { BudgetConfig, BudgetUsage } from '../types/budget';

interface BudgetContextType {
  config: BudgetConfig;
  setConfig: (config: BudgetConfig) => void;
  resetConfig: () => void;
  currentBudget: number;
  totalCost: number;
  budgetUsage: BudgetUsage;
  periodInfo: {
    start: Date;
    end: Date;
    period: 'monthly' | 'weekly';
  };
  updateSessionCost: (sessionId: string, cost: number) => void;
  removeSessionCost: (sessionId: string) => void;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

interface BudgetProviderProps {
  children: ReactNode;
}

export function BudgetProvider({ children }: BudgetProviderProps) {
  const budget = useBudget();

  return (
    <BudgetContext.Provider value={budget}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudgetContext() {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudgetContext must be used within a BudgetProvider');
  }
  return context;
}
