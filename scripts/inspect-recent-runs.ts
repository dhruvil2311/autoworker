import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkRecentRuns() {
  const { data: runs, error } = await supabase
    .from('execution_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching runs:', error);
    return;
  }

  console.log(`Found ${runs?.length || 0} recent execution runs:`);
  for (const r of runs || []) {
    console.log(`\n======================================================`);
    console.log(`Run ID: ${r.id} | Worker ID: ${r.worker_id} | State: ${r.state} | Created: ${r.created_at}`);
    console.log(`Workflow ID: ${r.workflow_id} | Version ID: ${r.workflow_version_id}`);
    console.log(`Metadata:`, JSON.stringify(r.metadata));
    console.log(`Result Summary:`, JSON.stringify(r.result_summary));

    const { data: steps } = await supabase
      .from('execution_steps')
      .select('*')
      .eq('run_id', r.id)
      .order('started_at', { ascending: true });
    
    console.log(`  Steps executed (${steps?.length || 0}):`);
    for (const s of steps || []) {
      console.log(`    - Step ${s.step_id} [${s.state}] started: ${s.started_at}, completed: ${s.completed_at}`);
      console.log(`      args/meta:`, JSON.stringify(s.metadata));
      if (s.error) console.log(`      error:`, s.error);
    }

    const { data: hitls } = await supabase
      .from('hitl_requests')
      .select('*')
      .eq('run_id', r.id)
      .order('created_at', { ascending: true });

    console.log(`  HITL requests (${hitls?.length || 0}):`);
    for (const h of hitls || []) {
      console.log(`    - HITL ID: ${h.id} [${h.state}] Reason: ${h.reason}`);
      console.log(`      Resolution:`, JSON.stringify(h.resolution));
      console.log(`      Created: ${h.created_at}, Resolved: ${h.resolved_at}`);
    }
  }
}

checkRecentRuns().catch(console.error);
