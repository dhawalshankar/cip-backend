import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({});
const router = Router();

function normalizeDriveImage(url) {
  if (!url) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

// GET /products — public
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ products: data });
  } catch (err) {
    next(err);
  }
});

// POST /products — add new product
router.post('/', requireAuth, async (req, res, next) => {
  try {
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

    if (error) throw error;

    await logActivity({
      admin:     req.admin,
      action:    'CREATE',
      entity:    'product',
      entity_id: data.id,
      changes:   { title: data.title },
    });

    res.status(201).json({ product: data });
  } catch (err) {
    next(err);
  }
});

// PATCH /products/:id/rating — user rating update
router.patch('/:id/rating', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating 1-5 ke beech honi chahiye' });

    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('rating, rating_count')
      .eq('id', id)
      .single();

    if (fetchErr || !product)
      return res.status(404).json({ message: 'Product nahi mila' });

    const currentCount  = product.rating_count || 0;
    const currentRating = product.rating || 0;
    const newCount      = currentCount + 1;
    const newRating     = parseFloat(
      ((currentRating * currentCount + rating) / newCount).toFixed(1)
    );

    const { data, error } = await supabase
      .from('products')
      .update({ rating: newRating, rating_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ product: data });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id — update product
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

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

    if (error) throw error;

    await logActivity({
      admin:     req.admin,
      action:    'UPDATE',
      entity:    'product',
      entity_id: id,
      changes:   updates,
    });

    res.json({ product: data });
  } catch (err) {
    next(err);
  }
});

// DELETE /products/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
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

    if (error) throw error;

    await logActivity({
      admin:     req.admin,
      action:    'DELETE',
      entity:    'product',
      entity_id: id,
      changes:   { title: existing?.title },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /products/ai-assist — natural language se product fields extract karo
router.post('/ai-assist', requireAuth, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ message: 'Message required hai' });

    // conversation history build karo
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction: `You are an inventory assistant for Cosmo India Prakashan, a Hindi/Sanskrit publishing house.
        Your job is to extract product fields from admin's natural language input.

        Available categories: Astrology, Spirituality, Philosophy
        Available languages: Hindi, English, Both

        There are TWO types of requests:

        1. ADD request — admin wants to add a new product.
          Required fields: title, author, price, stock_quantity
          If any of these are missing, ask for them.
          When all collected, respond with ONLY this JSON:
          {"ready":true,"edit":false,"fields":{"title":"","author":"","category":"Astrology","language":"Hindi","price":0,"original_price":0,"stock_quantity":0,"pages":null,"isbn":"","description":"","bestseller":false}}

        2. EDIT request — admin wants to update an existing product.
          Only collect WHAT needs to be changed + the product title to search.
          DO NOT ask for all fields. Only ask what field to change if not mentioned.
          When clear, respond with ONLY this JSON:
          {"ready":true,"edit":true,"search_title":"<title>","fields":{"<only changed fields here>"}}

        Never include markdown or code blocks. Only plain text or pure JSON.`,
      },
    });

    const text = response.text.trim();

    // JSON hai ya plain message?
    try {
      const parsed = JSON.parse(text);
      return res.json({ type: 'fields', data: parsed, history: [...contents, { role: 'model', parts: [{ text }] }] });
    } catch {
      return res.json({ type: 'message', data: text, history: [...contents, { role: 'model', parts: [{ text }] }] });
    }
  } catch (err) {
    next(err);
  }
});

export default router;