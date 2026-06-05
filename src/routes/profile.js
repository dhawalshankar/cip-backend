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

  if (error) {
    console.error('GET /profile/me error:', error.message);
    return res.status(404).json({ message: 'Profile not found' });
  }

  res.json({ ...data, email: req.admin.email });
});

// ── PATCH /profile/me/display-name ────────────────────────
router.patch('/me/display-name', async (req, res) => {
  const { name } = req.body;

  if (!name?.trim())
    return res.status(400).json({ message: 'Name is required' });

  const { error } = await supabase
    .from('admin_profiles')
    .update({ name: name.trim() })
    .eq('id', req.admin.id);

  if (error) {
    console.error('PATCH /me/display-name error:', error.message);
    return res.status(500).json({
      message: 'Failed to update display name',
      detail: error.message,
    });
  }

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_NAME_UPDATE',
    details: 'Display name updated',
  }).then(() => {});

  res.json({ message: 'Display name updated successfully' });
});

// ── PATCH /profile/me/email ───────────────────────────────
router.patch('/me/email', async (req, res) => {
  const { newEmail, currentPassword } = req.body;

  if (!newEmail || !currentPassword)
    return res.status(400).json({
      message: 'Both newEmail and currentPassword are required',
    });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail))
    return res.status(400).json({ message: 'Please enter a valid email address' });

  if (newEmail.toLowerCase() === req.admin.email.toLowerCase())
    return res.status(400).json({ message: 'New email must be different from current email' });

  // Step 1 — Verify current password
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.admin.email,
    password: currentPassword,
  });
  if (signInErr) {
    console.error('Email update — password verification failed:', signInErr.message);
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  // Step 2 — Update email via admin API
  console.log('Attempting email update:', {
    userId: req.admin.id,
    currentEmail: req.admin.email,
    newEmail: newEmail.toLowerCase(),
  });

  const { data: updatedUser, error: updateErr } =
    await supabase.auth.admin.updateUserById(req.admin.id, {
      email:         newEmail.toLowerCase(),
      email_confirm: true,
    });

  if (updateErr) {
    console.error('Supabase admin.updateUserById error:', {
      message: updateErr.message,
      status:  updateErr.status,
      userId:  req.admin.id,
      newEmail,
    });
    return res.status(500).json({
      message: 'Failed to update email',
      detail:  updateErr.message,
    });
  }

  console.log('Email updated successfully for user:', updatedUser?.user?.id);

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_EMAIL_UPDATE',
    details: `Email changed to ${newEmail.toLowerCase()}`,
  }).then(() => {});

  res.json({
    message: 'Email updated successfully. Please log in again with your new email.',
  });
});

// ── PATCH /profile/me/password ────────────────────────────
router.patch('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({
      message: 'Both currentPassword and newPassword are required',
    });

  const strongPassword =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
  if (!strongPassword.test(newPassword))
    return res.status(400).json({
      message:
        'Password is too weak. Minimum 8 characters with at least one uppercase letter, one number, and one special character.',
    });

  if (currentPassword === newPassword)
    return res.status(400).json({
      message: 'New password must be different from the current password',
    });

  // Step 1 — Verify current password
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email:    req.admin.email,
    password: currentPassword,
  });
  if (signInErr) {
    console.error('Password update — verification failed:', signInErr.message);
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  // Step 2 — Update password via admin API
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    req.admin.id,
    { password: newPassword }
  );

  if (updateErr) {
    console.error('Supabase admin.updateUserById (password) error:', {
      message: updateErr.message,
      status:  updateErr.status,
      userId:  req.admin.id,
    });
    return res.status(500).json({
      message: 'Failed to update password',
      detail:  updateErr.message,
    });
  }

  await supabase.from('activity_logs').insert({
    user_id: req.admin.id,
    action:  'PROFILE_PASSWORD_UPDATE',
    details: 'Password changed',
  }).then(() => {});

  res.json({
    message: 'Password updated successfully. Please log in again.',
  });
});

export default router;