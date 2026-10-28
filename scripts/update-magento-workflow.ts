import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const versionId = 'e1ef2310-ae76-490c-9cfb-6714b6226a4f';
  const { data, error } = await sb
    .from('workflow_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error || !data) {
    console.error('Error fetching version:', error);
    return;
  }

  const def = data.definition;
  const steps = def?.root_step?.children || [];

  for (const s of steps) {
    if (s.id === 'step_1_navigate_magento_login') {
      s.args = {
        ...s.args,
        url: '{{url}}',
        default_url: 'https://demo-magento-2.auroracreation.com/admin_panel/',
        description: 'Navigate to Magento Admin portal'
      };
    }
    if (s.id === 'step_2_wait_email_field') {
      s.args.selector = "#username, input[name='login[username]'], #EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email'], input[name='username']";
    }
    if (s.id === 'step_3_enter_email') {
      s.args.selector = "#username, input[name='login[username]'], #EmailPage-EmailField, input[name='EmailPage-EmailField'], input[type='email'], input[name='username']";
    }
    if (s.id === 'step_4_click_continue') {
      s.args.selector = "button.action-login, button.action-signin, button[data-id='EmailPage-ContinueButton'], button:has-text('Sign in'), button:has-text('Continue'), .EmailPage-continue-button, button[type='submit']";
    }
  }

  // Ensure variables has url variable with default
  if (!def.variables) def.variables = [];
  if (!def.variables.some((v: any) => v.name === 'url')) {
    def.variables.push({
      name: 'url',
      type: 'string',
      required: false,
      default_value: 'https://demo-magento-2.auroracreation.com/admin_panel/'
    });
  }

  const { error: updateError } = await sb
    .from('workflow_versions')
    .update({ definition: def })
    .eq('id', versionId);

  if (updateError) {
    console.error('Error updating workflow version:', updateError);
  } else {
    console.log('Successfully updated Magento Real workflow version', versionId);
  }
}

main().catch(console.error);
