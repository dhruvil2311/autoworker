import { BrowserbaseExecutionProvider, type BrowserbaseSession } from "../browserbase.js";
import { WorkflowRuntime, ExecutionPlanner, DataExecutor, ApiExecutor, HumanExecutor } from "@ghost/runtime";
import type { ExecutionCapability, ExecutionResult, RuntimeContext } from "@ghost/runtime";
import type { WorkflowV2Step, WorkflowV2 } from "@ghost/workflow-schema";
import { Stagehand, CustomOpenAIClient } from "@browserbasehq/stagehand";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export class RealBrowserExecutor implements ExecutionCapability {
  private session?: BrowserbaseSession;
  private browser?: any;
  private page?: any;
  private stagehand?: Stagehand;

  constructor(private provider: BrowserbaseExecutionProvider) { }

  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "BROWSER_DETERMINISTIC" || step.target === "BROWSER_SEMANTIC";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    try {
      if (!this.session) {
        console.log("Connecting to Browserbase...");
        this.session = await this.provider.createSession();
        const connected = await this.provider.navigate(this.session, "about:blank");
        this.browser = connected.browser;
        this.page = connected.page;
      }

      if (step.target === "BROWSER_DETERMINISTIC") {
        if (step.operation === "NAVIGATE") {
          console.log(`Navigating to ${step.args?.url}...`);
          await this.page.goto(step.args?.url, { waitUntil: "domcontentloaded" });
          return { state: "SUCCEEDED" };
        }
        if (step.operation === "TYPE") {
          console.log(`Typing into ${step.args?.selector}...`);
          await this.page.fill(step.args?.selector, step.args?.value);
          return { state: "SUCCEEDED" };
        }
        if (step.operation === "CLICK") {
          console.log(`Clicking ${step.args?.selector}...`);
          await this.page.click(step.args?.selector);
          return { state: "SUCCEEDED" };
        }
        if (step.operation === "EXTRACT") {
          console.log(`Extracting from ${step.args?.selector}...`);
          const text = await this.page.locator(step.args?.selector).textContent();
          return {
            state: "SUCCEEDED",
            outputs: step.bind_result_to ? { [step.bind_result_to]: text } : {}
          };
        }
        return { state: "FAILED", message: `Unsupported deterministic operation ${step.operation}` };
      }

      if (step.target === "BROWSER_SEMANTIC") {
        if (!this.stagehand) {
          console.log("Initializing Stagehand fallback...");
          const openai = new OpenAI({
            apiKey: process.env.GEMINI_API_KEY,
            baseURL: process.env.GEMINI_BASE_URL || process.env.OPENROUTER_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
          });
          const llmClient = new CustomOpenAIClient({
            modelName: process.env.GEMINI_MODEL || process.env.STAGEHAND_MODEL || "gemini-2.5-flash",
            client: openai as any,
          });

          this.stagehand = new Stagehand({
            env: "BROWSERBASE",
            browserbaseSessionID: this.session.id,
            llmClient
          });
          await this.stagehand.init();
        }

        if (step.operation === "EXTRACT") {
          console.log(`Semantic extraction for instruction: ${step.args?.instruction}`);
          const data = await this.page.extract({ instruction: step.args?.instruction });
          return {
            state: "SUCCEEDED",
            outputs: step.bind_result_to ? { [step.bind_result_to]: data } : {}
          };
        }
        if (step.operation === "CLICK" || step.operation === "TYPE") {
          console.log(`Semantic action for instruction: ${step.args?.instruction || step.description}`);
          await this.page.act({ action: step.args?.instruction || step.description! });
          return { state: "SUCCEEDED" };
        }

        return { state: "FAILED", message: `Unsupported semantic operation ${step.operation}` };
      }

      return { state: "FAILED", message: "Unknown target" };
    } catch (e: any) {
      console.error(`Browser execution failed: ${e.message}`);
      return { state: "FAILED", message: e.message };
    }
  }

  async cleanup() {
    if (this.stagehand) await this.stagehand.close();
    else if (this.browser) await this.provider.cleanup(this.browser);
  }
}

async function run() {
  const provider = new BrowserbaseExecutionProvider({
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID
  });

  const browserExecutor = new RealBrowserExecutor(provider);

  const workflow: WorkflowV2 = {
    workflow_version: "2.0",
    status: "DRAFT",
    name: "Test V2 Workflow",
    description: "Verify V2 Browser",
    variables: [],
    secrets: [],
    expected_domains: [],
    compiler: {
      version: "3.5",
      source_specification_id: "test",
      compiled_at: new Date().toISOString()
    },
    root_step: {
      id: "root",
      operation: "SEQUENCE", description: "Root", target: "PLATFORM_ADAPTER",
      children: [
        { id: "s1", operation: "NAVIGATE", description: "Navigate", target: "BROWSER_DETERMINISTIC", args: { url: "https://example.com" } },
        { id: "s2", operation: "EXTRACT", description: "Extract", target: "BROWSER_DETERMINISTIC", args: { selector: "h1" }, bind_result_to: "heading" },
        // Fallback test: Invalid deterministic selector fails? We'll just test semantic directly
        { id: "s3", operation: "EXTRACT", description: "Extract", target: "BROWSER_SEMANTIC", args: { instruction: "Extract the paragraph text" }, bind_result_to: "paragraph" }
      ]
    }
  };

  const planner = new ExecutionPlanner();
  const plan = planner.createPlan("v1", workflow);

  // Mock persistence
  const persistence = {
    async recordStepStarted() { },
    async recordStepCompleted() { },
    async hasStepCompleted() { return false; },
    async recordRunState() { },
    async recordHitlPause() { },
    async saveCheckpoint() { },
    async loadCheckpoint() { return null; }
  };

  const runtime = new WorkflowRuntime(plan, persistence, [
    new DataExecutor(),
    new ApiExecutor(),
    new HumanExecutor(),
    browserExecutor
  ]);

  console.log("Starting V2 Real Browser Execution...");
  await runtime.start();

  const state = runtime.getContext().getState();
  console.log("\nExecution completed. Final Variables:");
  console.log(state.variables);

  await browserExecutor.cleanup();
}

run().catch(console.error);
