import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inspect() {
  const { data: wv } = await supabase
    .from('workflow_versions')
    .select('id, workflow_id, version, definition')
    .eq('id', 'e1ef2310-ae76-490c-9cfb-6714b6226a4f')
    .single();

  console.log('Definition root_step children:');
  const children = wv?.definition?.root_step?.children || [];
  for (const c of children) {
    console.log(`- Step ${c.id} [${c.operation}]: ${c.description}`);
    console.log('  Args:', JSON.stringify(c.args));
  }

  const { data: runs, error } = await supabase
    .from('execution_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nRecent runs (all workers):', error || '');
  console.log(JSON.stringify(runs, null, 2));

  if (runs && runs.length > 0) {
    const latestRunId = runs[0].id;
    const { data: steps } = await supabase
      .from('execution_steps')
      .select('id, step_id, state, started_at, completed_at, error, metadata')
      .eq('run_id', latestRunId)
      .order('started_at', { ascending: true });

    console.log(`\nSteps for latest run (${latestRunId}):`);
    for (const s of steps || []) {
      console.log(`- ${s.step_id} [${s.state}]: err=${s.error}`);
      console.log('  metadata:', JSON.stringify(s.metadata));
    }

    const { data: hitl } = await supabase
      .from('hitl_requests')
      .select('*')
      .eq('run_id', latestRunId)
      .order('created_at', { ascending: false });

    console.log(`\nHITL requests for latest run (${latestRunId}):`);
    console.log(JSON.stringify(hitl, null, 2));
  }
}

inspect().catch(console.error);
