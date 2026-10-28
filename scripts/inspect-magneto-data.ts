import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: worker } = await supabase.from('ghost_workers').select('*').eq('id', '7bc16d04-1923-4d71-874c-9cd768ff657c').single();
  console.log('Worker:', JSON.stringify(worker, null, 2));

  const { data: docs } = await supabase.from('worker_documents').select('*').eq('worker_id', worker.id);
  console.log('Worker docs count:', docs?.length);
  for (const d of docs || []) {
    console.log(`Doc ID: ${d.id}, name: ${d.name}, type: ${d.type}`);
    console.log(JSON.stringify(d, null, 2));
  }

  // Also check all workers with 'magento' or 'magneto' in name
  const { data: allMagento } = await supabase.from('ghost_workers').select('id, name, status, recording_id, workflow_id, active_version_id').ilike('name', '%mag%');
  console.log('All matching workers:', allMagento);
}

run().catch(console.error);
