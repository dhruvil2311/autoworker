import type { DesktopRiskLevel } from "@ghost/workflow-schema";
import { resolve, normalize } from "node:path";

export interface SecurityPolicyConfig {
  permittedDirectories: string[];
  deniedDirectories: string[];
  maxFileSizeBytes: number;
  allowedExtensions: string[];
  allowedApplications: string[];
  autonomousMaxRiskLevel: DesktopRiskLevel;
}

export class SecurityPolicy {
  private config: SecurityPolicyConfig;
  private emergencyStopped = false;

  constructor(customConfig?: Partial<SecurityPolicyConfig>) {
    this.config = {
      permittedDirectories: customConfig?.permittedDirectories || [
        process.env.USERPROFILE || "C:\\Users\\Default",
        "C:\\GhostWorkspace",
        process.cwd()
      ],
      deniedDirectories: customConfig?.deniedDirectories || [
        "C:\\Windows",
        "C:\\Windows\\System32",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\Users\\Default\\AppData\\Local\\Microsoft"
      ],
      maxFileSizeBytes: customConfig?.maxFileSizeBytes || 50 * 1024 * 1024, // 50MB
      allowedExtensions: customConfig?.allowedExtensions || [
        ".xlsx", ".xls", ".csv", ".pdf", ".txt", ".json", ".xml", ".docx", ".doc", ".png", ".jpg"
      ],
      allowedApplications: customConfig?.allowedApplications || [
        "EXCEL.EXE", "TallyPrime.exe", "Tally.exe", "TallyERP.exe", "chrome.exe", "msedge.exe", "explorer.exe", "notepad.exe",
        "Desktop", "Desktop Application", "Browser", "chrome", "msedge", "firefox", "Application", "Shell"
      ],
      autonomousMaxRiskLevel: customConfig?.autonomousMaxRiskLevel || "MEDIUM"
    };
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  triggerEmergencyStop(): void {
    this.emergencyStopped = true;
  }

  resetEmergencyStop(): void {
    this.emergencyStopped = false;
  }

  assertExecutionAllowed(actionType: string, riskLevel: DesktopRiskLevel, application?: string): { allowed: boolean; reason?: string; requiresHumanApproval: boolean } {
    if (this.emergencyStopped) {
      return { allowed: false, reason: "EMERGENCY_STOP_TRIGGERED: All desktop execution is halted", requiresHumanApproval: false };
    }

    if (application) {
      const baseApp = application.split("\\").pop() || application;
      const lower = baseApp.toLowerCase().trim();
      const isShellOrDesktop = [
        "desktop", "desktop application", "desktop workspace", "browser", "chrome",
        "msedge", "firefox", "application", "shell", "system", "explorer.exe", "explorer"
      ].includes(lower);

      const isAllowedApp = isShellOrDesktop || this.config.allowedApplications.some(
        a => a.toLowerCase() === lower
      );
      if (!isAllowedApp) {
        return {
          allowed: false,
          reason: `SECURITY_VIOLATION: Application "${application}" is not in the desktop allowlist`,
          requiresHumanApproval: true
        };
      }
    }

    if (riskLevel === "CRITICAL") {
      return {
        allowed: false,
        reason: `CRITICAL_ACTION: Action "${actionType}" involves financial transfer or destructive configuration and requires human confirmation`,
        requiresHumanApproval: true
      };
    }

    if (riskLevel === "HIGH" && this.config.autonomousMaxRiskLevel !== "HIGH") {
      return {
        allowed: false,
        reason: `HIGH_RISK_ACTION: Action "${actionType}" requires supervisor confirmation`,
        requiresHumanApproval: true
      };
    }

    return { allowed: true, requiresHumanApproval: false };
  }

  assertFileAccessAllowed(filePath: string): { allowed: boolean; reason?: string } {
    const fullPath = normalize(resolve(filePath));

    // Check denied directories first
    for (const denied of this.config.deniedDirectories) {
      if (fullPath.toLowerCase().startsWith(normalize(resolve(denied)).toLowerCase())) {
        return {
          allowed: false,
          reason: `FILESYSTEM_ACCESS_DENIED: Path "${filePath}" resides in restricted directory "${denied}"`
        };
      }
    }

    // Check extension
    const ext = "." + (fullPath.split(".").pop() || "").toLowerCase();
    if (!this.config.allowedExtensions.includes(ext)) {
      return {
        allowed: false,
        reason: `FILESYSTEM_ACCESS_DENIED: Extension "${ext}" is not permitted`
      };
    }

    // Check permitted roots
    const isPermitted = this.config.permittedDirectories.some(permitted =>
      fullPath.toLowerCase().startsWith(normalize(resolve(permitted)).toLowerCase())
    );

    if (!isPermitted) {
      return {
        allowed: false,
        reason: `FILESYSTEM_ACCESS_DENIED: Path "${filePath}" is outside permitted workspace roots`
      };
    }

    return { allowed: true };
  }

  redactSensitiveData(text: string): string {
    let redacted = text;
    // Redact credit cards
    redacted = redacted.replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[REDACTED_CREDIT_CARD]");
    // Redact SSN
    redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
    // Redact API keys / tokens (generic heuristics)
    redacted = redacted.replace(/\b(?:ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{32,}|bearer\s+[a-zA-Z0-9._\-]{20,})\b/gi, "[REDACTED_SECRET]");
    // Redact OTP patterns
    redacted = redacted.replace(/\b(?:otp|one-time password|verification code)[:\s]+(\d{4,8})\b/gi, "OTP: [REDACTED_OTP]");
    return redacted;
  }
}
