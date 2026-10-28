import type { DesktopTelemetryEvent, DesktopActionPayload } from "@ghost/workflow-schema";
import type { AuthManager, DeviceCredentials } from "../authentication/auth-manager.js";
import type { StructuredCorrectionArtifact } from "../hitl/takeover-manager.js";

export interface OutboundCommandMessage {
  id: string;
  tenant_id: string;
  desktop_agent_id: string;
  execution_id: string;
  workflow_version_id?: string;
  step_id: string;
  sequence_number: number;
  message_type: "START_EXECUTION" | "EXECUTE_ACTION" | "PAUSE" | "RESUME" | "CANCEL" | "HEARTBEAT" | "EMERGENCY_STOP" | "TAKE_CONTROL" | "RELEASE_CONTROL";
  payload: DesktopActionPayload;
  timestamp: string;
}

export interface CloudClientConfig {
  baseUrl: string;
  tenantId: string;
  agentId: string;
  agentToken: string;
  deviceName: string;
}

export class CloudClient {
  private config: CloudClientConfig;
  private authManager: AuthManager;

  constructor(config: CloudClientConfig, authManager: AuthManager) {
    this.config = config;
    this.authManager = authManager;
    this.authManager.setCredentials({
      tenantId: config.tenantId,
      agentId: config.agentId,
      agentToken: config.agentToken,
      deviceName: config.deviceName
    });
  }

  async registerDevice(): Promise<{ success: boolean; agentId: string }> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/desktop/agents/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.agentToken}`
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          agentId: this.config.agentId,
          deviceName: this.config.deviceName,
          osInfo: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version
          }
        })
      });
      if (!res.ok) {
        return { success: false, agentId: this.config.agentId };
      }
      const data = await res.json();
      return { success: true, agentId: data.agentId || this.config.agentId };
    } catch {
      return { success: false, agentId: this.config.agentId };
    }
  }

  async sendHeartbeat(status: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/desktop/agents/${this.config.agentId}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.agentToken}`
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          agentId: this.config.agentId,
          status,
          timestamp: new Date().toISOString()
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async pollPendingCommands(): Promise<OutboundCommandMessage[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/desktop/agents/${this.config.agentId}/commands`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.agentToken}`,
          "X-Tenant-Id": this.config.tenantId
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.commands || [];
    } catch {
      return [];
    }
  }

  async reportCommandResult(
    commandId: string,
    result: {
      state: "SUCCEEDED" | "FAILED" | "PAUSED_FOR_HUMAN";
      message?: string;
      outputs?: Record<string, any>;
      hitlReason?: string;
      telemetry: DesktopTelemetryEvent;
    }
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/desktop/commands/${commandId}/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.agentToken}`,
          "X-Tenant-Id": this.config.tenantId
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          agentId: this.config.agentId,
          commandId,
          result,
          timestamp: new Date().toISOString()
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async reportCorrection(correction: StructuredCorrectionArtifact): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/desktop/corrections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.agentToken}`,
          "X-Tenant-Id": this.config.tenantId
        },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          agentId: this.config.agentId,
          correction
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
