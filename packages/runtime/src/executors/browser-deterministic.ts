import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import { VariableResolver } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";
import { z } from "zod";
import { chromium, Browser, Page } from "playwright";
import Browserbase from "@browserbasehq/sdk";
import { logger } from "@ghost/observability";

export const BrowserInputSchema = z.object({
  url: z.string().url().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  timeoutMs: z.number().optional().default(15000),
  closeSession: z.boolean().optional().default(false)
});

export const BrowserResultSchema = z.object({
  extracted: z.string().optional(),
  success: z.boolean()
});

export const BrowserErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export const BrowserAuditEvents = z.enum([
  "BROWSER_ACTION_STARTED",
  "BROWSER_ACTION_SUCCEEDED",
  "BROWSER_ACTION_FAILED"
]);

export interface ActiveBrowserSession {
  browser: Browser;
  page: Page;
  contextPlaywright: any;
}

export class BrowserDeterministicExecutor implements ExecutionCapability {
  public readonly recoveryStrategy = "RETRY_THEN_HUMAN";
  private activeSessions = new Map<string, ActiveBrowserSession>();

  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "BROWSER_DETERMINISTIC";
  }

  async closeSession(runId: string): Promise<void> {
    const session = this.activeSessions.get(runId);
    if (session) {
      await session.page.close().catch(() => {});
      await session.browser.close().catch(() => {});
      this.activeSessions.delete(runId);
    }
  }

  async closeAllSessions(): Promise<void> {
    for (const [_, session] of this.activeSessions.entries()) {
      await session.page.close().catch(() => {});
      await session.browser.close().catch(() => {});
    }
    this.activeSessions.clear();
  }

  private async getOrCreateSession(runId: string, timeoutMs: number): Promise<ActiveBrowserSession> {
    const existing = this.activeSessions.get(runId);
    if (existing && !existing.page.isClosed()) {
      existing.page.setDefaultTimeout(timeoutMs);
      return existing;
    }

    let browser: Browser | undefined;

    // Connect to Browserbase if key exists, otherwise local chromium with fallback to system Chrome/Edge
    if (process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID) {
      const bb = new Browserbase();
      const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID });
      browser = await chromium.connectOverCDP(session.connectUrl);
    } else {
      try {
        browser = await chromium.launch({ headless: true });
      } catch (launchErr: any) {
        if (launchErr.message?.includes("Executable doesn't exist")) {
          try {
            browser = await chromium.launch({ channel: "chrome", headless: true });
          } catch {
            browser = await chromium.launch({ channel: "msedge", headless: true });
          }
        } else {
          throw launchErr;
        }
      }
    }

    const contextPlaywright = await browser.newContext();
    const page = await contextPlaywright.newPage();
    page.setDefaultTimeout(timeoutMs);

    const session: ActiveBrowserSession = { browser, page, contextPlaywright };
    this.activeSessions.set(runId, session);
    return session;
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const resolver = new VariableResolver(context);
    const args = step.args || {};
    
    const parseResult = BrowserInputSchema.safeParse({
      url: args.url ? resolver.resolve(args.url) : undefined,
      selector: args.selector ? resolver.resolve(args.selector) : undefined,
      text: args.text ? resolver.resolve(args.text) : undefined,
      timeoutMs: args.timeoutMs,
      closeSession: args.closeSession
    });

    if (!parseResult.success) {
      return { state: "FAILED", message: `Invalid Browser Inputs: ${parseResult.error.message}` };
    }

    const { url, selector, text, timeoutMs, closeSession } = parseResult.data;
    const runId = context.getState().executionMetadata?.runId || "default_run";

    let session: ActiveBrowserSession | undefined;
    
    try {
      logger.info({ event: BrowserAuditEvents.enum.BROWSER_ACTION_STARTED, operation: step.operation }, "Starting browser action");

      session = await this.getOrCreateSession(runId, timeoutMs);
      const page = session.page;

      let extractedResult: string | undefined;

      switch (step.operation) {
        case "NAVIGATE":
          if (!url) throw new Error("NAVIGATE requires a url");
          await page.goto(url);
          break;
        case "CLICK":
          if (!selector) throw new Error("CLICK requires a selector");
          if (url && page.url() !== url) await page.goto(url);
          await page.click(selector);
          break;
        case "TYPE":
          if (!selector || !text) throw new Error("TYPE requires selector and text");
          if (url && page.url() !== url) await page.goto(url);
          await page.fill(selector, text);
          break;
        case "EXTRACT":
          if (!selector) throw new Error("EXTRACT requires a selector");
          if (url && page.url() !== url) await page.goto(url);
          extractedResult = (await page.textContent(selector)) || undefined;
          if (extractedResult) extractedResult = extractedResult.trim();
          break;
        default:
          throw new Error(`Unsupported browser operation: ${step.operation}`);
      }

      let screenshotUrl: string | undefined;
      try {
        const screenshot = await page.screenshot({ type: "jpeg", quality: 40 });
        screenshotUrl = `data:image/jpeg;base64,${screenshot.toString('base64')}`;
      } catch (e) {}

      // Preserve browser context state in Universal Execution Context
      context.updateBrowserContext({
        currentUrl: page.url(),
        isRunning: true,
        lastAction: step.operation
      });

      logger.info({ event: BrowserAuditEvents.enum.BROWSER_ACTION_SUCCEEDED, operation: step.operation }, "Browser action succeeded");
      
      const outputs: any = {
        extracted: extractedResult,
        value: extractedResult,
        success: true,
        ...(step.bind_result_to ? { [step.bind_result_to]: extractedResult } : {})
      };
      if (screenshotUrl) outputs.screenshotUrl = screenshotUrl;

      if (closeSession) {
        await this.closeSession(runId);
      }

      return {
        state: "SUCCEEDED",
        outputs
      };

    } catch (e: any) {
      logger.error({ event: BrowserAuditEvents.enum.BROWSER_ACTION_FAILED, error: e.message }, "Browser action failed");
      
      let screenshotUrl: string | undefined;
      if (session?.page && !session.page.isClosed()) {
        try {
          const screenshot = await session.page.screenshot({ type: "jpeg", quality: 40 });
          screenshotUrl = `data:image/jpeg;base64,${screenshot.toString('base64')}`;
        } catch (err) {}
      }

      if (closeSession) {
        await this.closeSession(runId);
      }

      const result: ExecutionResult = { 
        state: step.failure_policy?.on_failure === "PAUSE_FOR_HUMAN" ? "PAUSED_FOR_HUMAN" : "FAILED", 
        message: e.message,
        hitlReason: "BROWSER_INTERACTION_FAILED"
      };
      if (screenshotUrl) result.outputs = { screenshotUrl };
      return result;
    }
  }
}
