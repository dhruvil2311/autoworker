import dotenv from "dotenv";
dotenv.config();

async function testModel(model: string) {
  const start = Date.now();
  console.log(`Testing model ${model}...`);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Extract steps from: 1. Go to amazon.com 2. Search for mouse. Respond in strict JSON: {\"steps\": [\"Go to amazon.com\", \"Search for mouse\"]}" }],
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    console.log(`[${model}] Status:`, res.status, "Data:", JSON.stringify(data).slice(0, 200));
  } catch (err: any) {
    console.error(`[${model}] Error in ${Date.now() - start}ms:`, err.message);
  }
}

async function main() {
  await testModel("google/gemma-3-27b-it:free");
  await testModel("meta-llama/llama-3.3-70b-instruct:free");
  await testModel("mistralai/mistral-small-24b-instruct-2501:free");
  await testModel("nvidia/nemotron-3.5-super-vl:free");
  await testModel("dots-studio/dots-3-note-preview:free");
}

main();
