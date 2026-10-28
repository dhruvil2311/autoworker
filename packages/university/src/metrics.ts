export interface CourseMetrics {
  business_understanding: number;
  generalization: number;
  clarification_quality: number;
  knowledge_evolution: number;
  execution_accuracy: number;
  recovery: number;
  confidence_calibration: number;
  human_trust: number;
}

export function calculateAverageScore(metrics: CourseMetrics): number {
  const values = Object.values(metrics);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
