import { CourseMetrics } from './metrics';

export interface CourseResult {
  courseId: string;
  domain: string;
  passed: boolean;
  metrics: CourseMetrics;
}

export interface GhostTranscript {
  totalCourses: number;
  coursesPassed: number;
  coursesFailed: number;
  passRate: number;
  weakSkills: string[];
  strongSkills: string[];
  businessDomainsEvaluated: string[];
  learningCurve: any[]; // trend over time
  knowledgeGrowth: number;
  confidenceGrowth: number;
}

export function generateTranscript(results: CourseResult[]): GhostTranscript {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;
  
  const domains = Array.from(new Set(results.map(r => r.domain)));

  // Aggregate metrics to find weak/strong skills
  const aggregateMetrics: Record<keyof CourseMetrics, number[]> = {
    business_understanding: [],
    generalization: [],
    clarification_quality: [],
    knowledge_evolution: [],
    execution_accuracy: [],
    recovery: [],
    confidence_calibration: [],
    human_trust: []
  };

  for (const r of results) {
    for (const [key, value] of Object.entries(r.metrics)) {
      (aggregateMetrics as any)[key].push(value);
    }
  }

  const averageMetrics: Record<string, number> = {};
  for (const [key, values] of Object.entries(aggregateMetrics)) {
    averageMetrics[key] = values.length > 0 ? values.reduce((a,b) => a+b, 0) / values.length : 0;
  }

  const sortedSkills = Object.entries(averageMetrics).sort((a,b) => a[1] - b[1]);
  const weakSkills = sortedSkills.slice(0, 3).map(s => s[0]);
  const strongSkills = sortedSkills.slice(-3).reverse().map(s => s[0]);

  return {
    totalCourses: results.length,
    coursesPassed: passed,
    coursesFailed: failed,
    passRate,
    weakSkills,
    strongSkills,
    businessDomainsEvaluated: domains,
    learningCurve: [], // placeholder for actual trend line
    knowledgeGrowth: 100, // placeholder metrics
    confidenceGrowth: 100
  };
}
