import { Provenance, Confidence } from "../types.js";

export type ObservationType = 
  | "BROWSER_EVENT"
  | "DOM_SNAPSHOT"
  | "API_CALL"
  | "CSV_DATA"
  | "EXCEL_DATA"
  | "SOP_DOCUMENT"
  | "CLARIFICATION"
  | "HITL_CORRECTION"
  | "DESKTOP_EVENT"
  | "VIDEO_EVIDENCE"
  | "SCREENSHOT_EVIDENCE";

export interface BaseObservation {
  id: string;
  type: ObservationType;
  timestamp: string;
  sourceUri?: string;
}

export interface DesktopEventObservation extends BaseObservation {
  type: "DESKTOP_EVENT";
  application: string;
  windowTitle?: string;
  action: string;
  target?: any;
  value?: string;
  confidence?: number;
  frameIds?: string[];
}

export interface VideoEvidenceObservation extends BaseObservation {
  type: "VIDEO_EVIDENCE";
  application: string;
  startSeconds: number;
  endSeconds: number;
  frameIds: string[];
  semanticAction: string;
  confidence: number;
}

export interface ScreenshotEvidenceObservation extends BaseObservation {
  type: "SCREENSHOT_EVIDENCE";
  application?: string;
  detectedText?: string;
  uiElements?: any[];
  confidence?: number;
}

export interface BrowserEventObservation extends BaseObservation {
  type: "BROWSER_EVENT";
  eventType: "click" | "input" | "navigate" | "scroll" | "keydown";
  targetSelector?: string;
  targetText?: string;
  value?: string;
  url: string;
}

export interface DomSnapshotObservation extends BaseObservation {
  type: "DOM_SNAPSHOT";
  html: string;
  url: string;
}

export interface ApiCallObservation extends BaseObservation {
  type: "API_CALL";
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  endpoint: string;
  requestBody?: any;
  responseBody?: any;
  statusCode: number;
}

export interface CsvDataObservation extends BaseObservation {
  type: "CSV_DATA";
  headers: string[];
  rows: Record<string, any>[];
  filename: string;
}

export interface ExcelDataObservation extends BaseObservation {
  type: "EXCEL_DATA";
  headers: string[];
  rows: Record<string, any>[];
  filename: string;
  sheetName?: string;
}

export interface SopDocumentObservation extends BaseObservation {
  type: "SOP_DOCUMENT";
  content: string;
  title: string;
}

export interface ClarificationObservation extends BaseObservation {
  type: "CLARIFICATION";
  question: string;
  answer: string;
}

export interface HitlCorrectionObservation extends BaseObservation {
  type: "HITL_CORRECTION";
  correctedNodeId?: string;
  correctionDetail: string;
}

export type Observation = 
  | BrowserEventObservation
  | DomSnapshotObservation
  | ApiCallObservation
  | CsvDataObservation
  | ExcelDataObservation
  | SopDocumentObservation
  | ClarificationObservation
  | HitlCorrectionObservation
  | DesktopEventObservation
  | VideoEvidenceObservation
  | ScreenshotEvidenceObservation;

export interface ExtractedNodeMetadata {
  provenance: Provenance[];
  confidence: Confidence;
  extractionMethod: string;
  missingInformation?: string[];
}

export interface UnresolvedNode {
  id: string;
  type: "UNRESOLVED";
  description: string;
  possibleInterpretations: string[];
  metadata: ExtractedNodeMetadata;
}
