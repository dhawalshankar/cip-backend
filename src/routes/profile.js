// src/routes/profile.js
import express from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// ── GET /profile/me ───────────────────────────────────────
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, name, role, is_active, created_at')
    .eq('id', req.admin.id)
    .single();

  if (error) return res.status(404).json({ message: 'Profile nahi mila' });
  res.json({ ...data, email: req.admin.email });
});

// ── PATCH /profile/me/display-name ────────────────────────
router.patch('/me/display-name', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim())
    return res.status(400).json({ message: 'Name required hai' });

  const { error } = await supabase
    .from('admin_profiles')
    .update({ name: name.trim() })
    .eq('id', req.admin.id);

  if (error) return res.status(500).json({ message: 'Update nahi hua', detail: error.message });

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_NAME_UPDATE',
    details: 'Display name updated',
  }).then(() => {});

  res.json({ message: 'Naam update ho gaya ✅' });
});

// ── PATCH /profile/me/email ───────────────────────────────
router.patch('/me/email', async (req, res) => {
  const { newEmail, currentPassword } = req.body;

  if (!newEmail || !currentPassword)
    return res.status(400).json({ message: 'newEmail aur currentPassword dono chahiye' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail))
    return res.status(400).json({ message: 'Valid email address daalo' });

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.admin.email,
    password: currentPassword,
  });
  if (signInErr)
    return res.status(401).json({ message: 'Current password galat hai' });

  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.admin.id, {
    email:         newEmail.toLowerCase(),
    email_confirm: true,
  });
  if (updateErr)
    return res.status(500).json({ message: 'Email update nahi hua', detail: updateErr.message });

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_EMAIL_UPDATE',
    details: `Email changed to ${newEmail.toLowerCase()}`,
  }).then(() => {});

  res.json({ message: 'Email update ho gaya ✅. Dobara login karo.' });
});

// ── PATCH /profile/me/password ────────────────────────────
router.patch('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: 'currentPassword aur newPassword dono chahiye' });

  const strongPassword = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
  if (!strongPassword.test(newPassword))
    return res.status(400).json({
      message: 'Password weak hai. Min 8 chars, ek uppercase, ek number, ek special character chahiye.',
    });

  if (currentPassword === newPassword)
    return res.status(400).json({ message: 'Naya password purane se alag hona chahiye' });

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.admin.email,
    password: currentPassword,
  });
  if (signInErr)
    return res.status(401).json({ message: 'Current password galat hai' });

  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.admin.id, {
    password: newPassword,
  });
  if (updateErr)
    return res.status(500).json({ message: 'Password update nahi hua', detail: updateErr.message });

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_PASSWORD_UPDATE',
    details: 'Password changed',
  }).then(() => {});

  res.json({ message: 'Password badal gaya ✅. Dobara login karo.' });
});

export default router;