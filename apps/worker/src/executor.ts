import type { Page } from "playwright";
import type { Workflow, WorkflowStep } from "@ghost/workflow-schema";
import { assertSafeNavigationUrl } from "@ghost/security";
import { logger } from "@ghost/observability";
import { BrowserbaseExecutionProvider, type BrowserbaseSession } from "./browserbase.js";
import { Stagehand, CustomOpenAIClient } from "@browserbasehq/stagehand";
import OpenAI from "openai";
export type StepResult = {
  stepId: string;
  state: "SUCCEEDED" | "FAILED" | "WAITING_FOR_HUMAN";
  strategy?: string;
  message?: string;
};

export interface ExecutionPersistence {
  recordStepStarted(stepId: string): Promise<void>;
  recordStepCompleted(stepId: string, state: StepResult["state"], strategy?: string, message?: string): Promise<void>;
  recordRunState(state: string, sessionMetadata?: { providerSessionId: string; createdAt: string; expiresAt: string; hitlDeadlineAt?: string }): Promise<void>;
  recordHitlPause(stepId: string, challengeType: string): Promise<void>;
}

export async function executeWorkflowWithBrowserbase(
  provider: BrowserbaseExecutionProvider,
  workflow: Workflow,
  persistence: ExecutionPersistence
): Promise<StepResult[]> {
  const session = await provider.createSession();
  await persistence.recordRunState("RUNNING", {
    providerSessionId: session.id,
    createdAt: session.createdAt ?? new Date().toISOString(),
    expiresAt: session.expiresAt ?? new Date(Date.now() + 300000).toISOString()
  });

  const browser = await provider.connectBrowser(session);
  const page = await browser.newPage();

  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.isNavigationRequest()) {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
        return route.continue();
      }
      try {
        assertSafeNavigationUrl(url, workflow.expected_domains);
        route.continue();
      } catch (e) {
        logger.warn({ run_id: session.id, blocked_url: url }, "Blocked navigation to unapproved domain");
        route.abort("accessdenied");
      }
    } else {
      route.continue();
    }
  });

  let stagehand: Stagehand | undefined;

  const results: StepResult[] = [];
  try {
    for (const step of workflow.steps) {
      await persistence.recordStepStarted(step.id);

      if (await hasAuthChallenge(page)) {
        logger.warn({ run_id: session.id, step_id: step.id }, "Auth challenge detected");
        await persistence.recordHitlPause(step.id, "auth_challenge");
        await persistence.recordStepCompleted(step.id, "WAITING_FOR_HUMAN", undefined, "Authentication challenge detected");
        results.push({ stepId: step.id, state: "WAITING_FOR_HUMAN", message: "Authentication challenge detected" });
        break;
      }

      const result = await executeStep(page, workflow, step, async () => {
        if (!stagehand) {
          let llmClient: CustomOpenAIClient | undefined;
          if (process.env.GEMINI_API_KEY) {
            const openai = new OpenAI({
              apiKey: process.env.GEMINI_API_KEY,
              baseURL: process.env.GEMINI_BASE_URL || process.env.OPENROUTER_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
            });
            llmClient = new CustomOpenAIClient({
              modelName: process.env.GEMINI_MODEL || process.env.STAGEHAND_MODEL || "gemini-2.5-flash",
              client: openai as any,
            });
          }

          stagehand = new Stagehand({
            env: "BROWSERBASE",
            browserbaseSessionID: session.id,
            ...(llmClient
              ? { llmClient }
              : { modelName: (process.env.STAGEHAND_MODEL as any) || "gpt-4o" }),
          });
          await stagehand.init();
        }
        return stagehand!;
      });

      if (result.state === "WAITING_FOR_HUMAN") {
        await persistence.recordHitlPause(step.id, "workflow_pause");
      }

      await persistence.recordStepCompleted(step.id, result.state, result.strategy, result.message);
      results.push(result);
      if (result.state !== "SUCCEEDED") break;
    }

    // Only cleanup if we are not waiting for human!
    const isWaitingForHuman = results.some(r => r.state === "WAITING_FOR_HUMAN");
    if (!isWaitingForHuman) {
      if (stagehand) {
        try { await stagehand.close(); } catch (e) { }
      }
      await provider.cleanup(browser);
    }

    return results;
  } catch (err) {
    if (stagehand) {
      try { await stagehand.close(); } catch (e) { }
    }
    await provider.cleanup(browser);
    throw err;
  }
}

export async function executeStep(page: Page, workflow: Workflow, step: WorkflowStep, getStagehand: () => Promise<Stagehand>): Promise<StepResult> {
  if (step.destructive) {
    return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "Destructive action requires approval" };
  }

  try {
    switch (step.type) {
      case "NAVIGATE": {
        const url = step.target?.expected_url;
        if (!url) return { stepId: step.id, state: "FAILED", message: "NAVIGATE step missing expected_url" };
        assertSafeNavigationUrl(url, workflow.expected_domains);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        return { stepId: step.id, state: "SUCCEEDED", strategy: "deterministic_url" };
      }
      case "CLICK":
        return await clickWithFallbacks(page, step, getStagehand);
      case "TYPE":
        return await typeWithFallbacks(page, step, getStagehand);
      case "SELECT":
        return await selectWithFallbacks(page, step, getStagehand);
      case "WAIT":
        await page.waitForTimeout(Math.min(Number(step.input?.value || 1000), 30000));
        return { stepId: step.id, state: "SUCCEEDED", strategy: "deterministic_wait" };
      case "ASSERT":
        return await executeAssert(page, step);
      case "PAUSE":
      case "HUMAN_INPUT":
        // It's not available to call persistence here easily because it's inside executeStep,
        // which doesn't receive persistence...
        // Wait, executeStep just returns { state: "WAITING_FOR_HUMAN" }
        // Let's just return that and in executeWorkflowWithBrowserbase we can check if it returned WAITING_FOR_HUMAN.
        return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "Workflow requested human input" };
      default:
        return { stepId: step.id, state: "FAILED", message: `UNSUPPORTED_ACTION: ${step.type} requires executor implementation` };
    }
  } catch (error) {
    logger.warn({ err: error, step_id: step.id }, "step_execution_failed");
    return { stepId: step.id, state: "FAILED", message: error instanceof Error ? error.message : "Unknown failure" };
  }
}

async function clickWithFallbacks(page: Page, step: WorkflowStep, getStagehand: () => Promise<Stagehand>): Promise<StepResult> {
  for (const candidate of step.target?.selector_candidates ?? []) {
    if (candidate.strategy === "css") {
      const locator = page.locator(candidate.value).first();
      if ((await locator.count()) > 0 && await locator.isVisible()) {
        await locator.click({ timeout: 5000 });
        return { stepId: step.id, state: "SUCCEEDED", strategy: "SELECTOR" };
      }
    }
  }
  if (step.target?.role && step.target.name) {
    const locator = page.getByRole(step.target.role as never, { name: step.target.name }).first();
    if (await locator.count() > 0) {
      await locator.click({ timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "ACCESSIBILITY" };
    }
  }
  if (step.target?.name) {
    const locator = page.getByText(step.target.name, { exact: false }).first();
    if (await locator.count() > 0) {
      await locator.click({ timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "TEXT" };
    }
  }

  // Stagehand Fallback (Healing)
  try {
    const stagehand = await getStagehand();
    const pageObj = (stagehand as any).page || stagehand;
    const observations = await pageObj.observe({ instruction: `Find the element for: Click on ${step.description}` });
    if (observations && observations.length > 0) {
      const selector = observations[0].selector;
      await page.locator(selector).click({ timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "HEALED_SELECTOR", message: selector };
    }
    throw new Error("No elements found");
  } catch (err) {
    logger.warn({ err, step_id: step.id }, "Stagehand healing fallback failed");
    return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "No reliable click target found, and AI healing failed" };
  }
}

async function typeWithFallbacks(page: Page, step: WorkflowStep, getStagehand: () => Promise<Stagehand>): Promise<StepResult> {
  if (step.input?.secret_ref || step.input?.value?.includes("{{SECRET:")) {
    return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "SECRET_REQUIRED: Secret value must be resolved server-side" };
  }
  const value = step.input?.value ?? "";
  for (const candidate of step.target?.selector_candidates ?? []) {
    if (candidate.strategy === "css") {
      const locator = page.locator(candidate.value).first();
      if ((await locator.count()) > 0 && await locator.isVisible()) {
        await locator.fill(value, { timeout: 5000 });
        return { stepId: step.id, state: "SUCCEEDED", strategy: "SELECTOR" };
      }
    }
  }
  if (step.target?.name) {
    const locator = page.getByLabel(step.target.name).first();
    if (await locator.count() > 0) {
      await locator.fill(value, { timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "ACCESSIBILITY" };
    }
  }

  // Stagehand Fallback (Healing)
  try {
    const stagehand = await getStagehand();
    const pageObj = (stagehand as any).page || stagehand;
    const observations = await pageObj.observe({ instruction: `Find the input element for: Type into ${step.description}` });
    if (observations && observations.length > 0) {
      const selector = observations[0].selector;
      await page.locator(selector).fill(value, { timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "HEALED_SELECTOR", message: selector };
    }
    throw new Error("No elements found");
  } catch (err) {
    logger.warn({ err, step_id: step.id }, "Stagehand healing fallback failed");
    return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "No reliable input target found, and AI healing failed" };
  }
}

async function selectWithFallbacks(page: Page, step: WorkflowStep, getStagehand: () => Promise<Stagehand>): Promise<StepResult> {
  const value = step.input?.value ?? "";
  for (const candidate of step.target?.selector_candidates ?? []) {
    if (candidate.strategy === "css") {
      const locator = page.locator(candidate.value).first();
      if ((await locator.count()) > 0 && await locator.isVisible()) {
        await locator.selectOption(value, { timeout: 5000 });
        return { stepId: step.id, state: "SUCCEEDED", strategy: "SELECTOR" };
      }
    }
  }

  // Stagehand Fallback (Healing)
  try {
    const stagehand = await getStagehand();
    const pageObj = (stagehand as any).page || stagehand;
    const observations = await pageObj.observe({ instruction: `Find the select or dropdown element for: ${step.description}` });
    if (observations && observations.length > 0) {
      const selector = observations[0].selector;
      await page.locator(selector).selectOption(value, { timeout: 5000 });
      return { stepId: step.id, state: "SUCCEEDED", strategy: "HEALED_SELECTOR", message: selector };
    }
    throw new Error("No elements found");
  } catch (err) {
    logger.warn({ err, step_id: step.id }, "Stagehand healing fallback failed");
    return { stepId: step.id, state: "WAITING_FOR_HUMAN", message: "No reliable select target found, and AI healing failed" };
  }
}

async function executeAssert(page: Page, step: WorkflowStep): Promise<StepResult> {
  const expectedUrl = step.target?.expected_url;
  const expectedText = step.target?.name;

  if (expectedUrl) {
    const currentUrl = page.url();
    if (currentUrl !== expectedUrl) {
      return { stepId: step.id, state: "FAILED", message: `ASSERTION_FAILED: Expected URL ${expectedUrl}, got ${currentUrl}` };
    }
  }
  if (expectedText) {
    const textLocator = page.getByText(expectedText, { exact: false }).first();
    if (await textLocator.count() === 0 || !(await textLocator.isVisible())) {
      return { stepId: step.id, state: "FAILED", message: `ASSERTION_FAILED: Expected text '${expectedText}' not found` };
    }
  }

  return { stepId: step.id, state: "SUCCEEDED", strategy: "deterministic_assert" };
}

async function hasAuthChallenge(page: Page): Promise<boolean> {
  const pageText = await page.textContent("body").catch(() => "");
  if (!pageText) return false;
  const lowerText = pageText.toLowerCase();

  // Basic heuristics for auth challenges
  if (
    lowerText.includes("enter the code") ||
    lowerText.includes("verification code") ||
    lowerText.includes("two-factor") ||
    lowerText.includes("authenticator app") ||
    lowerText.includes("otp") ||
    lowerText.includes("verify your identity")
  ) {
    return true;
  }

  // Look for common 2FA inputs
  const codeInput = page.locator('input[autocomplete="one-time-code"], input[name="code"], input[name="otp"]').first();
  if (await codeInput.count() > 0 && await codeInput.isVisible()) {
    return true;
  }

  return false;
}
