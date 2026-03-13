import supabase from './supabase.js';

export async function logActivity({ admin, action, entity, entity_id, changes }) {
  try {
    await supabase.from('activity_logs').insert({
      admin_email: admin.email,
      admin_name:  admin.name,
      action,
      entity,
      entity_id:   String(entity_id),
      changes:     changes || null,
    });
  } catch (err) {
    // Non-critical — log to console but don't crash
    console.error('Activity log failed:', err.message);
  }
}