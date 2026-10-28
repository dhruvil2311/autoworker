import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function runMagentoWorker() {
  const workerId = '414a1924-5c2d-4af1-a494-ad297d295b74';
  const { data: worker, error: wErr } = await supabase.from('ghost_workers').select('*').eq('id', workerId).single();
  if (wErr || !worker) {
    console.error('Worker not found:', wErr);
    return;
  }
  console.log('Worker:', worker.name, 'Active Version:', worker.active_version_id);

  // 1. Create a new execution run in Supabase
  const authUserId = '00000000-0000-0000-0000-000000000002';
  const tenantId = worker.tenant_id;
  const { data: run, error: rErr } = await supabase.from('execution_runs').insert({
    tenant_id: tenantId,
    workflow_version_id: worker.active_version_id,
    state: 'QUEUED',
    worker_id: worker.id,
    run_mode: 'PRODUCTION',
    created_by: authUserId
  }).select().single();

  if (rErr || !run) {
    console.error('Error creating run:', rErr);
    return;
  }
  console.log('Created Run ID:', run.id);

  // 2. Trigger worker daemon
  try {
    const triggerRes = await fetch(`http://127.0.0.1:4005/trigger/${run.id}`, { method: 'POST' });
    console.log('Triggered worker daemon:', triggerRes.status);
  } catch (err) {
    console.log('Trigger fetch failed (will rely on polling loop):', err);
  }

  // 3. Monitor run until terminal state
  console.log('Waiting for run to execute...');
  let lastStepCount = 0;
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const { data: currentRun } = await supabase.from('execution_runs').select('state').eq('id', run.id).single();
    const { data: steps } = await supabase.from('execution_steps').select('step_id, state, metadata, started_at').eq('run_id', run.id).order('started_at', { ascending: true });

    if (steps && steps.length !== lastStepCount) {
      const newSteps = steps.slice(lastStepCount);
      for (const ns of newSteps) {
        const hasScreenshot = !!ns.metadata?.outputs?.screenshotUrl;
        const msg = ns.metadata?.message || '';
        console.log(`[Step Update] ${ns.step_id} -> ${ns.state} (hasScreenshot: ${hasScreenshot}) ${msg}`);
      }
      lastStepCount = steps.length;
    }

    if (currentRun?.state === 'SUCCEEDED' || currentRun?.state === 'FAILED' || currentRun?.state === 'WAITING_FOR_HUMAN') {
      console.log(`Run reached terminal state: ${currentRun.state}`);
      break;
    }
  }

  // 4. Summarize results and screenshots
  const { data: finalSteps } = await supabase.from('execution_steps').select('step_id, state, metadata').eq('run_id', run.id).order('started_at', { ascending: true });
  console.log(`\n=== EXECUTION SUMMARY for Run ${run.id} ===`);
  finalSteps?.forEach((s, idx) => {
    const shotUrl = s.metadata?.outputs?.screenshotUrl;
    const shotLen = typeof shotUrl === 'string' ? shotUrl.length : 0;
    console.log(`${idx + 1}. [${s.step_id}] -> ${s.state} (Screenshot bytes: ${shotLen})`);
  });
}

runMagentoWorker().catch(console.error);
