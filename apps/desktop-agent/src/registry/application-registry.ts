export interface RegisteredApplication {
  id: string;
  processName: string;
  displayName: string;
  executablePath?: string;
  windowTitlePattern?: string;
  capabilities: Array<"UI_AUTOMATION" | "SCREEN" | "KEYBOARD" | "MOUSE" | "OCR" | "VISION">;
  aliases: string[];
}

export class ApplicationRegistry {
  private apps: Map<string, RegisteredApplication> = new Map();

  constructor() {
    this.seedDefaultApplications();
  }

  private seedDefaultApplications(): void {
    const defaults: RegisteredApplication[] = [
      {
        id: "excel",
        processName: "EXCEL.EXE",
        displayName: "Microsoft Excel",
        windowTitlePattern: "Excel",
        capabilities: ["UI_AUTOMATION", "SCREEN", "KEYBOARD", "MOUSE"],
        aliases: ["excel", "spreadsheet", "ms-excel", "orders.xlsx", "sales.xlsx"]
      },
      {
        id: "tally",
        processName: "TallyPrime.exe",
        displayName: "Tally Prime ERP",
        windowTitlePattern: "Tally",
        capabilities: ["UI_AUTOMATION", "SCREEN", "KEYBOARD", "MOUSE", "OCR"],
        aliases: ["tally", "tallyprime", "tally9", "erp"]
      },
      {
        id: "sap",
        processName: "saplogon.exe",
        displayName: "SAP GUI",
        windowTitlePattern: "SAP",
        capabilities: ["UI_AUTOMATION", "SCREEN", "KEYBOARD", "MOUSE"],
        aliases: ["sap", "sapgui", "sap logon"]
      },
      {
        id: "chrome",
        processName: "chrome.exe",
        displayName: "Google Chrome",
        windowTitlePattern: "Google Chrome",
        capabilities: ["SCREEN", "KEYBOARD", "MOUSE", "UI_AUTOMATION"],
        aliases: ["chrome", "browser", "google chrome"]
      },
      {
        id: "edge",
        processName: "msedge.exe",
        displayName: "Microsoft Edge",
        windowTitlePattern: "Microsoft Edge",
        capabilities: ["SCREEN", "KEYBOARD", "MOUSE", "UI_AUTOMATION"],
        aliases: ["edge", "msedge"]
      },
      {
        id: "explorer",
        processName: "explorer.exe",
        displayName: "Windows File Explorer",
        windowTitlePattern: "File Explorer",
        capabilities: ["UI_AUTOMATION", "SCREEN", "KEYBOARD", "MOUSE"],
        aliases: ["explorer", "files", "file explorer", "folder"]
      },
      {
        id: "outlook",
        processName: "OUTLOOK.EXE",
        displayName: "Microsoft Outlook",
        windowTitlePattern: "Outlook",
        capabilities: ["UI_AUTOMATION", "SCREEN", "KEYBOARD", "MOUSE"],
        aliases: ["outlook", "mail", "email"]
      }
    ];

    for (const app of defaults) {
      this.register(app);
    }
  }

  register(app: RegisteredApplication): void {
    this.apps.set(app.id.toLowerCase(), app);
    for (const alias of app.aliases) {
      this.apps.set(alias.toLowerCase(), app);
    }
  }

  findApplication(identifier: string): RegisteredApplication | undefined {
    const key = identifier.trim().toLowerCase();
    return this.apps.get(key);
  }

  listApplications(): RegisteredApplication[] {
    const unique = new Map<string, RegisteredApplication>();
    for (const app of this.apps.values()) {
      unique.set(app.id, app);
    }
    return Array.from(unique.values());
  }
}
