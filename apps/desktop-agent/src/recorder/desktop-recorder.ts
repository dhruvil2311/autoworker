import type { DesktopUIElement } from "@ghost/workflow-schema";
import type { WindowsUIProvider } from "../windows/provider.js";

export interface RawDemonstrationEvent {
  id: string;
  timestamp: string;
  eventType: "MOUSE_CLICK" | "KEYBOARD_INPUT" | "WINDOW_ACTIVATE" | "APP_LAUNCH" | "HOTKEY";
  application?: string;
  windowTitle?: string;
  coordinates?: { x: number; y: number };
  inputValue?: string;
  key?: string;
  uiElement?: DesktopUIElement;
  screenshotBefore?: string;
  screenshotAfter?: string;
}

export interface SemanticActionTraceItem {
  id: string;
  semanticAction: string;
  targetApp: string;
  targetElement?: string;
  automationId?: string;
  parameters: Record<string, any>;
  description: string;
  timestamp: string;
}

export class DesktopRecorder {
  private isRecording = false;
  private rawEvents: RawDemonstrationEvent[] = [];
  private recordingStartTime?: string;

  constructor(private windowsUIProvider: WindowsUIProvider) {}

  startRecording(): void {
    this.isRecording = true;
    this.rawEvents = [];
    this.recordingStartTime = new Date().toISOString();
  }

  stopRecording(): {
    rawEvents: RawDemonstrationEvent[];
    semanticTrace: SemanticActionTraceItem[];
  } {
    this.isRecording = false;
    const semanticTrace = this.synthesizeSemanticTrace(this.rawEvents);
    return {
      rawEvents: [...this.rawEvents],
      semanticTrace
    };
  }

  recordEvent(event: Omit<RawDemonstrationEvent, "id" | "timestamp">): void {
    if (!this.isRecording) return;
    this.rawEvents.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    });
  }

  /**
   * Transforms raw mouse & keyboard events into high-level semantic business actions.
   * e.g., click on Excel cell -> READ_FIELD
   * e.g., typing in search field -> SEARCH_CUSTOMER
   * e.g., clicking Save button -> SAVE_INVOICE
   */
  synthesizeSemanticTrace(events: RawDemonstrationEvent[]): SemanticActionTraceItem[] {
    const trace: SemanticActionTraceItem[] = [];
    let currentApp = "Desktop";

    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;

      if (ev.eventType === "APP_LAUNCH" || ev.eventType === "WINDOW_ACTIVATE") {
        const appName = ev.application || ev.windowTitle || "Application";
        if (appName !== currentApp) {
          currentApp = appName;
          trace.push({
            id: `sem_${trace.length}`,
            semanticAction: "OPEN_APPLICATION",
            targetApp: currentApp,
            parameters: { application: currentApp, windowTitle: ev.windowTitle },
            description: `Open and focus application ${currentApp}`,
            timestamp: ev.timestamp
          });
        }
        continue;
      }

      if (ev.eventType === "KEYBOARD_INPUT") {
        const fieldName = ev.uiElement?.name || ev.uiElement?.automationId || "Input Field";
        const val = ev.inputValue || "";
        
        let semanticName = "TYPE_FIELD";
        if (fieldName.toLowerCase().includes("search") || fieldName.toLowerCase().includes("find")) {
          semanticName = "SEARCH_CUSTOMER";
        } else if (fieldName.toLowerCase().includes("amount") || fieldName.toLowerCase().includes("total") || fieldName.toLowerCase().includes("refund")) {
          semanticName = "ENTER_REFUND";
        }

        trace.push({
          id: `sem_${trace.length}`,
          semanticAction: semanticName,
          targetApp: currentApp,
          targetElement: fieldName,
          automationId: ev.uiElement?.automationId,
          parameters: { field: fieldName, value: val },
          description: `Enter "${val}" into ${fieldName}`,
          timestamp: ev.timestamp
        });
        continue;
      }

      if (ev.eventType === "MOUSE_CLICK") {
        const elementName = ev.uiElement?.name || ev.uiElement?.automationId || "";
        const controlType = ev.uiElement?.controlType || "";

        if (elementName.toLowerCase().includes("save") || elementName.toLowerCase().includes("submit") || elementName.toLowerCase().includes("post")) {
          trace.push({
            id: `sem_${trace.length}`,
            semanticAction: "SAVE_INVOICE",
            targetApp: currentApp,
            targetElement: elementName,
            automationId: ev.uiElement?.automationId,
            parameters: { button: elementName },
            description: `Save transaction in ${currentApp}`,
            timestamp: ev.timestamp
          });
        } else if (controlType === "Edit" || elementName.toLowerCase().includes("cell") || elementName.toLowerCase().includes("amount")) {
          trace.push({
            id: `sem_${trace.length}`,
            semanticAction: "READ_FIELD",
            targetApp: currentApp,
            targetElement: elementName,
            automationId: ev.uiElement?.automationId,
            parameters: { field: elementName, value: ev.uiElement?.value },
            description: `Read field "${elementName}" with value "${ev.uiElement?.value || ""}"`,
            timestamp: ev.timestamp
          });
        } else {
          trace.push({
            id: `sem_${trace.length}`,
            semanticAction: "CLICK_UI_ELEMENT",
            targetApp: currentApp,
            targetElement: elementName || "Element",
            automationId: ev.uiElement?.automationId,
            parameters: { coordinates: ev.coordinates, name: elementName },
            description: `Click ${elementName || "element"} in ${currentApp}`,
            timestamp: ev.timestamp
          });
        }
      }
    }

    return trace;
  }
}
