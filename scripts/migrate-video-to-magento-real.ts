import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SOURCE_WORKER_ID = '7bc16d04-1923-4d71-874c-9cd768ff657c'; // MAGNETO HITL
const TENANT_ID = '6ef50df4-58bb-48e3-9796-d25ba85d4dac';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const VIDEO_DOC_ID = '87a1a8fc-fb3a-42a6-9b41-c00fb1f1a784';

async function migrate() {
  console.log('--- Step 1: Check or create worker "Magento Real" ---');
  
  // Check if "Magento Real" already exists
  const { data: existingWorkers } = await supabase
    .from('ghost_workers')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .ilike('name', 'Magento Real');

  let targetWorker: any = existingWorkers && existingWorkers.length > 0 ? existingWorkers[0] : null;

  // Retrieve source worker details
  const { data: sourceWorker } = await supabase
    .from('ghost_workers')
    .select('*')
    .eq('id', SOURCE_WORKER_ID)
    .single();

  if (!sourceWorker) {
    throw new Error(`Source worker MAGNETO HITL (${SOURCE_WORKER_ID}) not found!`);
  }

  const trainingSource = sourceWorker.trigger_config?.trainingSource || {
    name: "1792597519621_desktop_demonstration_1792597518891.webm",
    type: "VIDEO_RECORDING",
    jobId: "job_1792597521774_0b0u0x",
    mediaId: "job_1792597521774_0b0u0x",
    compiledAt: "2026-10-21T15:49:25.505Z",
    frameCount: 40,
    actionCount: 5
  };

  const targetTriggerConfig = {
    workerType: 'WEB_BROWSER',
    trainingSource
  };

  const targetSafetyPolicy = {
    workerType: 'WEB_BROWSER',
    department: 'Operations',
    capabilities: ['browser', 'desktop', 'human', 'api']
  };

  if (!targetWorker) {
    console.log('Creating new worker "Magento Real"...');
    const { data: newWorker, error: createErr } = await supabase
      .from('ghost_workers')
      .insert({
        tenant_id: TENANT_ID,
        name: 'Magento Real',
        description: 'Autonomous Magento Operations Specialist — handles admin navigation, order verification, and e-commerce workflows.',
        status: 'ACTIVE',
        workflow_id: sourceWorker.workflow_id,
        active_version_id: sourceWorker.active_version_id,
        safety_policy: targetSafetyPolicy,
        trigger_config: targetTriggerConfig,
        created_by: USER_ID
      })
      .select('*')
      .single();

    if (createErr) throw createErr;
    targetWorker = newWorker;
    console.log(`Created worker "Magento Real" with ID: ${targetWorker.id}`);
  } else {
    console.log(`Found existing worker "Magento Real" with ID: ${targetWorker.id}. Updating...`);
    const { data: updatedWorker, error: updateErr } = await supabase
      .from('ghost_workers')
      .update({
        status: 'ACTIVE',
        workflow_id: sourceWorker.workflow_id,
        active_version_id: sourceWorker.active_version_id,
        safety_policy: targetSafetyPolicy,
        trigger_config: targetTriggerConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetWorker.id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;
    targetWorker = updatedWorker;
  }

  console.log('\n--- Step 2: Move physical video file ---');
  const sourceEvidenceDir = path.resolve(
    process.cwd(),
    'apps',
    'api',
    'evidence_storage',
    TENANT_ID,
    SOURCE_WORKER_ID
  );
  const targetEvidenceDir = path.resolve(
    process.cwd(),
    'apps',
    'api',
    'evidence_storage',
    TENANT_ID,
    targetWorker.id
  );

  if (!fs.existsSync(targetEvidenceDir)) {
    fs.mkdirSync(targetEvidenceDir, { recursive: true });
    console.log(`Created target evidence directory: ${targetEvidenceDir}`);
  }

  const fileName = '1792597519621_desktop_demonstration_1792597518891.webm';
  const sourceFilePath = path.join(sourceEvidenceDir, fileName);
  const targetFilePath = path.join(targetEvidenceDir, fileName);

  if (fs.existsSync(sourceFilePath)) {
    fs.copyFileSync(sourceFilePath, targetFilePath);
    console.log(`Copied video file to: ${targetFilePath}`);
    // If needed we can remove or keep source as backup. Let's remove source file to truly move it as requested
    fs.unlinkSync(sourceFilePath);
    console.log(`Removed source video file from MAGNETO HITL folder.`);
  } else if (fs.existsSync(targetFilePath)) {
    console.log(`Video file already exists in target directory: ${targetFilePath}`);
  } else {
    console.warn(`Warning: source file not found at ${sourceFilePath}`);
  }

  console.log('\n--- Step 3: Move worker_documents record to "Magento Real" ---');
  const { data: docData, error: docErr } = await supabase
    .from('worker_documents')
    .update({
      worker_id: targetWorker.id,
      parsed_json: {
        fileName,
        filePath: targetFilePath,
        uploadedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', VIDEO_DOC_ID)
    .select('*')
    .single();

  if (docErr) {
    console.error('Failed to move worker_document:', docErr);
  } else {
    console.log(`Successfully moved video document to worker ${docData.worker_id}:`, docData.id);
  }

  console.log('\n--- Step 4: Update source worker MAGNETO HITL trigger_config ---');
  const updatedSourceConfig = { ...sourceWorker.trigger_config };
  delete updatedSourceConfig.trainingSource;
  await supabase
    .from('ghost_workers')
    .update({
      trigger_config: updatedSourceConfig,
      updated_at: new Date().toISOString()
    })
    .eq('id', SOURCE_WORKER_ID);

  console.log(`Removed trainingSource from MAGNETO HITL.`);

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log(`Worker "Magento Real" ID: ${targetWorker.id}`);
  console.log(`Status: ${targetWorker.status}`);
  console.log(`Workflow ID: ${targetWorker.workflow_id}`);
  console.log(`Active Version ID: ${targetWorker.active_version_id}`);
}

migrate().catch(console.error);
