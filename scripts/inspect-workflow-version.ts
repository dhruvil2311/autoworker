import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await sb
    .from('workflow_versions')
    .select('*')
    .eq('id', 'e1ef2310-ae76-490c-9cfb-6714b6226a4f')
    .single();

  if (error) {
    console.error('Error fetching version:', error);
    return;
  }

  const steps = data.definition?.root_step?.children || [];
  console.log(`Found ${steps.length} steps in root_step.children:`);
  for (const s of steps) {
    console.log(`- [${s.id}] op=${s.operation} target=${s.target}`);
    console.log(`    desc: ${s.description}`);
    console.log(`    args:`, JSON.stringify(s.args));
  }
}

main().catch(console.error);
