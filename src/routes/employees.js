// src/routes/employees.js
import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ── GET /employees ────────────────────────────────────────
router.get('/', async (req, res) => {
  const { data: profiles, error: profileErr } = await supabase
    .from('admin_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profileErr) {
    console.error('GET /employees — profiles fetch error:', profileErr.message);
    return res.status(500).json({ message: 'Failed to fetch employees' });
  }

  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('GET /employees — auth.listUsers error:', authErr.message);
    return res.status(500).json({ message: 'Failed to fetch user auth data' });
  }

  const emailMap = Object.fromEntries(users.map(u => [u.id, u.email]));
  const employees = profiles.map(p => ({ ...p, email: emailMap[p.id] || '' }));

  res.json({ employees });
});

// ── POST /employees ───────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ message: 'name, email, and password are required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ message: 'Please enter a valid email address' });

  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });

  // Step 1 — Create user in Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email:         email.toLowerCase().trim(),
    password,
    email_confirm: true,
  });

  if (authErr) {
    console.error('POST /employees — createUser error:', authErr.message);
    // Return a clean message for duplicate email
    if (authErr.message.toLowerCase().includes('already')) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    return res.status(400).json({ message: authErr.message });
  }

  // Step 2 — Insert into admin_profiles
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
    console.error('POST /employees — profile insert error:', profileErr.message);
    // Rollback: delete auth user if profile creation failed
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ message: 'Failed to create employee profile. Please try again.' });
  }

  res.status(201).json({
    message:  'Employee created successfully',
    employee: { ...profile, email: authData.user.email },
  });
});

// ── PATCH /employees/:id ──────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (!id)
    return res.status(400).json({ message: 'Employee ID is required' });

  if (id === req.admin.id)
    return res.status(400).json({ message: 'You cannot deactivate your own account' });

  if (typeof is_active !== 'boolean')
    return res.status(400).json({ message: 'is_active must be a boolean value' });

  const { data, error } = await supabase
    .from('admin_profiles')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /employees/:id error:', error.message);
    if (error.code === 'PGRST116')
      return res.status(404).json({ message: 'Employee not found' });
    return res.status(500).json({ message: 'Failed to update employee status' });
  }

  res.json({
    message:  `Employee ${is_active ? 'activated' : 'deactivated'} successfully`,
    employee: data,
  });
});

export default router;