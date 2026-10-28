import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { chromium } from "playwright";

async function test() {
  console.log("PLAYWRIGHT_BROWSERS_PATH:", process.env.PLAYWRIGHT_BROWSERS_PATH);
  console.log("WORKER_HEADLESS:", process.env.WORKER_HEADLESS);
  try {
    const browser = await chromium.launch({ headless: true });
    console.log("Browser launched successfully!");
    const page = await browser.newPage();
    await page.goto("https://example.com");
    console.log("Title:", await page.title());
    await browser.close();
    console.log("Closed successfully!");
  } catch (e) {
    console.error("Launch failed:", e);
  }
}

test();
