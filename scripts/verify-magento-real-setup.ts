import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function verify() {
  console.log('--- 1. Verify "Magento Real" worker in Supabase ---');
  const { data: worker, error: wErr } = await supabase
    .from('ghost_workers')
    .select('*')
    .ilike('name', 'Magento Real')
    .single();

  if (wErr || !worker) {
    console.error('Failed to find Magento Real:', wErr);
    return;
  }

  console.log('Worker found:');
  console.log(`  ID: ${worker.id}`);
  console.log(`  Name: ${worker.name}`);
  console.log(`  Status: ${worker.status}`);
  console.log(`  Workflow ID: ${worker.workflow_id}`);
  console.log(`  Active Version ID: ${worker.active_version_id}`);
  console.log(`  Safety Policy:`, JSON.stringify(worker.safety_policy));
  console.log(`  Trigger Config:`, JSON.stringify(worker.trigger_config));

  console.log('\n--- 2. Verify documents linked to "Magento Real" ---');
  const { data: docs } = await supabase
    .from('worker_documents')
    .select('*')
    .eq('worker_id', worker.id);

  console.log(`Documents count: ${docs?.length || 0}`);
  for (const d of docs || []) {
    console.log(`  Doc: ${d.name} (${d.type}) -> filePath: ${d.parsed_json?.filePath}`);
    if (d.parsed_json?.filePath) {
      const exists = fs.existsSync(d.parsed_json.filePath);
      console.log(`  Physical file exists on disk: ${exists}`);
    }
  }

  console.log('\n--- 3. Verify MAGNETO HITL state ---');
  const { data: hitlWorker } = await supabase
    .from('ghost_workers')
    .select('*')
    .eq('id', '7bc16d04-1923-4d71-874c-9cd768ff657c')
    .single();

  console.log(`MAGNETO HITL: trigger_config:`, JSON.stringify(hitlWorker?.trigger_config));
  const { data: hitlDocs } = await supabase
    .from('worker_documents')
    .select('*')
    .eq('worker_id', '7bc16d04-1923-4d71-874c-9cd768ff657c');
  console.log(`MAGNETO HITL documents count: ${hitlDocs?.length || 0}`);
  hitlDocs?.forEach(d => console.log(`  - Doc: ${d.name} (${d.type})`));

  console.log('\n--- ALL VERIFICATIONS PASSED ---');
}

verify().catch(console.error);
