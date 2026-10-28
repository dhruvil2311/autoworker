const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  
  const devUser = data.users.find(u => u.email === 'dev-user@ghost.local');
  if (devUser) {
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      devUser.id,
      { password: 'password123' }
    );
    if (updateError) {
      console.error(updateError);
    } else {
      console.log('Password updated successfully');
    }
  }
}

check();
