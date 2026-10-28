import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function seedDevUser() {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    console.log('Skipping development user seed in production environment.');
    process.exit(0);
  }

  const isDevAuthEnabled = process.env.DEV_AUTH_ENABLED === 'true' || process.env.ALLOW_DEV_AUTH === 'true';
  if (!isDevAuthEnabled) {
    console.log('Development auth is disabled. Skipping user seed.');
    process.exit(0);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot seed dev user.');
    process.exit(1);
  }

  const email = process.env.DEV_ADMIN_EMAIL || 'admin@ghost.local';
  const password = process.env.DEV_ADMIN_PASSWORD || 'Ghost@123456';
  // Attempt to pass the fixed ID so tests or mock data that rely on it continue to work, if supported by the admin API.
  const devUserId = process.env.DEV_AUTH_USER_ID || '00000000-0000-0000-0000-000000000002';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error fetching users:', listError.message);
      process.exit(1);
    }

    const existingUser = usersData.users.find(u => u.email === email);

    if (existingUser) {
      console.log(`✓ Development user already exists (${email})`);
      process.exit(0);
    }

    // Workaround: createUser typing does not expose `id`, but the REST API does support it
    // if the user is being inserted as a UUID. We will cast it to any to pass the ID.
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      id: devUserId,
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'owner' }
    } as any);

    if (createError) {
      if (createError.message.includes('already exists')) {
         console.log(`✓ Development user already exists (${email})`);
         process.exit(0);
      }
      console.error('Failed to create development user:', createError.message);
      process.exit(1);
    }

    console.log(`✓ Development user created (${email})`);
    
    // Check organization membership
    const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", createData.user.id)
        .limit(1)
        .maybeSingle();
        
    // If we want to guarantee the user has a tenant right away, we could bootstrap them here.
    // However, the existing API handles bootstrap seamlessly via /api/v1/auth/bootstrap
    // when the dashboard starts up, so creating the user in Supabase Auth is sufficient!

  } catch (error) {
    console.error('Unexpected error while seeding dev user:', error);
    process.exit(1);
  }
}

seedDevUser();
