import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const workerId = '7bc16d04-1923-4d71-874c-9cd768ff657c';
  
  // 1. Worker record
  const { data: worker } = await supabase.from('ghost_workers').select('*').eq('id', workerId).single();
  console.log('Worker:', worker);

  // 2. Documents
  const { data: docs } = await supabase.from('worker_documents').select('*').eq('worker_id', workerId);
  console.log('--- DOCUMENTS FOR WORKER ---');
  for (const d of docs || []) {
    console.log(`Doc ID: ${d.id}, Name: ${d.name}, Type: ${d.type}`);
  }

  // 3. Execution runs for this worker
  const { data: runs } = await supabase.from('execution_runs').select('*').eq('worker_id', workerId).order('created_at', { ascending: false }).limit(5);
  console.log('\n--- RECENT RUNS ---');
  for (const r of runs || []) {
    console.log(`\nRun ID: ${r.id} | State: ${r.state} | Created: ${r.created_at} | Updated: ${r.updated_at}`);
    console.log('Metadata:', JSON.stringify(r.metadata));

    const { data: hitls } = await supabase.from('hitl_requests').select('*').eq('run_id', r.id);
    console.log('  HITL Requests count:', hitls?.length);
    for (const h of hitls || []) {
      console.log(`    HITL ${h.id}: State=${h.state}, Reason=${h.reason}, Created=${h.created_at}, Resolved=${h.resolved_at}`);
    }

    const { data: execSteps } = await supabase.from('execution_steps').select('*').eq('run_id', r.id).order('started_at', { ascending: true });
    console.log('  Executed steps count:', execSteps?.length);
    execSteps?.forEach((es: any) => {
      console.log(`    Step: ${es.step_id} | State: ${es.state} | Msg: ${es.metadata?.message || ''}`);
    });
  }
}

check().catch(console.error);
