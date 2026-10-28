import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const workerId = '414a1924-5c2d-4af1-a494-ad297d295b74';
  
  // 1. Worker record
  const { data: worker } = await supabase.from('ghost_workers').select('*').eq('id', workerId).single();
  console.log('Worker:', worker);

  // 2. Documents
  const { data: docs } = await supabase.from('worker_documents').select('*').eq('worker_id', workerId);
  console.log('--- DOCUMENTS FOR WORKER ---');
  console.log(docs);

  // Also check documents across any worker with magneto in name
  const { data: allWorkers } = await supabase.from('ghost_workers').select('id, name').ilike('name', '%magneto%');
  console.log('All magneto workers:', allWorkers);
  for (const w of allWorkers || []) {
    const { data: wDocs } = await supabase.from('worker_documents').select('*').eq('worker_id', w.id);
    if (wDocs && wDocs.length > 0) {
      console.log(`Docs for ${w.name} (${w.id}):`, wDocs);
    }
  }

  // 3. Workflow Version
  const { data: wv } = await supabase.from('workflow_versions').select('*').eq('id', worker.active_version_id).single();
  console.log('--- WORKFLOW DEFINITION ---');
  console.log('Workflow ID:', wv?.id);
  console.log('Name:', wv?.definition?.name);
  console.log('Expected domains:', wv?.definition?.expected_domains);
  const steps = wv?.definition?.root_step?.children || wv?.definition?.steps || [];
  console.log('Steps count:', steps.length);
  steps.forEach((s: any, idx: number) => {
    console.log(`Step ${idx}: id=${s.id}, op=${s.operation}, target=${s.target}, desc=${s.description}, args=${JSON.stringify(s.args)}`);
  });

  // 4. Execution runs for this worker
  const { data: runs } = await supabase.from('execution_runs').select('*').eq('worker_id', workerId).order('created_at', { ascending: false }).limit(5);
  console.log('--- RECENT RUNS ---');
  for (const r of runs || []) {
    console.log('Run:', r.id, 'State:', r.state, 'Created:', r.created_at);
    const { data: execSteps } = await supabase.from('execution_steps').select('*').eq('run_id', r.id).order('started_at', { ascending: true });
    console.log('  Executed steps count:', execSteps?.length);
    execSteps?.forEach((es: any) => {
      console.log('   ', es.step_id, '->', es.state, 'msg:', es.metadata?.message || '', 'outputs:', JSON.stringify(es.metadata?.outputs || {}));
    });
  }
}

check().catch(console.error);
