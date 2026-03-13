import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email aur password required hai' });

  // Step 1: Supabase Auth se verify karo
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (authError || !authData.user)
    return res.status(401).json({ message: 'Email ya password galat hai' });

  // Step 2: admin_profiles se role aur is_active check karo
  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile)
    return res.status(401).json({ message: 'Admin profile nahi mila' });

  if (!profile.is_active)
    return res.status(403).json({ message: 'Aapka account deactivate hai' });

  // Step 3: Apna JWT banao
  const token = signToken({
    id:    authData.user.id,
    email: authData.user.email,
    name:  profile.name,
    role:  profile.role,
  });

  res.json({
    token,
    user: {
      id:         authData.user.id,
      email:      authData.user.email,
      name:       profile.name,
      role:       profile.role,
      is_active:  profile.is_active,
      created_at: profile.created_at,
    },
  });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { data: profile, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', req.admin.id)
    .single();

  if (error || !profile)
    return res.status(404).json({ message: 'User nahi mila' });

  res.json({
    user: {
      id:         req.admin.id,
      email:      req.admin.email,
      name:       profile.name,
      role:       profile.role,
      is_active:  profile.is_active,
      created_at: profile.created_at,
    },
  });
});

export default router;