// src/routes/products.js
import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';
import { GoogleGenAI } from '@google/genai';

const ai  = new GoogleGenAI({});
const router = Router();

// ── Helpers ───────────────────────────────────────────────
function normalizeDriveImage(url) {
  if (!url) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

// ── GET /products — public ────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ products: data });
  } catch (err) {
    console.error('GET /products error:', err.message);
    next(err);
  }
});

// ── POST /products — add new product ─────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title, author, category, language,
      price, original_price, image, description,
      isbn, pages, stock_quantity, bestseller,
    } = req.body;

    if (!title?.trim() || !author?.trim() || !price)
      return res.status(400).json({ message: 'title, author, and price are required' });

    if (isNaN(Number(price)) || Number(price) <= 0)
      return res.status(400).json({ message: 'Price must be a valid positive number' });

    const qty = Number(stock_quantity) || 0;

    const { data, error } = await supabase
      .from('products')
      .insert({
        title:          title.trim(),
        author:         author.trim(),
        category:       category       || 'Astrology',
        language:       language       || 'Hindi',
        price:          Number(price),
        original_price: Number(original_price) || Number(price),
        image:          normalizeDriveImage(image?.trim()),
        description:    description?.trim() || '',
        isbn:           isbn?.trim()  || null,
        pages:          pages         ? Number(pages) : null,
        stock_quantity: qty,
        in_stock:       qty > 0,
        bestseller:     Boolean(bestseller),
        rating:         0,
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      admin:     req.admin,
      action:    'CREATE',
      entity:    'product',
      entity_id: data.id,
      changes:   { title: data.title },
    });

    res.status(201).json({ message: 'Product created successfully', product: data });
  } catch (err) {
    console.error('POST /products error:', err.message);
    next(err);
  }
});

// ── PATCH /products/:id/rating — public rating update ────
router.patch('/:id/rating', async (req, res, next) => {
  try {
    const { id }     = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });

    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('rating, rating_count')
      .eq('id', id)
      .single();

    if (fetchErr || !product) {
      console.error('PATCH /products/:id/rating — fetch error:', fetchErr?.message);
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentCount  = product.rating_count || 0;
    const currentRating = product.rating        || 0;
    const newCount      = currentCount + 1;
    const newRating     = parseFloat(
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

    if (error) throw error;
    res.json({ message: 'Rating updated successfully', product: data });
  } catch (err) {
    console.error('PATCH /products/:id/rating error:', err.message);
    next(err);
  }
});

// ── PUT /products/:id — update product ───────────────────
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id }    = req.params;
    const updates   = { ...req.body };

    if (!id)
      return res.status(400).json({ message: 'Product ID is required' });

    if (updates.image) {
      updates.image = normalizeDriveImage(updates.image);
    }

    if ('stock_quantity' in updates) {
      updates.stock_quantity = Number(updates.stock_quantity) || 0;
      updates.in_stock       = updates.stock_quantity > 0;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116')
        return res.status(404).json({ message: 'Product not found' });
      throw error;
    }

    await logActivity({
      admin:     req.admin,
      action:    'UPDATE',
      entity:    'product',
      entity_id: id,
      changes:   updates,
    });

    res.json({ message: 'Product updated successfully', product: data });
  } catch (err) {
    console.error('PUT /products/:id error:', err.message);
    next(err);
  }
});

// ── DELETE /products/:id — admin only ────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id)
      return res.status(400).json({ message: 'Product ID is required' });

    const { data: existing, error: fetchErr } = await supabase
      .from('products')
      .select('title')
      .eq('id', id)
      .single();

    if (fetchErr || !existing)
      return res.status(404).json({ message: 'Product not found' });

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity({
      admin:     req.admin,
      action:    'DELETE',
      entity:    'product',
      entity_id: id,
      changes:   { title: existing.title },
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('DELETE /products/:id error:', err.message);
    next(err);
  }
});

// ── POST /products/ai-assist — extract product fields ────
router.post('/ai-assist', requireAuth, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;

    if (!message?.trim())
      return res.status(400).json({ message: 'Message is required' });

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model:    'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: `You are an inventory assistant for Cosmo India Prakashan, a Hindi/Sanskrit publishing house.
        Your job is to extract product fields from admin's natural language input. Write all conversational messages in clear English, regardless of the language used in the request.

        Categories are user-defined. Use a category explicitly provided by the admin; otherwise default to Astrology.
        Available languages: Hindi, English, Both

        There are TWO types of requests:

        1. ADD request — admin wants to add a new product.
           Required fields: title, author, price, stock_quantity
           If any of these are missing, ask for them.
           original_price should be 10-20% higher than price (e.g. price 99 → original_price 120). Never set them equal.
           Auto-generate a short 2-3 sentence description in English based on the title and category.
           When all collected, respond with ONLY this JSON:
           {"ready":true,"edit":false,"fields":{"title":"","author":"","category":"Astrology","language":"Hindi","price":0,"original_price":0,"stock_quantity":0,"pages":null,"isbn":"","description":"<auto generated>","bestseller":false}}

        2. EDIT request — admin wants to update an existing product.
           Only collect WHAT needs to be changed + the product title to search.
           DO NOT ask for all fields. Only ask what field to change if not mentioned.
           When clear, respond with ONLY this JSON:
           {"ready":true,"edit":true,"search_title":"<title>","fields":{"<only changed fields here>"}}

        Never include markdown or code blocks. Only plain text or pure JSON.`,
      },
    });

    const text = response.text.trim();

    try {
      const parsed = JSON.parse(text);
      return res.json({
        type:    'fields',
        data:    parsed,
        history: [...contents, { role: 'model', parts: [{ text }] }],
      });
    } catch {
      return res.json({
        type:    'message',
        data:    text,
        history: [...contents, { role: 'model', parts: [{ text }] }],
      });
    }
  } catch (err) {
    console.error('POST /products/ai-assist error:', err.message);
    next(err);
  }
});

export default router;
