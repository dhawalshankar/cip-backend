// src/routes/auth.js
import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── POST /auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ message: 'Please enter a valid email address' });

  // Step 1 — Verify credentials with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email:    email.toLowerCase().trim(),
    password,
  });

  if (authError || !authData?.user) {
    console.error('POST /auth/login — auth error:', authError?.message);
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Step 2 — Fetch role and active status from admin_profiles
  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error('POST /auth/login — profile fetch error:', profileError?.message);
    return res.status(401).json({ message: 'Admin profile not found' });
  }

  if (!profile.is_active)
    return res.status(403).json({ message: 'Your account has been deactivated. Please contact an administrator.' });

  // Step 3 — Sign custom JWT
  const token = signToken({
    id:    authData.user.id,
    email: authData.user.email,
    name:  profile.name,
    role:  profile.role,
  });

  res.json({
    message: 'Login successful',
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

// ── GET /auth/me ──────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: profile, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', req.admin.id)
    .single();

  if (error || !profile) {
    console.error('GET /auth/me — profile fetch error:', error?.message);
    return res.status(404).json({ message: 'User not found' });
  }

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