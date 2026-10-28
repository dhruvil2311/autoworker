import { ExecutionCapability, ExecutionResult, RuntimeContext } from "@ghost/runtime";
import type { WorkflowV2Step } from "@ghost/workflow-schema";
import { BrowserbaseExecutionProvider, type BrowserbaseSession } from "./browserbase.js";
import { Stagehand, CustomOpenAIClient } from "@browserbasehq/stagehand";
import OpenAI from "openai";
import { translateToEnglish, getMultiLingualSynonyms } from "./language-translator.js";
import { hitlBus, type HitlAuthResolution } from "./hitl-bus.js";
import { resolveTarget, describeTarget, checkOutcome, type UnresolvedTarget } from "./target-resolver.js";

/** True when both URLs belong to the same site (equal hosts or one a subdomain of the other). */
function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www./, "");
    const hb = new URL(b).hostname.replace(/^www./, "");
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

async function dismissKnownPopups(page: any) {
  try {
    const modalClose = await page.$('aside.modal-system-messages button.action-close, aside.modal-popup._show button.action-close, [data-role="closeBtn"], button[name="glowDoneButton"], .a-popover-header button.a-button-close, [data-action="a-popover-close"]');
    if (modalClose && await modalClose.isVisible()) {
      console.log('[V2BrowserExecutor] Closing system messages / modal popup');
      await modalClose.click();
      await page.waitForTimeout(400);
    }
  } catch (_) {}
}

export class V2BrowserExecutor implements ExecutionCapability {
  private session?: BrowserbaseSession;
  private browser?: any;
  private page?: any;
  private stagehand?: Stagehand;
  private authenticatedDomains = new Set<string>();
  private submittedAuthPages = new Set<string>();

  constructor(
    private provider: BrowserbaseExecutionProvider,
    private onSessionReady?: (session: BrowserbaseSession) => Promise<void>,
    private persistence?: any
  ) { }

  /** Escalates an unresolved target with the live page state instead of acting on a guess. */
  private async unresolvedTarget(step: WorkflowV2Step, resolution: UnresolvedTarget): Promise<ExecutionResult> {
    const url = this.page?.url?.() || "";
    const title = await this.page?.title?.().catch(() => "") || "";
    const reason = resolution.reason === "AMBIGUOUS" ? "TARGET_AMBIGUOUS" : resolution.reason === "NO_TARGET" ? "TARGET_NOT_SPECIFIED" : "TARGET_NOT_RESOLVED";
    return {
      state: "PAUSED_FOR_HUMAN",
      hitlReason: reason,
      message: `${step.description}: ${resolution.detail} Current page: ${title || url}. No other control was used in its place.`,
      outputs: { page_state: { url, title }, target_resolution: resolution }
    } as any;
  }

  private async capturePageOutputs(context: RuntimeContext, operation: string): Promise<Record<string, any>> {
    const outputs: Record<string, any> = {};
    if (!this.page || this.page.isClosed()) return outputs;

    try {
      const currentUrl = this.page.url();
      const pageTitle = await this.page.title().catch(() => "");
      outputs.sourceUrl = currentUrl;
      outputs.pageTitle = pageTitle;

      context.updateBrowserContext({
        currentUrl,
        pageTitle,
        isRunning: true,
        lastAction: operation
      });

      // Extract observable products or items if present on catalog / search pages
      const pageData = await this.page.evaluate(() => {
        const res: Record<string, any> = {};
        const cards = document.querySelectorAll("div[data-component-type='s-search-result'], div.s-result-item");
        if (cards.length > 0) {
          const items: any[] = [];
          for (const c of Array.from(cards).slice(0, 5)) {
            const titleEl = c.querySelector("h2 span, h2 a");
            const priceEl = c.querySelector(".a-price .a-offscreen, .a-price-whole");
            const ratingEl = c.querySelector(".a-icon-alt");
            if (titleEl && titleEl.textContent && titleEl.textContent.trim().length > 3) {
              items.push({
                title: titleEl.textContent.trim(),
                price: priceEl ? priceEl.textContent?.trim() : "N/A",
                rating: ratingEl ? ratingEl.textContent?.trim() : "N/A"
              });
            }
          }
          if (items.length > 0) {
            res.products = items;
            res.top_product = items[0].title;
            res.price = items[0].price;
            res.rating = items[0].rating;
          }
        }
        return res;
      }).catch(() => ({}));

      Object.assign(outputs, pageData);

      const buffer = await this.page.screenshot().catch(() => null);
      if (buffer) {
        outputs.screenshotUrl = `data:image/png;base64,${buffer.toString('base64')}`;
      }
    } catch (_) {}

    return outputs;
  }

  private async detectAuthBarrier(step: WorkflowV2Step, context: RuntimeContext) {
    if (!this.page) return null;
    const currentUrl = this.page.url();
    if (!currentUrl || currentUrl === "about:blank") return null;

    let domain = "";
    try {
      domain = new URL(currentUrl).hostname;
    } catch (_) {
      return null;
    }

    // Fast-path: If domain or page is already verified as authenticated or credentials provided, do not re-prompt
    if (domain && this.authenticatedDomains.has(domain)) {
      return null;
    }
    if (this.submittedAuthPages.has(currentUrl) || (domain && this.submittedAuthPages.has(domain))) {
      return null;
    }

    // 1. Check for OTP / Two-Factor verification challenge first
    const otpEl = await this.page.$(
      "input[name*='otp' i], input[name*='code' i], input[name*='2fa' i], input[name*='token' i], input[autocomplete='one-time-code'], input[placeholder*='code' i], input[placeholder*='otp' i], input[aria-label*='code' i], input[id*='otp' i], input[id*='2fa' i], input[id*='mfa' i]"
    ).catch(() => null);
    const isOtpVisible = otpEl ? await otpEl.isVisible().catch(() => false) : false;
    if (isOtpVisible) {
      return {
        authType: "OTP_CHALLENGE" as const,
        fields: ["otp"],
        prompt: `Two-factor authentication required on ${domain}. Please enter your one-time verification code (OTP).`,
        userEl: null,
        passEl: null,
        otpEl
      };
    }

    const currentUrlLower = currentUrl.toLowerCase();
    const urlObj = (() => { try { return new URL(currentUrl); } catch { return null; } })();
    const pathname = (urlObj?.pathname || "").toLowerCase();
    // Deterministic check: webpage itself must actually be a login endpoint or portal
    const isLoginPage = pathname.includes("login") || 
                        pathname.includes("signin") || 
                        pathname.includes("sign-in") || 
                        pathname.includes("adaptive-signin") || 
                        pathname.includes("userlogin") || 
                        pathname.includes("usermgmt") ||
                        pathname.includes("/oauth") ||
                        pathname.includes("/auth") ||
                        currentUrlLower.includes("/login") || 
                        currentUrlLower.includes("/signin") || 
                        currentUrlLower.includes("/sign-in") || 
                        currentUrlLower.includes("usermgmt") ||
                        currentUrlLower.includes("auth.services.adobe.com") || 
                        currentUrlLower.includes("auth.");

    // 2. Check for password input on current DOM
    const passEl = await this.page.$(
      "input[type='password'], input[name*='pass' i], input[id*='pass' i], input[placeholder*='pass' i], input[autocomplete='current-password'], input[aria-label*='pass' i], #wpPassword1, input[name='wpPassword'], #userPwd, input[name='userPwd'], input[id*='pwd' i], input[name*='pwd' i]"
    ).catch(() => null);
    const isPassVisible = passEl ? await passEl.isVisible().catch(() => false) : false;

    // 3. Check for username/email input on current DOM
    let userEl = await this.page.$(
      "#userName, input[name='userName'], input[name*='user' i], input[type='email'], input[name*='email' i], input[id*='user' i], input[name*='login' i], input[placeholder*='user' i], input[placeholder*='email' i], #user-name, #username, input[autocomplete='username'], input[aria-label*='user' i], input[aria-label*='email' i], #wpName1, input[name='wpName'], input[name*='identifier' i], input[name*='account' i], input[name*='identity' i]"
    ).catch(() => null);

    // Fallback: if password is visible or we are on login page, find first visible text/email input inside the form
    if (!userEl && (isPassVisible || isLoginPage)) {
      const textInputs = await this.page.$$("input[type='text']:not([type='hidden']), input:not([type]):not([type='hidden'])").catch(() => []);
      for (const ti of textInputs) {
        if (await ti.isVisible().catch(() => false)) {
          userEl = ti;
          break;
        }
      }
    }

    const isUserVisible = userEl ? await userEl.isVisible().catch(() => false) : false;

    if (!isUserVisible && !isPassVisible) {
      return null;
    }

    // Both username & password on 1 page (Dual Layout)
    if (isUserVisible && isPassVisible) {
      return {
        authType: "CREDENTIALS_DUAL" as const,
        fields: ["username", "password"],
        prompt: `Authentication required on ${domain}. Please enter your username and password.`,
        userEl,
        passEl,
        otpEl: null
      };
    }

    // Single page with only username / email (step 1 of 2-step login)
    if (isUserVisible && !isPassVisible && (isLoginPage || pathname !== "/")) {
      return {
        authType: "CREDENTIAL_USERNAME" as const,
        fields: ["username"],
        prompt: `Sign-in required on ${domain} (Step 1: Username / Email). Please enter your username or email.`,
        userEl,
        passEl: null,
        otpEl: null
      };
    }

    // Single page with only password (step 2 of 2-step login)
    if (!isUserVisible && isPassVisible) {
      return {
        authType: "CREDENTIAL_PASSWORD" as const,
        fields: ["password"],
        prompt: `Sign-in required on ${domain} (Step 2: Password). Please enter your password.`,
        userEl: null,
        passEl,
        otpEl: null
      };
    }

    return null;
  }

  private async handleAuthBarrier(initialAuthBarrier: any, step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const runId = context.getState().executionMetadata?.runId || "unknown_run";
    let currentBarrier = initialAuthBarrier;
    const providedFieldsAll: string[] = [];
    let lastScreenshotUrl = "";
    let lastDomain = "";

    while (currentBarrier) {
      const currentUrl = this.page.url();
      let domain = "";
      try { domain = new URL(currentUrl).hostname; lastDomain = domain; } catch (_) {}

      const challengePayload = {
        type: "AUTH_CHALLENGE",
        authType: currentBarrier.authType,
        fields: currentBarrier.fields,
        prompt: currentBarrier.prompt,
        url: currentUrl,
        stepId: step.id
      };
      const challengeType = `AUTHENTICATION_REQUIRED:${currentBarrier.authType}:${JSON.stringify(challengePayload)}`;

      console.log(`[V2BrowserExecutor] Auth barrier active (${currentBarrier.authType}, fields: ${currentBarrier.fields.join(", ")}) on ${currentUrl}. Pausing for HITL...`);

      let screenshotUrl = "";
      try {
        const buf = await this.page.screenshot().catch(() => null);
        if (buf) screenshotUrl = `data:image/png;base64,${buf.toString("base64")}`;
      } catch (_) {}
      lastScreenshotUrl = screenshotUrl;

      if (this.persistence) {
        await this.persistence.recordHitlPause(step.id, challengeType).catch(() => null);
        await this.persistence.recordRunState("WAITING_FOR_HUMAN", {
          hitlReason: challengeType,
          screenshotUrl
        }).catch(() => null);
      }

      // Register live waiter on hitlBus
      const resolution = await new Promise<HitlAuthResolution>((resolve) => {
        hitlBus.registerWaiter(runId, resolve);
        // Wait up to 5 minutes for human intervention
        setTimeout(() => {
          hitlBus.removeWaiter(runId);
          resolve({ resolution: "TIMEOUT" });
        }, 300000);
      });

      if (resolution.resolution === "TIMEOUT") {
        return {
          state: "PAUSED_FOR_HUMAN",
          hitlReason: challengeType,
          message: "Authentication pause timed out waiting for human operator input."
        } as any;
      }

      console.log(`[V2BrowserExecutor] Received HITL credentials for run ${runId}. Typing into active DOM securely...`);

      // Record this page and domain as submitted so subsequent steps never re-prompt
      if (currentUrl) this.submittedAuthPages.add(currentUrl);
      if (domain) this.submittedAuthPages.add(domain);

      // Securely type into active DOM without logging or leaking password
      if (resolution.username) {
        // Query live DOM element to prevent stale handles
        const userEl = await this.page.$(
          "#userName, input[name='username'], input[id='userName'], input[name='userName'], #EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email'], input[name*='email' i], input[name*='user' i], input[id*='user' i], input[name*='login' i], input[placeholder*='user' i], input[placeholder*='email' i], #user-name, #username, input[autocomplete='username'], #wpName1, input[name='wpName'], input[name*='identifier' i], input[name*='account' i], input[name*='identity' i]"
        ).catch(() => null) || currentBarrier.userEl;
        if (userEl) {
          await userEl.click().catch(() => null);
          await userEl.fill(resolution.username).catch(() => null);
          await userEl.evaluate((el: HTMLInputElement, val: string) => {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, resolution.username).catch(() => null);
        }
        providedFieldsAll.push("username");
      }
      if (resolution.password) {
        const passEl = await this.page.$(
          "#userPwd, input[name='password'], input[id='userPwd'], input[name='userPwd'], input[id*='pwd' i], input[name*='pwd' i], #PasswordPage-PasswordField, input[name='PasswordPage-PasswordField'], input[type='password'], input[name*='pass' i], input[id*='pass' i], #wpPassword1, input[name='wpPassword']"
        ).catch(() => null) || currentBarrier.passEl;
        if (passEl) {
          await passEl.click().catch(() => null);
          await passEl.fill(resolution.password).catch(() => null);
          await passEl.evaluate((el: HTMLInputElement, val: string) => {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, resolution.password).catch(() => null);
        }
        providedFieldsAll.push("password");
      }
      if (resolution.otp) {
        const otpEl = await this.page.$(
          "input[name*='otp' i], input[name*='code' i], input[name*='2fa' i], input[name*='token' i], input[autocomplete='one-time-code'], input[placeholder*='code' i], input[placeholder*='otp' i], input[id*='otp' i]"
        ).catch(() => null) || currentBarrier.otpEl;
        if (otpEl) {
          await otpEl.click().catch(() => null);
          await otpEl.fill(resolution.otp).catch(() => null);
          await otpEl.evaluate((el: HTMLInputElement, val: string) => {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, resolution.otp).catch(() => null);
        }
        providedFieldsAll.push("otp");
      }

      // CRITICAL PRIVACY: Immediately destroy password, OTP, and username from transient memory
      (resolution as any).password = null;
      delete (resolution as any).password;
      (resolution as any).otp = null;
      delete (resolution as any).otp;
      (resolution as any).username = null;
      delete (resolution as any).username;

      // Multi-strategy robust login form submission:
      // Invoke the page's own form submission handler so application-level validation and encoding run.
      await this.page.evaluate(() => {
        try {
          const w = window as any;
          if (w.$ && w.$('#loginForm').length) {
            w.$('#loginForm').submit();
            return;
          }
          if (w.jQuery && w.jQuery('form#loginForm, form[action*="login" i]').length) {
            w.jQuery('form#loginForm, form[action*="login" i]').submit();
            return;
          }
          const form = document.querySelector("form#loginForm, form[action*='login' i], form") as HTMLFormElement;
          if (form) {
            if (typeof form.requestSubmit === "function") form.requestSubmit();
            else form.submit();
          }
        } catch (_) {}
      }).catch(() => null);

      // (2) Click submit/next button on the login form with comprehensive attribute prefix and class matching
      const submitBtn = await this.page.$(
        "input[id^='userLogin'], input.loginBtn, input[value='Login'], #userLogin, input[name='userLogin'], form#loginForm input[type='submit'], form#loginForm button[type='submit'], input[value*='Login' i], button[data-id='EmailPage-ContinueButton'], .EmailPage-continue-button, #wpLoginAttempt, button[type='submit'], input[type='submit'], #login-button, button.oxd-button, button:has-text('Log in'), button:has-text('Login'), button:has-text('Sign In'), button:has-text('Sign in'), button:has-text('Submit'), button:has-text('Verify'), button:has-text('Next'), button:has-text('Continue'), a:has-text('Sign In'), a:has-text('Log In')"
      ).catch(() => null);
      if (submitBtn) {
        await submitBtn.click({ timeout: 4000 }).catch(() => null);
      }
      // Also dispatch Enter keystroke to ensure forms relying on Enter trigger properly
      await this.page.keyboard.press("Enter").catch(() => null);

      // Page settle and wait for navigation / transition away from login portal
      try {
        await Promise.race([
          this.page.waitForURL((url: any) => {
            const u = url.toString().toLowerCase();
            return !u.includes("/login") && !u.includes("/signin") && !u.includes("adaptive-signin") && !u.includes("auth.services.adobe.com");
          }, { timeout: 12000 }).catch(() => null),
          this.page.waitForNavigation({ timeout: 10000 }).catch(() => null),
          this.page.waitForFunction(
            () => {
              const otp = document.querySelector("input[name*='otp' i], input[name*='code' i]");
              return otp && (otp as HTMLElement).offsetParent !== null;
            },
            null,
            { timeout: 6000 }
          ).catch(() => null),
          this.page.waitForTimeout(4000)
        ]);
      } catch (_) {}
      await this.page.waitForLoadState("domcontentloaded").catch(() => null);
      await dismissKnownPopups(this.page);

      const newUrl = this.page.url();
      if (newUrl !== currentUrl && !newUrl.includes("adaptive-signin") && !newUrl.includes("auth.services.adobe.com") && !newUrl.includes("/login")) {
        console.log(`[V2BrowserExecutor] Auth barrier resolved and navigated away (${currentUrl} -> ${newUrl})`);
        currentBarrier = null;
      } else {
        // Inspect DOM for specific active inline validation errors (Adobe, Magento, standard form alerts)
        const pageError = await this.page.evaluate(() => {
          const errorSelectors = [
            "p[data-id='EmailPage-EmailError']",
            "div[data-id*='Error']",
            ".Spectrum-InlineAlert",
            ".mage-error",
            ".message-error",
            "[data-ui-id*='message-error']",
            ".message.error",
            "div.messages .message-error",
            "div[data-bind*='message.text']",
            "[data-test='error']",
            ".InlineError--error",
            ".InlineError",
            "[role='alert']",
            ".alert-danger",
            ".error-message",
            ".field-error"
          ];
          for (const s of errorSelectors) {
            const errEl = document.querySelector(s);
            if (errEl && (errEl as HTMLElement).innerText?.trim()) {
              return (errEl as HTMLElement).innerText.trim();
            }
          }
          return null;
        }).catch(() => null);

        if (pageError) {
          console.warn(`[V2BrowserExecutor] Website reported error after entering [${providedFieldsAll.join(", ")}]: "${pageError}"`);
          currentBarrier = {
            authType: "CREDENTIALS_DUAL" as const,
            fields: ["username", "password"],
            prompt: `Sign-in obstacle on ${domain}: Website reported "${pageError}". Please check your credentials and try again.`,
            userEl: null,
            passEl: null,
            otpEl: null
          };
          const countTimes = providedFieldsAll.filter(f => f === "password").length;
          if (countTimes >= 3) {
            console.error(`[V2BrowserExecutor] Credentials repeatedly rejected on ${domain}: "${pageError}"`);
            return {
              state: "FAILED",
              message: `Authentication failed on ${domain}: ${pageError}. Please verify your credentials.`
            } as any;
          }
        } else {
          // Check if an OTP challenge is presented next
          const nextOtp = await this.page.$("input[name*='otp' i], input[name*='code' i], input[name*='2fa' i]").catch(() => null);
          const isOtpVis = nextOtp ? await nextOtp.isVisible().catch(() => false) : false;
          if (isOtpVis && !providedFieldsAll.includes("otp")) {
            currentBarrier = {
              authType: "OTP_CHALLENGE" as const,
              fields: ["otp"],
              prompt: `Two-factor authentication required on ${domain}. Please enter your one-time verification code (OTP).`,
              userEl: null,
              passEl: null,
              otpEl: nextOtp
            };
          } else {
            // Credentials have been provided once. STRICT GUARANTEE: Never re-prompt the human operator for credentials again on this same page!
            console.log(`[V2BrowserExecutor] Credentials provided for ${domain}. Barrier dismissed without duplicate prompt.`);
            currentBarrier = null;
          }
        }
      }
    }

    let finalDomain = "";
    try { finalDomain = new URL(this.page.url()).hostname; } catch (_) {}
    if (lastDomain) {
      this.authenticatedDomains.add(lastDomain);
    }
    if (finalDomain) {
      this.authenticatedDomains.add(finalDomain);
    }
    context.set("authenticated", true);

    if (this.persistence) {
      await this.persistence.recordRunState("RUNNING").catch(() => null);
    }

    let finalScreenshot = "";
    try {
      const buf = await this.page.screenshot().catch(() => null);
      if (buf) finalScreenshot = `data:image/png;base64,${buf.toString("base64")}`;
    } catch (_) {}

    return {
      state: "SUCCEEDED",
      outputs: {
        authenticated: true,
        fields_provided: Array.from(new Set(providedFieldsAll)),
        credentials: "***REDACTED_FOR_PRIVACY***",
        screenshotUrl: finalScreenshot || lastScreenshotUrl
      }
    };
  }

  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "BROWSER_DETERMINISTIC" || step.target === "BROWSER_SEMANTIC";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    try {
      if (!this.session) {
        // A resumed run whose browser session is gone cannot continue mid-page: fields filled before the
        // pause no longer exist, so acting now could commit incomplete data.
        if (step.operation !== "NAVIGATE" && context.getBrowserContext().currentUrl) {
          return {
            state: "PAUSED_FOR_HUMAN",
            hitlReason: "RESUME_CONTEXT_LOST",
            message: `The browser session for this run ended while it was paused, so the page state needed for "${step.description}" is gone. Restart the run or complete this step manually.`
          } as any;
        }
        const inputs = context.getState().inputs;
        const runtimeDestination = inputs.url || inputs.targetUrl || inputs["target_url"] || inputs["{{url}}"];
        const stepDestination = step.target === "BROWSER_DETERMINISTIC" && step.operation === "NAVIGATE"
          ? step.args?.url
          : undefined;
        const rawDestination = stepDestination && stepDestination !== "{{url}}" ? stepDestination : runtimeDestination;
        const targetNavUrl = typeof rawDestination === "string"
          ? (/^https?:\/\//i.test(rawDestination) ? rawDestination : `https://${rawDestination}`)
          : "";
        if (!targetNavUrl || !/^https?:\/\//i.test(targetNavUrl) || targetNavUrl.includes("{{")) {
          return {
            state: "PAUSED_FOR_HUMAN",
            hitlReason: "DESTINATION_NOT_ESTABLISHED",
            message: "This browser workflow has no demonstrated or configured destination URL. Provide the correct application URL before execution."
          } as any;
        }

        this.session = await this.provider.createSession();
        const connected = await this.provider.navigate(this.session, targetNavUrl);
        this.browser = connected.browser;
        this.page = connected.page;
        if (this.onSessionReady) {
          // Best-effort: a failure to persist the live-view link shouldn't abort execution.
          await this.onSessionReady(this.session).catch((e) => console.error("Failed to persist session info", e));
        }
      }

      if (step.target === "BROWSER_DETERMINISTIC") {
        if (step.operation === "NAVIGATE") {
          const inputs = context.getState().inputs;
          let targetUrl: string | undefined = step.args?.url;
          if (!targetUrl || /\{\{.*\}\}/.test(targetUrl)) {
            const templated = targetUrl && /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/.exec(targetUrl);
            const provided = templated ? inputs[templated[1]!] : undefined;
            targetUrl = typeof provided === "string" ? provided : undefined;
          }
          if (targetUrl && !/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;
          if (!targetUrl) {
            return {
              state: "PAUSED_FOR_HUMAN",
              hitlReason: "DESTINATION_NOT_ESTABLISHED",
              message: `Step "${step.description}" has no established destination URL. Provide it before continuing.`
            } as any;
          }

          const currentUrl = this.page.url();
          let needsGoto = true;
          try {
            if (currentUrl && currentUrl !== "about:blank") {
              const u1 = new URL(currentUrl);
              const u2 = new URL(targetUrl);
              if (u1.origin === u2.origin && u1.pathname === u2.pathname) needsGoto = false;
            }
          } catch (_) {}

          if (needsGoto) {
            try {
              await this.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
            } catch (navErr: any) {
              const transient = /ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|Timeout/i.test(navErr.message || "");
              if (!transient) {
                return { state: "FAILED", message: `Navigation to ${targetUrl} failed: ${navErr.message}` };
              }
              try {
                await new Promise(r => setTimeout(r, 1000));
                await this.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
              } catch (retryErr: any) {
                return { state: "FAILED", message: `Navigation to ${targetUrl} failed after one retry: ${retryErr.message}` };
              }
            }
          }

          const navUrlLower = (targetUrl || "").toLowerCase();
          if (navUrlLower.includes("logout") || navUrlLower.includes("signout")) {
            let domain = "";
            try { domain = new URL(this.page.url()).hostname; } catch (_) {}
            if (domain) this.authenticatedDomains.delete(domain);
          }

          // Universal Autonomous Intelligence: Check for dynamic auth barrier on ANY navigated page
          const navAuthBarrier = await this.detectAuthBarrier(step, context);
          if (navAuthBarrier) {
            const authRes = await this.handleAuthBarrier(navAuthBarrier, step, context);
            if (authRes.state !== "SUCCEEDED") return authRes;
          }

          // A redirect to a different site means the environment no longer matches the demonstration.
          const landed = this.page.url();
          if (!sameSite(landed, targetUrl)) {
            return {
              state: "PAUSED_FOR_HUMAN",
              hitlReason: "UNEXPECTED_REDIRECT",
              message: `Navigating to ${targetUrl} ended on ${landed}, a different site than the workflow targets. Confirm the environment before continuing.`
            } as any;
          }

          const outputs = await this.capturePageOutputs(context, "NAVIGATE");
          return { state: "SUCCEEDED", outputs };
        }

        if (step.operation === "TYPE" || (step.operation as string) === "INPUT") {
          const val = step.args?.value;
          const desc = step.description || "";
          const target = describeTarget(step);
          const fieldText = `${target.label || ""} ${target.text || ""} ${target.selector || ""} ${desc}`.toLowerCase();
          const isCredential = Boolean(step.args?.sensitive) || /pass(word)?|pwd|otp|user ?name|e-?mail|login/.test(fieldText);

          let domain = "";
          try { domain = new URL(this.page.url()).hostname; } catch (_) {}
          // Credentials supplied through HITL for this site are already entered; the demonstrated typing step is satisfied.
          if (isCredential && ((domain && this.authenticatedDomains.has(domain)) || this.submittedAuthPages.has(this.page.url()) || (domain && this.submittedAuthPages.has(domain)))) {
            return { state: "SUCCEEDED", outputs: { skipped: true, reason: "Credentials were provided by a human for this site" } };
          }
          // Recorded credentials are never replayed; a human provides them on the live page.
          if (isCredential || val === undefined || val === "") {
            const authBarrier = await this.detectAuthBarrier(step, context);
            if (authBarrier) return await this.handleAuthBarrier(authBarrier, step, context);
          }
          if (val === undefined || val === "") {
            return {
              state: "PAUSED_FOR_HUMAN",
              hitlReason: "MISSING_RUNTIME_VALUE",
              message: `No value is known for "${target.label || target.text || desc}". Provide it to continue.`
            } as any;
          }

          await dismissKnownPopups(this.page);
          const resolved = await resolveTarget(this.page, step, "fill");
          if (!resolved.ok) return this.unresolvedTarget(step, resolved);
          try {
            await resolved.locator.fill(String(val), { timeout: 5000 });
          } catch (fillErr: any) {
            return { state: "PAUSED_FOR_HUMAN", hitlReason: "INPUT_FAILED", message: `Could not enter a value into "${target.label || target.text}": ${fillErr.message}` } as any;
          }
          const actual = await resolved.locator.inputValue().catch(() => undefined);
          if (actual !== undefined && actual !== String(val)) {
            return { state: "FAILED", message: `The field "${target.label || target.text}" holds "${isCredential ? "***" : actual}" after typing, not the intended value.` };
          }
          const outputs = await this.capturePageOutputs(context, "TYPE");
          return { state: "SUCCEEDED", outputs: { ...outputs, target_strategy: resolved.strategy } };
        }

        if (step.operation === "CLICK" || (step.operation as string) === "SUBMIT") {
          const desc = step.description || "";
          const target = describeTarget(step);
          const lowerTarget = `${target.text || ""} ${target.label || ""}`.toLowerCase();

          let domain = "";
          try { domain = new URL(this.page.url()).hostname; } catch (_) {}
          // The sign-in submit of a demonstrated login is satisfied once a human signed in for this site.
          if (((domain && this.authenticatedDomains.has(domain)) || this.submittedAuthPages.has(this.page.url()) || (domain && this.submittedAuthPages.has(domain))) &&
              /\b(log ?in|sign ?in)\b/.test(lowerTarget)) {
            return { state: "SUCCEEDED", outputs: { skipped: true, reason: "Already authenticated by a human operator" } };
          }

          const authBarrier = await this.detectAuthBarrier(step, context);
          if (authBarrier) {
            return await this.handleAuthBarrier(authBarrier, step, context);
          }

          await dismissKnownPopups(this.page);
          const resolved = await resolveTarget(this.page, step, "click");
          if (!resolved.ok) return this.unresolvedTarget(step, resolved);

          const urlBefore = this.page.url();
          try {
            await resolved.locator.click({ timeout: 5000 });
          } catch (clickErr: any) {
            try {
              await resolved.locator.scrollIntoViewIfNeeded({ timeout: 2000 });
              await resolved.locator.click({ timeout: 4000 });
            } catch (retryErr: any) {
              return {
                state: "PAUSED_FOR_HUMAN",
                hitlReason: "CLICK_FAILED",
                message: `"${target.text || target.label || desc}" was found but could not be clicked (${retryErr.message || clickErr.message}). Nothing was clicked in its place.`
              } as any;
            }
          }

          await Promise.race([
            this.page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => null),
            this.page.waitForTimeout(1500)
          ]);
          await dismissKnownPopups(this.page);

          if (/\b(log ?out|sign ?out)\b/.test(lowerTarget) && domain) {
            this.authenticatedDomains.delete(domain);
          }

          const outputs = await this.capturePageOutputs(context, "CLICK");
          return { state: "SUCCEEDED", outputs: { ...outputs, target_strategy: resolved.strategy, url_before: urlBefore } };
        }

        if (step.operation === "SELECT" || (step.operation as string) === "CHOOSE") {
          const val = step.args?.value || step.args?.option || "";
          const target = describeTarget(step);
          if (!val) {
            return { state: "PAUSED_FOR_HUMAN", hitlReason: "SELECT_VALUE_MISSING", message: `No demonstrated option was recorded for "${target.label || target.text || step.description}".` } as any;
          }
          const resolved = await resolveTarget(this.page, step, "select");
          if (!resolved.ok) return this.unresolvedTarget(step, resolved);
          const expected = String(val).trim().toLowerCase();
          try {
            await resolved.locator.selectOption({ label: String(val) }, { timeout: 4000 })
              .catch(() => resolved.locator.selectOption({ value: String(val) }, { timeout: 4000 }));
          } catch (e: any) {
            return { state: "PAUSED_FOR_HUMAN", hitlReason: "SELECT_FAILED", message: `Could not choose "${val}": ${e.message}` } as any;
          }
          const selectedMatches = await resolved.locator.evaluate((node: HTMLSelectElement, wanted: string) => {
            const option = node.selectedOptions?.[0];
            return Boolean(option && (option.label.trim().toLowerCase() === wanted || option.value.trim().toLowerCase() === wanted));
          }, expected).catch(() => false);
          if (!selectedMatches) {
            return { state: "PAUSED_FOR_HUMAN", hitlReason: "SELECT_OPTION_NOT_RESOLVED", message: `The option "${val}" is not available in "${target.label || target.text}".` } as any;
          }
          const outputs = await this.capturePageOutputs(context, "SELECT");
          return { state: "SUCCEEDED", outputs };
        }

        if (step.operation === "PRESS_KEY") {
          const key = String(step.args?.key || "Enter");
          const target = describeTarget(step);
          if (target.text || target.label || target.selector) {
            const resolved = await resolveTarget(this.page, step, "fill");
            if (!resolved.ok) return this.unresolvedTarget(step, resolved);
            await resolved.locator.press(key, { timeout: 4000 });
          } else {
            await this.page.keyboard.press(key);
          }
          await this.page.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => null);
          const outputs = await this.capturePageOutputs(context, "PRESS_KEY");
          return { state: "SUCCEEDED", outputs };
        }

        if (step.operation === "SCROLL") {
          const target = describeTarget(step);
          if (target.text || target.label || target.selector) {
            const resolved = await resolveTarget(this.page, step, "read");
            if (!resolved.ok) return this.unresolvedTarget(step, resolved);
            await resolved.locator.scrollIntoViewIfNeeded({ timeout: 4000 });
          } else {
            await this.page.mouse.wheel(0, 600);
          }
          return { state: "SUCCEEDED" };
        }

        if (step.operation === "EXTRACT") {
          const target = describeTarget(step);
          let text = "";
          let scope = "PAGE";
          if (target.text || target.label || target.selector) {
            const resolved = await resolveTarget(this.page, step, "read", { timeoutMs: 6000 });
            if (!resolved.ok) return this.unresolvedTarget(step, resolved);
            text = (await resolved.locator.innerText({ timeout: 3000 }).catch(() => "")) || "";
            scope = resolved.strategy;
          } else {
            text = (await this.page.locator("body").innerText({ timeout: 3000 }).catch(() => "")) || "";
          }
          if (!text.trim()) {
            return { state: "FAILED", message: `Nothing readable was found for "${step.description}".` };
          }

          // Multi-language normalization: detect non-English text and translate to English
          const translation = translateToEnglish(text);
          const buffer = await this.page.screenshot().catch(() => null);
          return {
            state: "SUCCEEDED",
            outputs: {
              ...(buffer ? { screenshotUrl: `data:image/png;base64,${buffer.toString('base64')}` } : {}),
              ...(step.bind_result_to ? {
                [step.bind_result_to]: translation.translated,
                [`${step.bind_result_to}_raw`]: translation.original,
                [`${step.bind_result_to}_lang`]: translation.detectedLanguage,
                [`${step.bind_result_to}_source_url`]: this.page.url(),
                [`${step.bind_result_to}_step_id`]: step.id
              } : {}),
              extractedText: translation.translated,
              originalLanguageText: translation.original,
              detectedLanguage: translation.detectedLanguage,
              translatedToEnglish: translation.wasTranslated,
              sourceUrl: this.page.url(),
              extractionScope: scope
            }
          };
        }

        if (step.operation === "VERIFY" || step.operation === "ASSERT") {
          const criteria = Array.isArray(step.args?.criteria) ? step.args!.criteria : [];
          if (!criteria.length) {
            return { state: "FAILED", message: `Verification step "${step.description}" has no checkable condition.` };
          }
          const result = await checkOutcome(this.page, criteria);
          const buffer = await this.page.screenshot().catch(() => null);
          const outputs = {
            outcome_verification: { ...result, checkedAt: new Date().toISOString(), url: this.page.url() },
            ...(buffer ? { screenshotUrl: `data:image/png;base64,${buffer.toString("base64")}` } : {})
          };
          if (!result.verified) {
            const failed = result.checks.filter(c => !c.passed).map(c => `${c.type} "${c.expected}" (${c.observed})`).join("; ");
            return { state: "FAILED", message: `OUTCOME_NOT_MET: ${failed}`, outputs };
          }
          return { state: "SUCCEEDED", outputs };
        }

        if (step.operation === "WAIT") {
          await this.page.waitForTimeout(Math.min(Number(step.args?.timeout) || 500, 30000));
          const buffer = await this.page.screenshot().catch(() => null);
          return {
            state: "SUCCEEDED",
            outputs: buffer ? { screenshotUrl: `data:image/png;base64,${buffer.toString('base64')}` } : {}
          };
        }
        return { state: "FAILED", message: `Unsupported deterministic operation ${step.operation}` };
      }

      if (step.target === "BROWSER_SEMANTIC") {
        if (!this.stagehand) {
          const llmClient = process.env.GEMINI_API_KEY ? new CustomOpenAIClient({
            modelName: process.env.GEMINI_MODEL || process.env.STAGEHAND_MODEL || "gemini-2.5-flash",
            client: new OpenAI({
              apiKey: process.env.GEMINI_API_KEY,
              baseURL: process.env.GEMINI_BASE_URL || process.env.OPENROUTER_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
            }) as any,
          }) : undefined;

          this.stagehand = new Stagehand({
            env: this.session?.local ? "LOCAL" : "BROWSERBASE",
            ...(!this.session?.local && this.session?.id ? { browserbaseSessionID: this.session.id } : {}),
            ...(llmClient ? { llmClient } : { modelName: "gpt-4o" as any }),
          });
          await this.stagehand.init();
        }

        // Check if there's a HITL override for this step
        const hitlInput = context.getState().inputs[`hitl_response_${step.id}`];
        if (hitlInput && hitlInput.includes("already processed")) {
          console.log("Semantic CLICK bypassed due to HITL override");
          return { state: "SUCCEEDED" };
        }

        if (step.operation === "EXTRACT") {
          try {
            const result = await this.stagehand.extract(step.args?.instruction || "Extract the main content");
            return {
              state: "SUCCEEDED",
              outputs: step.bind_result_to ? { [step.bind_result_to]: result } : {}
            };
          } catch (e) {
            return { state: "FAILED", message: "Stagehand extract failed: " + String(e) };
          }
        }

        if (step.operation === "CLICK" || step.operation === "ACT") {
          try {
            const instruction = step.description || step.args?.instruction || "Click the element";
            await this.stagehand.act(instruction);
            // Return screenshot just like deterministic interactions
            const buffer = await this.page.screenshot();
            return { state: "SUCCEEDED", outputs: { screenshotUrl: `data:image/png;base64,${buffer.toString('base64')}` } };
          } catch (e) {
            return { state: "PAUSED_FOR_HUMAN", hitlReason: "ELEMENT_NOT_FOUND", message: "Stagehand act found no matching elements or failed: " + String(e) } as any;
          }
        }

        return { state: "FAILED", message: `Unsupported semantic operation ${step.operation}` };
      }

      return { state: "FAILED", message: "Unknown target" };
    } catch (e: any) {
      const msg = e.message || "";
      let providerCode = null;
      if (msg.includes("401")) providerCode = "AUTHENTICATION_ERROR";
      else if (msg.includes("402")) providerCode = "PROVIDER_CREDITS_EXHAUSTED";
      else if (msg.includes("429")) providerCode = "RATE_LIMITED";
      else if (msg.includes("500") || msg.includes("502") || msg.includes("503")) providerCode = "PROVIDER_UNAVAILABLE";
      else if (msg.includes("timeout")) providerCode = "PROVIDER_TIMEOUT";

      if (providerCode) {
        return {
          state: "PAUSED_FOR_HUMAN",
          hitlReason: "PROVIDER_FAILURE",
          message: `Ghost cannot safely continue because its reasoning provider is unavailable. [Code: ${providerCode}]`
        } as any;
      }

      return { state: "FAILED", message: e.message };
    }
  }

  async cleanup() {
    if (this.stagehand) await this.stagehand.close();
    else if (this.browser) await this.provider.cleanup(this.browser);
  }
}
