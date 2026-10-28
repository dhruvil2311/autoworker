import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const data: any = await res.json();
  const freeModels = data.data.filter((m: any) => m.id.endsWith(":free")).map((m: any) => m.id);
  console.log("Total free models:", freeModels.length);
  console.log("Sample free models:", freeModels.slice(0, 20));

  // Test top 3 candidates with a quick completion
  const testCandidates = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-super-vl:free"
  ].filter(id => freeModels.includes(id));

  console.log("\nTesting responsive candidates:", testCandidates);
  for (const model of testCandidates) {
    try {
      const start = Date.now();
      const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Ghost AutoWorker"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say hello in JSON format: {\"greeting\": \"hello\"}" }],
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(8000)
      });
      const elapsed = Date.now() - start;
      if (chatRes.ok) {
        const body: any = await chatRes.json();
        console.log(`✅ Model ${model} OK in ${elapsed}ms:`, JSON.stringify(body.choices?.[0]?.message));
      } else {
        console.log(`❌ Model ${model} HTTP ${chatRes.status} in ${elapsed}ms`);
      }
    } catch (e: any) {
      console.log(`❌ Model ${model} ERROR:`, e.message);
    }
  }
}

main().catch(console.error);
