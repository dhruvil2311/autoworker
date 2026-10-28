import dotenv from 'dotenv';
dotenv.config();

const visionCandidates = [
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free'
];

const sample1x1Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function testVision(model: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Output valid JSON: {"status": "ok"}' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${sample1x1Png}` } }
          ]
        }
      ]
    })
  });
  const data = await res.json();
  console.log(model, 'status:', res.status, 'resp:', data.choices?.[0]?.message?.content?.slice(0, 100) || data.error?.message);
}

async function main() {
  for (const m of visionCandidates) {
    try {
      await testVision(m);
    } catch (e: any) {
      console.error(m, e.message);
    }
  }
}

main().catch(console.error);
