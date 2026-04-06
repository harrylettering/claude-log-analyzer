import type {
  SessionPattern,
  PatternLibraryExport,
  PatternType,
} from '../types/sessionPattern';

const STORAGE_KEY = 'session-patterns';

export class PatternLibrary {
  private patterns: Map<string, SessionPattern> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        data.forEach((pattern: SessionPattern) => {
          this.patterns.set(pattern.id, pattern);
        });
      }
    } catch (e) {
      console.error('Failed to load pattern library:', e);
    }
  }

  private save(): void {
    try {
      const patterns = Array.from(this.patterns.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
    } catch (e) {
      console.error('Failed to save pattern library:', e);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ========== 模式查询 ==========

  getAllPatterns(): SessionPattern[] {
    return Array.from(this.patterns.values()).sort((a, b) =>
      b.createdAt - a.createdAt
    );
  }

  getPatternsByType(type: PatternType): SessionPattern[] {
    return this.getAllPatterns().filter((p) => p.type === type);
  }

  getPatternsByRating(minScore: number): SessionPattern[] {
    const ratingScores: Record<string, number> = {
      excellent: 90,
      good: 75,
      moderate: 50,
      needs_improvement: 30,
    };
    return this.getAllPatterns().filter(
      (p) => (ratingScores[p.successRating] || 0) >= minScore
    );
  }

  getFavorites(): SessionPattern[] {
    return this.getAllPatterns().filter((p) => p.isFavorite);
  }

  getPattern(id: string): SessionPattern | undefined {
    return this.patterns.get(id);
  }

  searchPatterns(query: string): SessionPattern[] {
    const q = query.toLowerCase();
    return this.getAllPatterns().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // ========== 模式管理 ==========

  addPattern(pattern: SessionPattern): SessionPattern {
    this.patterns.set(pattern.id, pattern);
    this.save();
    return pattern;
  }

  updatePattern(
    id: string,
    updates: Partial<Omit<SessionPattern, 'id' | 'createdAt' | 'isManual'>>
  ): SessionPattern | null {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      return null;
    }
    const updated: SessionPattern = {
      ...pattern,
      ...updates,
      updatedAt: Date.now(),
    };
    this.patterns.set(id, updated);
    this.save();
    return updated;
  }

  deletePattern(id: string): boolean {
    const deleted = this.patterns.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  toggleFavorite(id: string): SessionPattern | null {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      return null;
    }
    return this.updatePattern(id, { isFavorite: !pattern.isFavorite });
  }

  incrementUsage(id: string): SessionPattern | null {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      return null;
    }
    return this.updatePattern(id, { usageCount: pattern.usageCount + 1 });
  }

  duplicatePattern(id: string): SessionPattern | null {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      return null;
    }
    const duplicated: SessionPattern = {
      ...pattern,
      id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${pattern.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      isFavorite: false,
      isManual: true,
    };
    this.patterns.set(duplicated.id, duplicated);
    this.save();
    return duplicated;
  }

  // ========== 批量操作 ==========

  addPatterns(patterns: SessionPattern[]): SessionPattern[] {
    const added: SessionPattern[] = [];
    patterns.forEach((pattern) => {
      // 避免重复
      if (!this.patterns.has(pattern.id)) {
        this.patterns.set(pattern.id, pattern);
        added.push(pattern);
      }
    });
    if (added.length > 0) {
      this.save();
    }
    return added;
  }

  deleteAllPatterns(): void {
    this.patterns.clear();
    this.save();
  }

  // ========== 导入导出 ==========

  exportLibrary(): PatternLibraryExport {
    return {
      version: '1.0',
      exportedAt: Date.now(),
      patterns: this.getAllPatterns(),
    };
  }

  importLibrary(data: PatternLibraryExport): number {
    let imported = 0;
    data.patterns.forEach((pattern) => {
      if (!this.patterns.has(pattern.id)) {
        this.patterns.set(pattern.id, pattern);
        imported++;
      }
    });
    if (imported > 0) {
      this.save();
    }
    return imported;
  }

  downloadJSON(data: any, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async readJSONFile(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          resolve(JSON.parse(content));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // ========== 统计 ==========

  getStats(): {
    totalPatterns: number;
    byType: Record<PatternType, number>;
    byRating: Record<string, number>;
    totalUsage: number;
    favoriteCount: number;
  } {
    const byType: Record<string, number> = {};
    const byRating: Record<string, number> = {};
    let totalUsage = 0;
    let favoriteCount = 0;

    this.getAllPatterns().forEach((pattern) => {
      byType[pattern.type] = (byType[pattern.type] || 0) + 1;
      byRating[pattern.successRating] = (byRating[pattern.successRating] || 0) + 1;
      totalUsage += pattern.usageCount;
      if (pattern.isFavorite) favoriteCount++;
    });

    return {
      totalPatterns: this.patterns.size,
      byType: byType as Record<PatternType, number>,
      byRating,
      totalUsage,
      favoriteCount,
    };
  }
}

// 单例实例
export const patternLibrary = new PatternLibrary();
