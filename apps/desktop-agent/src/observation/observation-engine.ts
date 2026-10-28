import type { DesktopUIElement } from "@ghost/workflow-schema";
import type { WindowsUIProvider, ApplicationProcessInfo } from "../windows/provider.js";
import { existsSync } from "node:fs";

export interface DesktopObservedState {
  timestamp: string;
  runningApplications: ApplicationProcessInfo[];
  focusedWindow?: string;
  visibleElements: DesktopUIElement[];
  screenshotBase64: string;
  activeDialogs: DesktopUIElement[];
}

export class ObservationEngine {
  constructor(private windowsUIProvider: WindowsUIProvider) {}

  async observeCurrentState(windowTitleFilter?: string): Promise<DesktopObservedState> {
    const runningApplications = await this.windowsUIProvider.getRunningApplications();
    const visibleElements = await this.windowsUIProvider.inspectElements(
      windowTitleFilter ? { windowTitle: windowTitleFilter } : undefined
    );
    const screenshot = await this.windowsUIProvider.captureScreenshot();

    // Identify dialogs
    const activeDialogs = visibleElements.filter(
      el => el.controlType === "Window" || el.controlType === "Dialog" || el.className?.toLowerCase().includes("dialog")
    );

    const focusedApp = runningApplications.find(a => 
      windowTitleFilter ? a.title.toLowerCase().includes(windowTitleFilter.toLowerCase()) : true
    );

    return {
      timestamp: new Date().toISOString(),
      runningApplications,
      focusedWindow: focusedApp?.title,
      visibleElements,
      screenshotBase64: screenshot.dataUrl,
      activeDialogs
    };
  }

  checkFileExists(filePath: string): boolean {
    try {
      return existsSync(filePath);
    } catch {
      return false;
    }
  }
}
