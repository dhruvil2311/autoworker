import { createClient } from '@supabase/supabase-js';
import { validateWorkflowV2, WorkflowV2 } from '@ghost/workflow-schema';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TENANT_ID = '6ef50df4-58bb-48e3-9796-d25ba85d4dac';
const MAGENTO_REAL_ID = '0070431e-3216-4fb2-8494-5f0c05116e87';
const SOURCE_HITL_ID = '7bc16d04-1923-4d71-874c-9cd768ff657c';
const JOB_ID = 'job_1792597521774_0b0u0x';
const VIDEO_FILE_NAME = '1792597519621_desktop_demonstration_1792597518891.webm';

async function compileVideoWorkflow() {
  console.log('=== Step 1: Copy evidence output folder to Magento Real ===');
  const sourceEvidenceOut = path.resolve('apps/api/evidence_output', TENANT_ID, SOURCE_HITL_ID, JOB_ID);
  const targetEvidenceOut = path.resolve('apps/api/evidence_output', TENANT_ID, MAGENTO_REAL_ID, JOB_ID);

  if (fs.existsSync(sourceEvidenceOut)) {
    if (!fs.existsSync(targetEvidenceOut)) {
      fs.mkdirSync(path.dirname(targetEvidenceOut), { recursive: true });
      fs.cpSync(sourceEvidenceOut, targetEvidenceOut, { recursive: true });
      console.log(`Copied evidence frames and analysis from ${sourceEvidenceOut} to ${targetEvidenceOut}`);
    } else {
      console.log(`Target evidence directory already exists: ${targetEvidenceOut}`);
    }
  }

  console.log('\n=== Step 2: Build exact WorkflowV2 from Video Demonstration ===');
  const compiledAt = new Date().toISOString();
  const newWorkflowId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();

  const videoWorkflow: WorkflowV2 = {
    workflow_version: "2.0",
    name: "Magento Real — Video Demonstration Workflow",
    description: "Autonomous Magento Admin Authentication & Navigation compiled directly from recorded video demonstration (1792597519621_desktop_demonstration_1792597518891.webm).",
    status: "ACTIVE",
    expected_domains: [
      "auth.services.adobe.com",
      "ims-na1.adobelogin.com",
      "demo-magento-2.auroracreation.com"
    ],
    variables: [
      {
        name: "email",
        type: "string",
        required: true,
        default_value: "presentationai66@gmail.com"
      }
    ],
    secrets: ["magento_password"],
    compiler: {
      version: "vision-ai-video-engineering-v1",
      source_specification_id: JOB_ID,
      compiled_at: compiledAt,
      source_type: "VIDEO_RECORDING",
      source_media_name: VIDEO_FILE_NAME,
      source_media_id: JOB_ID,
      action_count: 7,
      frame_count: 40,
      compiled_from: `Video Demonstration: ${VIDEO_FILE_NAME}`
    },
    output_contract: {
      output_required: true,
      output_type: "ACTION_CONFIRMATION",
      delivery_destination: "CHAT",
      completion_condition: "Magento Admin authenticated and session established"
    },
    root_step: {
      id: "root_sequence",
      operation: "SEQUENCE",
      target: "DATA",
      description: "Reconstructed sequence from Magento Real Video Demonstration",
      children: [
        {
          id: "step_1_navigate_magento_login",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to Magento Admin Adobe ID Authentication Portal",
          args: {
            url: "https://auth.services.adobe.com/en_US/index.html?callback=https%3A%2F%2Fims-na1.adobelogin.com%2Fims%2Fadobeid%2Fmagento-passport%2FAdobeID%2Fcode%3Fredirect_uri%3Dhttps%253A%252F%252Fdemo-magento-2.auroracreation.com%252Fadmin%252F",
            timeoutMs: 15000,
            provenance: {
              frame_ids: ["frame_000000", "frame_000035", "frame_000070"],
              rationale: "Initial URL observed in video demonstration",
              timestamp: 0.0
            }
          },
          failure_policy: {
            retry_limit: 2,
            on_failure: "FAIL"
          }
        },
        {
          id: "step_2_wait_email_field",
          operation: "WAIT",
          target: "BROWSER_DETERMINISTIC",
          description: "Wait for email/username input field to appear",
          args: {
            selector: "#EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email'], input[name='username']",
            timeoutMs: 10000,
            instruction: "Wait for email input field to be ready",
            provenance: {
              frame_ids: ["frame_000301", "frame_000309"],
              rationale: "Observed email field ready for input",
              timestamp: 10.5
            }
          }
        },
        {
          id: "step_3_enter_email",
          operation: "TYPE",
          target: "BROWSER_DETERMINISTIC",
          description: "Enter user email (presentationai66@gmail.com) into field",
          args: {
            selector: "#EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email'], input[name='username']",
            text: "{{var.email}}",
            value: "presentationai66@gmail.com",
            timeoutMs: 10000,
            provenance: {
              frame_ids: ["frame_000430", "frame_000500", "frame_000570", "frame_000640"],
              rationale: "Demonstrated typing email address",
              timestamp: 14.6
            }
          }
        },
        {
          id: "step_4_click_continue",
          operation: "CLICK",
          target: "BROWSER_DETERMINISTIC",
          description: "Click Continue to proceed to password authentication",
          args: {
            selector: "button[data-id='EmailPage-ContinueButton'], button:has-text('Continue'), .EmailPage-continue-button, button[type='submit']",
            timeoutMs: 10000,
            provenance: {
              frame_ids: ["frame_000761", "frame_000764"],
              rationale: "Demonstrated clicking Continue button",
              timestamp: 26.0
            }
          }
        },
        {
          id: "step_5_hitl_auth_barrier",
          operation: "REQUEST_HUMAN",
          target: "HUMAN",
          description: "Human-in-the-Loop authentication barrier: Enter confidential password / OTP on the login screen without storing credentials",
          args: {
            reason: "AUTHENTICATION_REQUIRED:{\"authType\":\"CREDENTIALS_AND_OTP\",\"url\":\"https://auth.services.adobe.com\",\"fields\":[\"password\",\"otp\"],\"prompt\":\"Please enter password and OTP for Magento Admin (presentationai66@gmail.com)\"}",
            instruction: "Fill in password / OTP on the login screen to complete human authentication barrier",
            provenance: {
              frame_ids: ["frame_000769", "frame_000772", "frame_000777", "frame_000820"],
              rationale: "Password & OTP barrier encountered in video demonstration at 26.2s",
              timestamp: 26.2
            }
          },
          failure_policy: {
            on_failure: "PAUSE_FOR_HUMAN"
          }
        },
        {
          id: "step_6_wait_admin_dashboard",
          operation: "WAIT",
          target: "BROWSER_DETERMINISTIC",
          description: "Wait for successful authentication and Magento Admin dashboard load",
          args: {
            selector: "#admin-content, .page-header, .page-wrapper, .admin__menu, #order_grid, .nav-item",
            timeoutMs: 20000,
            instruction: "Wait for authenticated dashboard to settle",
            provenance: {
              frame_ids: ["frame_000820"],
              rationale: "Post-authentication portal access",
              timestamp: 27.9
            }
          }
        },
        {
          id: "step_7_build_output",
          operation: "BUILD_OUTPUT",
          target: "DATA",
          description: "Synthesize deliverable confirming authenticated session",
          args: {
            contract: {
              output_type: "ACTION_CONFIRMATION",
              output_required: true,
              completion_condition: "Magento Admin authenticated and session established",
              delivery_destination: "CHAT",
              verification_requirements: ["DELIVERABLE_NON_EMPTY"]
            }
          }
        },
        {
          id: "step_8_deliver_output",
          operation: "DELIVER_OUTPUT",
          target: "DATA",
          description: "Deliver session confirmation to supervisor chat",
          args: {
            contract: {
              output_type: "ACTION_CONFIRMATION",
              output_required: true,
              delivery_destination: "CHAT"
            }
          }
        }
      ]
    }
  };

  const validatedWorkflow = validateWorkflowV2(videoWorkflow);
  console.log('Validated workflow successfully:', validatedWorkflow.name);

  console.log('\n=== Step 3: Insert new workflow record in Supabase ===');
  const { data: wfRow, error: wfErr } = await supabase
    .from('workflows')
    .insert({
      id: newWorkflowId,
      tenant_id: TENANT_ID,
      name: validatedWorkflow.name,
      status: 'ACTIVE'
    })
    .select('*')
    .single();

  if (wfErr) throw wfErr;
  console.log(`Created workflow row: ${wfRow.id}`);

  console.log('\n=== Step 4: Insert workflow version record in Supabase ===');
  const { data: verRow, error: verErr } = await supabase
    .from('workflow_versions')
    .insert({
      id: newVersionId,
      tenant_id: TENANT_ID,
      workflow_id: wfRow.id,
      version: 1,
      schema_version: '2.0',
      compiler_version: 'vision-ai-video-engineering-v1',
      compiler_model: 'v2-model',
      definition: validatedWorkflow
    })
    .select('*')
    .single();

  if (verErr) throw verErr;
  console.log(`Created workflow_version row: ${verRow.id}`);

  console.log('\n=== Step 5: Update worker Magento Real with the new video workflow ===');
  const trainingSource = {
    type: "VIDEO_RECORDING",
    name: VIDEO_FILE_NAME,
    jobId: JOB_ID,
    mediaId: JOB_ID,
    frameCount: 40,
    actionCount: 7,
    compiledAt
  };

  const { data: workerRow, error: workerErr } = await supabase
    .from('ghost_workers')
    .update({
      workflow_id: wfRow.id,
      active_version_id: verRow.id,
      description: "Autonomous Magento Specialist — trained on video demonstration (Adobe ID sign-in & authenticated portal access).",
      status: "ACTIVE",
      trigger_config: {
        workerType: "WEB_BROWSER",
        trainingSource
      },
      updated_at: compiledAt
    })
    .eq('id', MAGENTO_REAL_ID)
    .select('*')
    .single();

  if (workerErr) throw workerErr;
  console.log(`Successfully updated Magento Real:`);
  console.log(`  Worker ID: ${workerRow.id}`);
  console.log(`  Workflow ID: ${workerRow.workflow_id}`);
  console.log(`  Active Version ID: ${workerRow.active_version_id}`);
  console.log(`  Description: ${workerRow.description}`);

  console.log('\n=== ALL DONE! Video workflow compiled and stored for Magento Real ===');
}

compileVideoWorkflow().catch(console.error);
