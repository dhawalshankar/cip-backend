import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';

const router = Router();

// Categories are shared across all staff accounts and include legacy product values.
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [{ data: categories, error }, { data: products, error: productsError }] = await Promise.all([
      supabase.from('categories').select('id, name').order('name', { ascending: true }),
      supabase.from('products').select('category'),
    ]);
    if (error) throw error;
    if (productsError) throw productsError;

    const names = new Set((categories || []).map(({ name }) => name));
    for (const { category } of products || []) if (category?.trim()) names.add(category.trim());
    res.json({ categories: [...names].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    if (name.length > 80) return res.status(400).json({ message: 'Category name must be 80 characters or fewer' });

    const { data: existing, error: lookupError } = await supabase
      .from('categories').select('id, name').ilike('name', name).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(200).json({ category: existing, created: false });

    const { data, error } = await supabase.from('categories').insert({ name }).select('id, name').single();
    if (error) {
      // Resolve concurrent attempts to add the same case-insensitive name.
      if (error.code === '23505') {
        const { data: duplicate, error: duplicateError } = await supabase
          .from('categories').select('id, name').ilike('name', name).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) return res.status(200).json({ category: duplicate, created: false });
      }
      throw error;
    }

    await logActivity({ admin: req.admin, action: 'CREATE', entity: 'product', entity_id: data.id, changes: { category: data.name } });
    res.status(201).json({ category: data, created: true });
  } catch (err) {
    next(err);
  }
});

export default router;
