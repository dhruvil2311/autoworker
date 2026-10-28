import type { DesktopTargetSelector, DesktopTargetStrategy, DesktopUIElementBounds } from "@ghost/workflow-schema";
import type { WindowsUIProvider } from "../windows/provider.js";
import type { OCRProvider, ComputerVisionProvider } from "../vision/vision-provider.js";

export interface ResolvedTargetEvidence {
  strategyRank: number;
  strategyUsed: DesktopTargetStrategy;
  source: string;
  matchedDetails?: Record<string, any> | undefined;
  timestamp: string;
}

export interface ResolvedTargetLocation {
  strategyUsed: DesktopTargetStrategy;
  confidence: number;
  centerCoordinates: { x: number; y: number };
  bounds?: DesktopUIElementBounds | undefined;
  elementName?: string | undefined;
  source: string;
  evidence: ResolvedTargetEvidence;
}

export const DEFAULT_TARGETING_HIERARCHY: DesktopTargetStrategy[] = [
  "NATIVE_API",
  "DOM",
  "UIA",
  "ACCESSIBILITY",
  "SEMANTIC_SELECTOR",
  "OCR",
  "VISION",
  "COORDINATE"
];

export class TargetingResolver {
  private hierarchyOrder: DesktopTargetStrategy[];

  constructor(
    private windowsUIProvider: WindowsUIProvider,
    private ocrProvider?: OCRProvider,
    private visionProvider?: ComputerVisionProvider,
    customHierarchy?: DesktopTargetStrategy[]
  ) {
    this.hierarchyOrder = customHierarchy && customHierarchy.length > 0
      ? customHierarchy
      : DEFAULT_TARGETING_HIERARCHY;
  }

  public getHierarchyOrder(): DesktopTargetStrategy[] {
    return [...this.hierarchyOrder];
  }

  public setHierarchyOrder(order: DesktopTargetStrategy[]): void {
    if (order && order.length > 0) {
      this.hierarchyOrder = [...order];
    }
  }

  async resolveTarget(
    rawSelector: DesktopTargetSelector,
    screenshotBase64?: string
  ): Promise<ResolvedTargetLocation> {
    const selector: DesktopTargetSelector = (rawSelector as any)?.selector
      ? { ...rawSelector, ...(rawSelector as any).selector }
      : rawSelector;

    // Check if the selector requested a specific single strategy
    const requestedStrategy = selector.strategy;

    // We evaluate strategies in the configured hierarchy order.
    // If the selector explicitly requested a specific strategy, we prioritize it first,
    // followed by the remaining hierarchy order.
    const evaluationOrder: DesktopTargetStrategy[] = requestedStrategy
      ? [requestedStrategy, ...this.hierarchyOrder.filter(s => s !== requestedStrategy)]
      : this.hierarchyOrder;

    for (let i = 0; i < evaluationOrder.length; i++) {
      const strategy = evaluationOrder[i]!;
      const rank = i + 1;

      switch (strategy) {
        case "NATIVE_API": {
          if (requestedStrategy === "NATIVE_API" && selector.coordinate) {
            return {
              strategyUsed: "NATIVE_API",
              confidence: 0.99,
              centerCoordinates: { x: selector.coordinate.x, y: selector.coordinate.y },
              elementName: selector.name || selector.application,
              source: "Native Application API",
              evidence: {
                strategyRank: rank,
                strategyUsed: "NATIVE_API",
                source: "Native Application API Hook",
                matchedDetails: { application: selector.application },
                timestamp: new Date().toISOString()
              }
            };
          }
          break;
        }

        case "DOM": {
          if (requestedStrategy === "DOM") {
            const elements = await this.windowsUIProvider.inspectElements({
              windowTitle: selector.windowTitle,
              name: selector.name || selector.visibleText,
              controlType: selector.controlType
            });
            if (elements.length > 0 && elements[0]?.bounds) {
              const bounds = elements[0].bounds;
              return {
                strategyUsed: "DOM",
                confidence: 0.96,
                centerCoordinates: {
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + bounds.height / 2
                },
                bounds,
                elementName: elements[0].name || elements[0].automationId,
                source: "Browser DOM / Accessibility Tree",
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "DOM",
                  source: "Browser DOM Tree",
                  matchedDetails: { element: elements[0] },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "UIA": {
          if (selector.automationId || selector.name || selector.controlType || selector.className || selector.semanticRole || requestedStrategy === "UIA") {
            const uiaElement = await this.windowsUIProvider.findElement(selector);
            if (uiaElement && uiaElement.bounds && uiaElement.visible) {
              const bounds = uiaElement.bounds;
              return {
                strategyUsed: "UIA",
                confidence: 0.99,
                centerCoordinates: {
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + bounds.height / 2
                },
                bounds,
                elementName: uiaElement.name || uiaElement.automationId,
                source: "Windows UI Automation",
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "UIA",
                  source: "Windows UI Automation API",
                  matchedDetails: { automationId: uiaElement.automationId, controlType: uiaElement.controlType },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "ACCESSIBILITY": {
          if (requestedStrategy === "ACCESSIBILITY" || selector.controlType || selector.name) {
            const elements = await this.windowsUIProvider.inspectElements({
              windowTitle: selector.windowTitle,
              name: selector.name || selector.visibleText,
              controlType: selector.controlType
            });
            if (elements.length > 0 && elements[0]?.bounds) {
              const bounds = elements[0].bounds;
              return {
                strategyUsed: "ACCESSIBILITY",
                confidence: 0.93,
                centerCoordinates: {
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + bounds.height / 2
                },
                bounds,
                elementName: elements[0].name,
                source: "Accessibility Metadata",
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "ACCESSIBILITY",
                  source: "Accessibility Element Tree",
                  matchedDetails: { elementCount: elements.length, matchedElement: elements[0] },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "SEMANTIC_SELECTOR": {
          if (requestedStrategy === "SEMANTIC_SELECTOR" || selector.semanticRole || selector.visibleText || selector.context) {
            const elements = await this.windowsUIProvider.inspectElements({
              windowTitle: selector.windowTitle,
              name: selector.visibleText || selector.name,
              controlType: selector.controlType || selector.semanticRole
            });
            if (elements.length > 0 && elements[0]?.bounds) {
              const bounds = elements[0].bounds;
              return {
                strategyUsed: "SEMANTIC_SELECTOR",
                confidence: 0.90,
                centerCoordinates: {
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + bounds.height / 2
                },
                bounds,
                elementName: elements[0].name,
                source: "Application Semantics",
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "SEMANTIC_SELECTOR",
                  source: `Semantic Match: role="${selector.semanticRole || ''}", text="${selector.visibleText || ''}"`,
                  matchedDetails: { context: selector.context, element: elements[0] },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "OCR": {
          if (this.ocrProvider && (selector.ocrText || requestedStrategy === "OCR") && screenshotBase64) {
            const targetText = selector.ocrText || selector.visibleText || selector.text!;
            const match = await this.ocrProvider.findText(screenshotBase64, targetText);
            if (match) {
              return {
                strategyUsed: "OCR",
                confidence: match.confidence,
                centerCoordinates: {
                  x: match.bounds.x + match.bounds.width / 2,
                  y: match.bounds.y + match.bounds.height / 2
                },
                bounds: match.bounds,
                elementName: match.text,
                source: `OCR Text Match: "${match.text}"`,
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "OCR",
                  source: `Optical Character Recognition: query="${targetText}" matched="${match.text}"`,
                  matchedDetails: { textMatch: match.text, matchConfidence: match.confidence },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "VISION": {
          if (this.visionProvider && (selector.visionPrompt || requestedStrategy === "VISION") && screenshotBase64) {
            const prompt = selector.visionPrompt || selector.semanticRole || selector.visibleText || selector.name || "element";
            const visionRes = await this.visionProvider.locateElement(screenshotBase64, prompt, "CLICK");
            if (visionRes) {
              return {
                strategyUsed: "VISION",
                confidence: visionRes.confidence,
                centerCoordinates: {
                  x: visionRes.boundingBox.x + visionRes.boundingBox.width / 2,
                  y: visionRes.boundingBox.y + visionRes.boundingBox.height / 2
                },
                bounds: visionRes.boundingBox,
                elementName: visionRes.targetText || prompt,
                source: `Computer Vision: ${visionRes.reason}`,
                evidence: {
                  strategyRank: rank,
                  strategyUsed: "VISION",
                  source: `Vision Model Localization: prompt="${prompt}"`,
                  matchedDetails: { reason: visionRes.reason, confidence: visionRes.confidence },
                  timestamp: new Date().toISOString()
                }
              };
            }
          }
          break;
        }

        case "COORDINATE": {
          if (selector.coordinate) {
            return {
              strategyUsed: "COORDINATE",
              confidence: selector.confidence ?? 0.60,
              centerCoordinates: {
                x: selector.coordinate.x,
                y: selector.coordinate.y
              },
              source: "Direct Screen Coordinates Fallback",
              evidence: {
                strategyRank: rank,
                strategyUsed: "COORDINATE",
                source: "Coordinate Fallback (Lowest Tier)",
                matchedDetails: { coordinate: selector.coordinate },
                timestamp: new Date().toISOString()
              }
            };
          }
          break;
        }
      }
    }

    // Recurse into fallback selector if provided
    if (selector.fallback) {
      return this.resolveTarget(selector.fallback, screenshotBase64);
    }

    throw new Error(`Targeting failed: Could not locate element using any strategy in hierarchy for ${JSON.stringify(selector)}`);
  }
}
