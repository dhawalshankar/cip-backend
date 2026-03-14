// src/routes/profile.js
// Profile self-service route — every logged-in user (admin or employee)
// can read their own profile and update their email, password, or display name.

import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All profile routes require a valid JWT
router.use(authenticate);

// ── GET /profile/me ────────────────────────────────────────────────────────
// Returns the current user's profile from admin_profiles
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, name, role, is_active, created_at')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(404).json({ message: 'Profile nahi mila' });

  // Merge email from Supabase Auth user object (already in req.user via middleware)
  res.json({ ...data, email: req.user.email });
});

// ── PATCH /profile/me/display-name ────────────────────────────────────────
// Updates the name field in admin_profiles
router.patch('/me/display-name', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Name required hai' });
  }

  const { error } = await supabase
    .from('admin_profiles')
    .update({ name: name.trim() })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ message: 'Update nahi hua', detail: error.message });

  // Log the action
  await supabase.from('activity_logs').insert({
    user_id:    req.user.id,
    action:     'PROFILE_NAME_UPDATE',
    details:    `Display name updated`,
  }).then(() => {}); // fire-and-forget

  res.json({ message: 'Naam update ho gaya ✅' });
});

// ── PATCH /profile/me/email ────────────────────────────────────────────────
// Changes the user's email in Supabase Auth.
// Requires the current password for verification before making the change.
router.patch('/me/email', async (req, res) => {
  const { newEmail, currentPassword } = req.body;

  if (!newEmail || !currentPassword) {
    return res.status(400).json({ message: 'newEmail aur currentPassword dono chahiye' });
  }

  // Validate basic email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({ message: 'Valid email address daalo' });
  }

  // Step 1: Re-authenticate to verify current password
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.user.email,
    password: currentPassword,
  });

  if (signInErr) {
    return res.status(401).json({ message: 'Current password galat hai' });
  }

  // Step 2: Update email via admin API (service role)
  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
    email:         newEmail.toLowerCase(),
    email_confirm: true, // skip confirmation email — adjust if you want verification flow
  });

  if (updateErr) {
    return res.status(500).json({ message: 'Email update nahi hua', detail: updateErr.message });
  }

  // Log the action
  await supabase.from('activity_logs').insert({
    user_id: req.user.id,
    action:  'PROFILE_EMAIL_UPDATE',
    details: `Email changed to ${newEmail.toLowerCase()}`,
  }).then(() => {});

  res.json({ message: 'Email update ho gaya ✅. Dobara login karo.' });
});

// ── PATCH /profile/me/password ─────────────────────────────────────────────
// Changes the user's password.
// Requires the current password before updating.
router.patch('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'currentPassword aur newPassword dono chahiye' });
  }

  // Enforce password strength: min 8 chars, 1 uppercase, 1 digit, 1 special char
  const strongPassword = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
  if (!strongPassword.test(newPassword)) {
    return res.status(400).json({
      message:
        'Password weak hai. Min 8 characters, ek uppercase, ek number, aur ek special character hona chahiye.',
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'Naya password purane se alag hona chahiye' });
  }

  // Step 1: Verify current password
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.user.email,
    password: currentPassword,
  });

  if (signInErr) {
    return res.status(401).json({ message: 'Current password galat hai' });
  }

  // Step 2: Update password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
    password: newPassword,
  });

  if (updateErr) {
    return res.status(500).json({ message: 'Password update nahi hua', detail: updateErr.message });
  }

  // Log the action
  await supabase.from('activity_logs').insert({
    user_id: req.user.id,
    action:  'PROFILE_PASSWORD_UPDATE',
    details: 'Password changed',
  }).then(() => {});

  res.json({ message: 'Password badal gaya ✅. Dobara login karo.' });
});

export default router;