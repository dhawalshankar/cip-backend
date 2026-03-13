import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /employees — sab employees
router.get('/', async (req, res) => {
  // admin_profiles fetch karo
  const { data: profiles, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ message: error.message });

  // auth.users se emails lo
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) return res.status(500).json({ message: authErr.message });

  // email merge karo profile ke saath
  const emailMap = Object.fromEntries(users.map(u => [u.id, u.email]));
  const employees = profiles.map(p => ({ ...p, email: emailMap[p.id] || '' }));

  res.json({ employees });
});

// POST /employees — naya employee banao
router.post('/', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: 'name, email, password required hai' });

  if (password.length < 8)
    return res.status(400).json({ message: 'Password kam se kam 8 characters ka hona chahiye' });

  // Step 1: Supabase Auth mein user banao
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email:         email.toLowerCase().trim(),
    password,
    email_confirm: true,
  });

  if (authErr) return res.status(400).json({ message: authErr.message });

  // Step 2: admin_profiles mein insert karo
  const { data: profile, error: profileErr } = await supabase
    .from('admin_profiles')
    .insert({
      id:         authData.user.id,
      name:       name.trim(),
      role:       'employee',
      is_active:  true,
      created_by: req.admin.email,
    })
    .select()
    .single();

  if (profileErr) {
    // Profile fail hua toh auth user bhi hata do
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ message: profileErr.message });
  }

  res.status(201).json({
    employee: { ...profile, email: authData.user.email },
  });
});

// PATCH /employees/:id — activate / deactivate
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (id === req.admin.id)
    return res.status(400).json({ message: 'Khud ko deactivate nahi kar sakte' });

  const { data, error } = await supabase
    .from('admin_profiles')
    .update({ is_active: Boolean(is_active) })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });
  res.json({ employee: data });
});

export default router;