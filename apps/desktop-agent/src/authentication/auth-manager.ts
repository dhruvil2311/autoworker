import { createHmac, randomBytes } from "node:crypto";

export interface DeviceCredentials {
  tenantId: string;
  agentId: string;
  agentToken: string;
  deviceName: string;
}

export class AuthManager {
  private credentials?: DeviceCredentials;
  private activeSessionToken?: string;
  private activeSessionExpiry?: number;

  setCredentials(credentials: DeviceCredentials): void {
    this.credentials = credentials;
  }

  getCredentials(): DeviceCredentials | undefined {
    return this.credentials;
  }

  setSession(sessionToken: string, expiresInSeconds: number): void {
    this.activeSessionToken = sessionToken;
    this.activeSessionExpiry = Date.now() + expiresInSeconds * 1000;
  }

  isSessionValid(): boolean {
    if (!this.activeSessionToken || !this.activeSessionExpiry) return false;
    return Date.now() < this.activeSessionExpiry;
  }

  getSessionToken(): string | undefined {
    return this.isSessionValid() ? this.activeSessionToken : undefined;
  }

  signPayload(payload: string): string {
    if (!this.credentials) throw new Error("Agent credentials not configured");
    return createHmac("sha256", this.credentials.agentToken).update(payload).digest("hex");
  }

  verifySignature(payload: string, signature: string): boolean {
    if (!this.credentials) return false;
    const expected = this.signPayload(payload);
    return expected === signature;
  }

  static generateDeviceToken(): string {
    return `gda_${randomBytes(24).toString("hex")}`;
  }
}
