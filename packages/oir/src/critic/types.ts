export interface Criticism {
  problem: string;
  evidence: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedFix: string;
  confidence: number;
}

export interface ReviewReport {
  timestamp: string;
  criticisms: Criticism[];
  metrics: {
    totalCriticisms: number;
    structuralFailures: number; // e.g., missing dependencies, dangling references
    semanticFlaws: number; // e.g., hidden assumptions, contradictory rules
    evidenceCompleteness: number; // percentage
  };
}
