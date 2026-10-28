import fs from 'fs';
import path from 'path';

// Naive dotenv for this environment
function loadEnv() {
  try {
    let currentDir = process.cwd();
    while (currentDir !== path.parse(currentDir).root) {
      const envPath = path.join(currentDir, '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
          const [key, ...val] = line.split('=');
          if (key && val.length > 0) {
            process.env[key.trim()] = val.join('=').trim();
          }
        });
        return;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch (e) { }
}

loadEnv();

export async function extractStructuredData<T>(
  prompt: string,
  schemaDescription: string
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.GEMINI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  // Use a capable reasoning model for strict JSON
  let model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (model.includes('nemotron')) {
    model = 'gemini-2.5-flash';
  }

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const systemPrompt = `You are an expert Chief AI Scientist and precise data extractor. 
You must output ONLY valid JSON that perfectly adheres to the requested schema.
Do NOT wrap the output in markdown code blocks like \`\`\`json.
Do NOT include any extra text.

Requested JSON Schema:
${schemaDescription}
`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM returned empty response");
  }

  try {
    // Strip markdown code blocks if the model ignored instructions
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      lines.shift(); // remove ```json
      if (lines[lines.length - 1].startsWith('```')) {
        lines.pop(); // remove ```
      }
      cleaned = lines.join('\n');
    }
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(`Failed to parse LLM output as JSON: ${content}`);
  }
}
