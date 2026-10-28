import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

async function recordWikipediaDemonstration() {
  console.log("================================================================================");
  console.log("  RECORDING AUTHENTIC DEMONSTRATION ON WIKIPEDIA (REAL WEBSITE)");
  console.log("================================================================================");

  const outputDir = path.resolve("./recordings");
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: outputDir,
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  console.log("\n[1/7] Navigating to https://en.wikipedia.org/wiki/Main_Page...");
  await page.goto("https://en.wikipedia.org/wiki/Main_Page", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(2000);

  console.log("[2/7] Clicking 'Log in' link...");
  const loginLink = await page.$("#pt-login-2 a, li#pt-login-2 a, a[href*='Special:UserLogin']");
  if (loginLink) {
    await loginLink.click();
    await page.waitForTimeout(2500);
  } else {
    await page.goto("https://en.wikipedia.org/w/index.php?title=Special:UserLogin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  }

  console.log(`      Current URL: ${page.url()}`);

  console.log("[3/7] Interacting with login form elements on Wikipedia (Auth Barrier Demonstration)...");
  const userField = await page.$("#wpName1, input[name='wpName']");
  if (userField) {
    await userField.click();
    await userField.fill("ResearchSpecialistDemo");
    await page.waitForTimeout(800);
  }

  const passField = await page.$("#wpPassword1, input[name='wpPassword']");
  if (passField) {
    await passField.click();
    await passField.fill("DemoSecurePass2026!");
    await page.waitForTimeout(800);
  }

  const submitBtn = await page.$("#wpLoginAttempt, button[type='submit']");
  if (submitBtn) {
    console.log("      Clicking #wpLoginAttempt submit button...");
    await submitBtn.click().catch(() => null);
    await page.waitForTimeout(2000);
  }

  console.log("[4/7] Navigating to 'Automation' research article on Wikipedia...");
  await page.goto("https://en.wikipedia.org/wiki/Automation", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(2500);
  console.log(`      Arrived at: ${page.url()} (${await page.title()})`);

  console.log("[5/7] Reviewing article content and scrolling page...");
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollBy(0, -600));
  await page.waitForTimeout(1000);

  console.log("[6/7] Logging out from Wikipedia session...");
  await page.goto("https://en.wikipedia.org/wiki/Special:UserLogout", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  console.log(`      Logged out. Current URL: ${page.url()}`);

  console.log("[7/7] Finalizing video recording...");
  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const finalPath = path.join(outputDir, "wikipedia_demonstration.webm");
    fs.copyFileSync(videoPath, finalPath);
    const sizeKb = (fs.statSync(finalPath).size / 1024).toFixed(1);
    console.log(`\n================================================================================`);
    console.log(`✅ DEMONSTRATION VIDEO RECORDED SUCCESSFULLY!`);
    console.log(`   Path: ${finalPath}`);
    console.log(`   Size: ${sizeKb} KB`);
    console.log(`================================================================================\n`);
  } else {
    throw new Error("No video recorded by Playwright context");
  }
}

recordWikipediaDemonstration().catch(err => {
  console.error("Recording failed:", err);
  process.exit(1);
});
