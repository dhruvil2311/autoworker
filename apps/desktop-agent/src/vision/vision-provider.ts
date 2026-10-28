import type { DesktopUIElementBounds } from "@ghost/workflow-schema";

export interface OCRMatch {
  text: string;
  confidence: number;
  bounds: DesktopUIElementBounds;
}

export interface OCRProvider {
  extractText(screenshotBase64: string): Promise<OCRMatch[]>;
  findText(screenshotBase64: string, targetText: string): Promise<OCRMatch | null>;
}

export interface VisionLocalizationResult {
  targetText?: string;
  confidence: number;
  boundingBox: DesktopUIElementBounds;
  action: string;
  reason: string;
}

export interface ComputerVisionProvider {
  locateElement(
    screenshotBase64: string,
    prompt: string,
    actionType: string
  ): Promise<VisionLocalizationResult | null>;
}

export class MockOCRProvider implements OCRProvider {
  constructor(private mockMatches: OCRMatch[] = []) {}

  async extractText(_screenshotBase64: string): Promise<OCRMatch[]> {
    return this.mockMatches;
  }

  async findText(_screenshotBase64: string, targetText: string): Promise<OCRMatch | null> {
    const found = this.mockMatches.find(m => m.text.toLowerCase().includes(targetText.toLowerCase()));
    return found || null;
  }
}

export class MockComputerVisionProvider implements ComputerVisionProvider {
  private minConfidenceThreshold = 0.85;

  constructor(
    private mockResults: Map<string, VisionLocalizationResult> = new Map(),
    minConfidence = 0.85
  ) {
    this.minConfidenceThreshold = minConfidence;
  }

  async locateElement(
    _screenshotBase64: string,
    prompt: string,
    actionType: string
  ): Promise<VisionLocalizationResult | null> {
    const candidate = this.mockResults.get(prompt);
    if (!candidate) {
      // Default heuristic mock
      return {
        targetText: prompt,
        confidence: 0.95,
        boundingBox: { x: 500, y: 300, width: 120, height: 40 },
        action: actionType,
        reason: `Vision localized element matching "${prompt}" with high visual confidence`
      };
    }

    if (candidate.confidence < this.minConfidenceThreshold) {
      return {
        ...candidate,
        reason: `Vision confidence ${candidate.confidence} is below policy threshold ${this.minConfidenceThreshold}`
      };
    }

    return candidate;
  }
}
