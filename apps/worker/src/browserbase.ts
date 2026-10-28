import { Browserbase } from "@browserbasehq/sdk";
import type { SessionCreateResponse } from "@browserbasehq/sdk/resources/sessions/sessions.js";
import { chromium } from "playwright";
export interface BrowserbaseConfig {
  browserbaseApiKey: string | undefined;
  browserbaseProjectId: string | undefined;
}

export type BrowserbaseSession = {
  id: string;
  connectUrl: string;
  seleniumRemoteUrl: string;
  signingKey: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  /** Open this in your own browser tab to watch a remote Browserbase session live. Empty for local sessions (see `local` below — those open their own visible window instead). */
  debuggerUrl: string;
  /** True when this is a local Playwright browser rather than a real Browserbase cloud session. */
  local: boolean;
};

export class BrowserbaseExecutionProvider {
  constructor(private readonly config: BrowserbaseConfig) {}

  async createSession(): Promise<BrowserbaseSession> {
    if (!this.config.browserbaseApiKey || this.config.browserbaseApiKey === "local") {
      return {
        id: "local-session",
        connectUrl: "local",
        seleniumRemoteUrl: "",
        signingKey: "",
        status: "RUNNING",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        debuggerUrl: "",
        local: true
      };
    }

    try {
      const client = new Browserbase({ apiKey: this.config.browserbaseApiKey });
      const response = (await client.sessions.create({ keepAlive: true })) as SessionCreateResponse;

      return {
        id: response.id,
        connectUrl: response.connectUrl,
        seleniumRemoteUrl: response.seleniumRemoteUrl,
        signingKey: response.signingKey,
        status: response.status,
        createdAt: (response as any).createdAt || new Date().toISOString(),
        expiresAt: (response as any).expiresAt || new Date(Date.now() + 86400000).toISOString(),
        debuggerUrl: (response as any).debuggerUrl || "",
        local: false
      };
    } catch (err: any) {
      if (err?.message?.includes("Free plan browser minutes limit reached") || err?.status === 402) {
        console.warn("Browserbase limit reached. Falling back to local Playwright.");
        return {
          id: "local-session",
          connectUrl: "local",
          seleniumRemoteUrl: "",
          signingKey: "",
          status: "RUNNING",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          debuggerUrl: "",
          local: true
        };
      }
      throw err;
    }
  }

  async connectBrowser(session: BrowserbaseSession) {
    if (session.id === "local-session") {
      const headless = process.env.WORKER_HEADLESS === "false" ? false : true;
      const slowMo = process.env.WORKER_SLOW_MO ? parseInt(process.env.WORKER_SLOW_MO, 10) : 100;
      return await chromium.launch({
        headless,
        ...(slowMo !== undefined && { slowMo }),
        args: [
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking"
        ]
      });
    }
    const browser = await chromium.connectOverCDP(session.connectUrl);
    return browser;
  }

  async navigate(session: BrowserbaseSession, url: string) {
    const browser = await this.connectBrowser(session);
    const page = browser.contexts()[0]?.pages()[0] ?? await (await browser.newContext()).newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return { browser, page };
  }

  async cleanup(browser: Awaited<ReturnType<BrowserbaseExecutionProvider["connectBrowser"]>>) {
    if (process.env.KEEP_BROWSER_OPEN === "true") {
      console.log("SauceDemo execution complete — browser left open for inspection.");
      return; // Do not close
    }
    await browser.close();
  }
}
