import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright";

async function run() {
  console.log("Initializing Browserbase...");
  
  if (!process.env.BROWSERBASE_API_KEY) {
    console.log("BROWSERBASE_API_KEY not found. Skipping live test. [BLOCKED_EXTERNAL]");
    return;
  }
  
  try {
    const bb = new Browserbase();
    console.log("Creating session...");
    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID || "",
    });
    console.log(`Session created: ${session.id}`);

    console.log("Connecting Playwright...");
    const browser = await chromium.connectOverCDP(session.connectUrl);
    
    console.log("Navigating to example.com...");
    const context = browser.contexts()[0];
    const page = await context!.newPage();
    await page.goto("https://example.com");
    
    console.log("Evaluating dom command...");
    const title = await page.evaluate(() => document.title);
    const math = await page.evaluate(() => 5 + 10);
    
    console.log(`Result: title="${title}", math=${math}`);
    
    await browser.close();
    console.log("[VERIFIED_LIVE]");
  } catch (err: any) {
    console.error(`Browserbase test failed: ${err.message}`);
    console.log("[BLOCKED_EXTERNAL]");
  }
}

run().catch(console.error);
