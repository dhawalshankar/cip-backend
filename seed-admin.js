// Pehla admin user banana ke liye — sirf ek baar chalao
// 
// Pehle .env mein SUPABASE_URL aur SUPABASE_SERVICE_KEY fill karo
// Phir: node seed-admin.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Yahan apni details daalo ──────────────────────────────
const ADMIN = {
  name:     'Admin',                          // ← apna naam
  email:    'admin@cosmoindiaprakashan.in',   // ← apna email
  password: 'ChangeMe@123',                  // ← strong password
};
// ─────────────────────────────────────────────────────────

console.log('Admin user bana raha hun...');

// Step 1: Supabase Auth mein user banao
const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
  email:         ADMIN.email.toLowerCase(),
  password:      ADMIN.password,
  email_confirm: true,
});

if (authErr) {
  console.error('❌ Auth error:', authErr.message);
  process.exit(1);
}

console.log('✅ Auth user bana:', authData.user.id);

// Step 2: admin_profiles mein insert karo
const { error: profileErr } = await supabase
  .from('admin_profiles')
  .insert({
    id:        authData.user.id,
    name:      ADMIN.name,
    role:      'admin',
    is_active: true,
  });

if (profileErr) {
  console.error('❌ Profile error:', profileErr.message);
  // Auth user cleanup
  await supabase.auth.admin.deleteUser(authData.user.id);
  process.exit(1);
}

console.log('\n✅ Admin successfully bana gaya!');
console.log('─────────────────────────────');
console.log(`   Email:    ${ADMIN.email}`);
console.log(`   Password: ${ADMIN.password}`);
console.log('─────────────────────────────');
console.log('⚠️  Pehle login ke baad password zaroor badal lena!\n');