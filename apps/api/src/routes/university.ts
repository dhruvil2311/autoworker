import { Router, type Request, type Response } from "express";
import { CourseCapturePipeline, KnowledgeLifecycleManager, CandidateCourse, ApprovedCourse } from "@ghost/university";

const router = Router();
const capturePipeline = new CourseCapturePipeline();
const lifecycleManager = new KnowledgeLifecycleManager();

// In-memory store for the sake of the demonstration
// In production, these would be backed by Supabase / PostgreSQL
const candidatesDb: CandidateCourse[] = [];
const approvedDb: ApprovedCourse[] = [];

// Helper
const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
  (req: Request, res: Response, next: any) => 
    Promise.resolve(fn(req, res)).catch(next);

router.post("/capture", asyncHandler(async (req, res) => {
  const { inputs } = req.body;
  if (!inputs || !Array.isArray(inputs)) {
    return res.status(400).json({ error: "Missing or invalid inputs array" });
  }

  const candidate = await capturePipeline.capture(inputs);
  candidatesDb.push(candidate);
  
  res.status(201).json(candidate);
}));

router.get("/candidates", asyncHandler(async (req, res) => {
  res.json({ candidates: candidatesDb.filter(c => c.status === 'PENDING_REVIEW') });
}));

router.post("/candidates/:id/approve", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const candidateIndex = candidatesDb.findIndex(c => c.id === id);
  
  if (candidateIndex === -1) {
    return res.status(404).json({ error: "Candidate not found" });
  }

  const candidate = candidatesDb[candidateIndex];
  if (!candidate || candidate.status !== 'PENDING_REVIEW') {
    return res.status(400).json({ error: "Candidate is not pending review" });
  }

  const metadata = req.body.metadata;
  if (!metadata || !metadata.difficulty || !metadata.businessDomain || !metadata.automationType || !metadata.risk || !metadata.requiredKnowledge || !metadata.expectedCompetencies) {
    return res.status(400).json({ error: "Missing required metadata for approval" });
  }

  // Find previous version if it exists in the same domain
  const previousVersion = approvedDb
    .filter(c => c.businessDomain === metadata.businessDomain)
    .sort((a, b) => b.version.localeCompare(a.version))[0];

  const approvedCourse = lifecycleManager.approveCandidate(candidate, metadata, previousVersion);
  
  // Update databases
  const updatedCandidate = candidatesDb[candidateIndex];
  if (updatedCandidate) {
    updatedCandidate.status = 'APPROVED';
  }
  approvedDb.push(approvedCourse);

  res.status(200).json({ course: approvedCourse });
}));

router.get("/analytics", asyncHandler(async (req, res) => {
  // Aggregate mock analytics for the dashboard
  res.json({
    totalApprovedCourses: approvedDb.length,
    pendingCandidates: candidatesDb.filter(c => c.status === 'PENDING_REVIEW').length,
    domains: Array.from(new Set(approvedDb.map(c => c.businessDomain))),
    averageConfidence: 96,
    learningCurve: [
      { date: "2026-08-01", competency: 85 },
      { date: "2026-08-05", competency: 96 }
    ]
  });
}));

export const universityRouter = router;
