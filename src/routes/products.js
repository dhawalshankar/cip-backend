import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
// ===============================
// ADDED: Google Drive URL normalizer
// User koi bhi drive link dale → direct image link ban jayega
// ===============================
function normalizeDriveImage(url) {
  if (!url) return url;

  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/); // drive file id extract

  if (match && match[1]) {
    const id = match[1];
    return `https://lh3.googleusercontent.com/d/${id}`;
  }

  return url;
}
// GET /products — public, no auth needed
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  res.json({ products: data });
});

// POST /products — naya product add karo
router.post('/', requireAuth, async (req, res) => {
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
       // ===============================
      // ADDED: Drive link automatically convert
      // ===============================
      image:          normalizeDriveImage(image?.trim()),
      description:    description?.trim() || '',
      isbn:           isbn?.trim() || null,
      pages:          pages ? Number(pages) : null,
      stock_quantity: qty,
      in_stock:       qty > 0,
      bestseller:     Boolean(bestseller),
      rating:         0,
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

// PATCH /products/:id/rating — user rating update
router.patch('/:id/rating', async (req, res) => {
  const { id } = req.params;
  const { rating } = req.body;

  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ message: 'Rating 1-5 ke beech honi chahiye' });

  // Pehle current rating fetch karo
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('rating, rating_count')
    .eq('id', id)
    .single();

  if (fetchErr || !product)
    return res.status(404).json({ message: 'Product nahi mila' });

  const currentCount = product.rating_count || 0;
  const currentRating = product.rating || 0;

  // Running average calculate karo
  const newCount  = currentCount + 1;
  const newRating = parseFloat(
    ((currentRating * currentCount + rating) / newCount).toFixed(1)
  );

  const { data, error } = await supabase
    .from('products')
    .update({
      rating:       newRating,
      rating_count: newCount,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ message: error.message });

  res.json({ product: data });
});

// PUT /products/:id — product update karo
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };
  // ===============================
  // ADDED: image update me bhi drive convert
  // ===============================
  if (updates.image) {
    updates.image = normalizeDriveImage(updates.image);
  }

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
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
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