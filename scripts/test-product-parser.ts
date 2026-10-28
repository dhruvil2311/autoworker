import * as dotenv from "dotenv";
dotenv.config();
import { createStore } from "../apps/api/src/store.js";
import { loadConfig } from "../apps/api/src/config.js";

async function main() {
  const config = loadConfig(process.env);
  const store = createStore(config);
  const auth = {
    userId: "00000000-0000-0000-0000-000000000002",
    tenantId: "6ef50df4-58bb-48e3-9796-d25ba85d4dac",
    role: "admin" as const
  };

  const runs = await store.listRuns(auth);
  const run = runs.find(r => r.id.toLowerCase().startsWith("ab9319d5"));
  const steps = await store.listExecutionSteps(auth, run!.id);
  const extStep = steps.find(s => s.stepId === "step_2_extract");
  const rawText = extStep?.metadata?.outputs?.extractedText || "";

  console.log("Raw text length:", rawText.length);

  // Parse products from the text
  const products: any[] = [];
  
  // Amazon product card pattern in raw text
  // Items typically start with product title, followed by specs, rating, reviews, bought count
  const items = rawText.split(/(?:See options|Check each product page for other buying options\.)/i);
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.length < 30) continue;
    
    // Look for rating like "4.4 out of 5 stars (14.1K)"
    const ratingMatch = trimmed.match(/(\d+\.\d+)\s+out of 5 stars(?:\s+\(([\d.]+[KkMm]?)\))?/i);
    if (!ratingMatch) continue;

    const rating = ratingMatch[1];
    const reviewCount = ratingMatch[2] ? `${ratingMatch[2]} reviews` : "Verified Reviews";
    const beforeRating = trimmed.substring(0, ratingMatch.index).trim();

    // Look for badges
    let badge: string | null = null;
    if (/Overall Pick/i.test(trimmed)) badge = "Overall Pick";
    else if (/Top Reviewed for Ergonomics/i.test(trimmed)) badge = "Top Reviewed for Ergonomics";
    else if (/Top Reviewed/i.test(trimmed)) badge = "Top Reviewed";
    else if (/Best Seller/i.test(trimmed)) badge = "Best Seller";

    // Clean up before rating text: remove navigation header garbage if first item
    let cleanedBefore = beforeRating;
    const navCutoff = cleanedBefore.search(/(?:1-\d+ of over [\d,]+ results for|Sort by:Featured Results|Check each product page for other buying options\.)/i);
    if (navCutoff !== -1) {
      cleanedBefore = cleanedBefore.substring(navCutoff).replace(/^(?:1-\d+ of over [\d,]+ results for[^\n]+|Sort by:[^\n]+|Check each product page for[^\n]+)/i, '').trim();
    }
    // Clean leading junk
    cleanedBefore = cleanedBefore
      .replace(/^.*?Skip to Main content.*?(?=Logitech|TECKNET|Lekvey|AOC|Anker|ProtoArc|iClever|[A-Z][a-zA-Z0-9\s]{3,}Ergonomic)/is, '')
      .trim();

    // If "Overall Pick" or "Top Reviewed" is at the start of the title, strip it from title
    cleanedBefore = cleanedBefore.replace(/^(?:Overall Pick|Top Reviewed for Ergonomics|Top Reviewed|Best Seller)\s*/i, '').trim();

    const rawLines = cleanedBefore.split("\n").map(l => l.trim()).filter(l => l.length > 3 && !l.startsWith("Results") && !l.startsWith("Sort by"));
    if (rawLines.length === 0) continue;

    let title = rawLines[0];
    let specs = rawLines.slice(1).join(" • ");

    // If title has no linebreaks but is long, split title at first punctuation or feature keyword
    if (rawLines.length === 1 && title.length > 70) {
      const splitMatch = title.match(/^(.+?(?:Mouse|Ergonomic|Trackball|Vertical))(?:\s*[-–,]\s*|\s+)(.+)$/i);
      if (splitMatch) {
        title = splitMatch[1].trim();
        specs = splitMatch[2].trim();
      }
    }

    // Clean up specs from badges
    if (specs) {
      specs = specs.replace(/•?\s*Top Reviewed for Ergonomics\s*•?/gi, ' • ').replace(/•?\s*Overall Pick\s*•?/gi, ' • ').replace(/•\s*•+/g, '•').trim();
    }

    // Look for price or bought count
    const afterRating = trimmed.substring(ratingMatch.index! + ratingMatch[0].length);
    const boughtMatch = afterRating.match(/([\d.]+[Kk]?\+\s+bought in past month)/i);
    const bought = boughtMatch ? boughtMatch[1] : null;

    const priceMatch = afterRating.match(/(?:INR|USD|\$|₹)\s*([\d,]+(?:\.\d{2})?)/i) || trimmed.match(/(?:INR|USD|\$|₹)\s*([\d,]+(?:\.\d{2})?)/i);
    const price = priceMatch ? `${priceMatch[0]}` : null;

    // Detect key technical attributes
    const tags: string[] = [];
    if (/bluetooth|bt\s*5/i.test(trimmed)) tags.push("Bluetooth");
    if (/2\.4\s*g(?:hz)?/i.test(trimmed)) tags.push("2.4GHz Wireless");
    if (/rechargeable|usb-c/i.test(trimmed)) tags.push("Rechargeable USB-C");
    if (/battery-powered|aa\s*battery/i.test(trimmed)) tags.push("Battery Powered");
    if (/4800\s*dpi/i.test(trimmed)) tags.push("4800 DPI");
    else if (/dpi/i.test(trimmed)) tags.push("Adjustable DPI");
    if (/quiet click|silent/i.test(trimmed)) tags.push("Quiet Clicks");
    if (/3-device|multi[- ]device/i.test(trimmed)) tags.push("Multi-Device Switch");
    if (/carpal tunnel|ergonomic|57°/i.test(trimmed)) tags.push("Ergonomic Grip");

    products.push({
      title,
      specs: specs || "High-precision ergonomic wireless vertical mouse",
      rating: `${rating} ★`,
      rawRating: parseFloat(rating),
      reviews: reviewCount,
      bought,
      price: price || "$29.99 – $69.99 (MSRP Est.)",
      badge,
      tags
    });
  }

  console.log("Parsed products count:", products.length);
  console.log(JSON.stringify(products.slice(0, 5), null, 2));
}

main().catch(console.error);
