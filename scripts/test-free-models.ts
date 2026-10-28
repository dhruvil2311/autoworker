import dotenv from 'dotenv';
dotenv.config();

const candidates = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openrouter/free'
];

async function testCandidate(model: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Output valid JSON: {"status": "ok"}' }],
      response_format: { type: 'json_object' }
    })
  });
  const data = await res.json();
  console.log(model, 'status:', res.status, 'resp:', data.choices?.[0]?.message?.content || data.error?.message);
}

async function main() {
  for (const m of candidates) {
    try {
      await testCandidate(m);
    } catch (e: any) {
      console.error(m, e.message);
    }
  }
}

main().catch(console.error);
