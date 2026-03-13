import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
router.use(requireAuth);

// GET /products — sab products
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ message: error.message });
  res.json({ products: data });
});

// POST /products — naya product add karo
router.post('/', async (req, res) => {
  const {
    title, author, category, language,
    price, original_price, image, description,
    isbn, pages, stock_quantity, bestseller,
  } = req.body;

  if (!title || !author || !price)
    return res.status(400).json({ message: 'title, author, price required hai' });

  const qty = Number(stock_quantity) || 0;

  const { data, error } = await supabase
    .from('products')
    .insert({
      title:          title.trim(),
      author:         author.trim(),
      category:       category || 'Astrology',
      language:       language || 'Hindi',
      price:          Number(price),
      original_price: Number(original_price) || Number(price),
      image:          image?.trim() || '',
      description:    description?.trim() || '',
      isbn:           isbn?.trim() || null,
      pages:          pages ? Number(pages) : null,
      stock_quantity: qty,
      in_stock:       qty > 0,
      bestseller:     Boolean(bestseller),
      rating:         0,
      review_count:   0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });

  await logActivity({
    admin:     req.admin,
    action:    'CREATE',
    entity:    'product',
    entity_id: data.id,
    changes:   { title: data.title },
  });

  res.status(201).json({ product: data });
});

// PUT /products/:id — product update karo
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  // stock_quantity se in_stock auto-update
  if ('stock_quantity' in updates) {
    updates.in_stock = Number(updates.stock_quantity) > 0;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });

  await logActivity({
    admin:     req.admin,
    action:    'UPDATE',
    entity:    'product',
    entity_id: id,
    changes:   updates,
  });

  res.json({ product: data });
});

// DELETE /products/:id — sirf admin
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: existing } = await supabase
    .from('products')
    .select('title')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ message: error.message });

  await logActivity({
    admin:     req.admin,
    action:    'DELETE',
    entity:    'product',
    entity_id: id,
    changes:   { title: existing?.title },
  });

  res.json({ success: true });
});

export default router;