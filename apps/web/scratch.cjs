const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) console.error(error);
  else {
    console.log("Users:");
    data.users.forEach(u => console.log("- " + u.email));
  }
}

check();
