import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export class BlindValidator {
  private baseDir: string;
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || crypto.randomUUID();
    this.baseDir = path.join(__dirname, "blind", this.sessionId);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    console.log(`[Blind Validation] Session initialized: ${this.sessionId}`);
  }

  private hashData(data: any): string {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  private freeze(filename: string, data: any) {
    const filePath = path.join(this.baseDir, filename);
    if (fs.existsSync(filePath)) {
      throw new Error(`[Blind Validation] Violation: Cannot overwrite frozen artifact ${filename}`);
    }
    
    const wrapper = {
      timestamp: new Date().toISOString(),
      hash: this.hashData(data),
      data
    };
    
    fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2));
    console.log(`[Blind Validation] Froze ${filename} (Hash: ${wrapper.hash})`);
    return wrapper.hash;
  }

  public freezeRecording(recordingUpload: any) {
    return this.freeze("1_recording.json", recordingUpload);
  }

  public freezeInitialInference(bps: any, gaps: any) {
    return this.freeze("2_initial_inference.json", { bps, gaps });
  }

  public freezeClarificationAnswers(answers: any) {
    return this.freeze("3_clarification_answers.json", answers);
  }

  public freezeFinalPlan(bps: any, executionPlan: any, workflow: any) {
    return this.freeze("4_final_plan.json", { bps, executionPlan, workflow });
  }

  public freezeEvaluation(groundTruth: any, comparisonResult: any) {
    return this.freeze("5_evaluation.json", { groundTruth, comparisonResult });
  }

  public getSessionId() {
    return this.sessionId;
  }
}

// Example usage when run directly
if (process.argv[1].includes("blind-validator.ts")) {
  const mode = process.argv[2];
  if (mode === "create") {
    new BlindValidator();
  }
}
