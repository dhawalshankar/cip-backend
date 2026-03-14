// src/routes/orders.js
import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import supabase from '../lib/supabase.js';

const router = Router();

// ── MongoDB connection ─────────────────────────────────────
let isConnected = false;
async function connectMongo() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGODB_URI);
  isConnected = true;
  console.log('✅ MongoDB connected (orders)');
}

// ── User model ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:   String,
  email:  String,
  phone:  { type: String, default: '' },
  orders: { type: Array, default: [] },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ── GET /orders ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    await connectMongo();

    const users = await User.find(
      { 'orders.0': { $exists: true } },
      { name: 1, email: 1, phone: 1, orders: 1 }
    ).lean();

    const allOrders = users.flatMap(user =>
      (user.orders || []).map(order => ({
        ...order,
        // "paid" → "pending" — buyer ko "paid" dikhta hai, admin ko "pending"
        status: order.status === 'paid' ? 'pending' : order.status,
        name:   order.name  || user.name,
        email:  order.email || user.email,
        phone:  order.phone || user.phone,
      }))
    );

    allOrders.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ orders: allOrders });
  } catch (err) {
    console.error('❌ Orders fetch error:', err);
    res.status(500).json({ message: 'Orders nahi mile', detail: err.message });
  }
});

// ── PATCH /orders/:id/status ───────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['dispatched', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Status sirf dispatched ya cancelled ho sakta hai' });
  }

  try {
    await connectMongo();

    const user = await User.findOne({ 'orders.orderId': id });
    if (!user) return res.status(404).json({ message: 'Order nahi mila' });

    const orderIndex = user.orders.findIndex(o => o.orderId === id);
    if (orderIndex === -1) return res.status(404).json({ message: 'Order nahi mila' });

    const order = user.orders[orderIndex];

    // ── Dispatch pe Supabase mein stock kam karo ───────────
    if (status === 'dispatched') {
      const products = order.products || [];

      for (const item of products) {
        if (!item.id) continue;

        // Current stock fetch karo
        const { data: product } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.id)
          .single();

        if (!product) continue;

        const newStock = Math.max(0, product.stock_quantity - (item.qty || 1));

        await supabase
          .from('products')
          .update({
            stock_quantity: newStock,
            in_stock: newStock > 0,
          })
          .eq('id', item.id);
      }
    }

    // ── MongoDB mein status update karo ───────────────────
    user.orders[orderIndex].status = status;
    user.markModified('orders');
    await user.save();

    res.json({ message: `Order ${status} ho gaya ✅` });
  } catch (err) {
    console.error('❌ Order update error:', err);
    res.status(500).json({ message: 'Update nahi hua', detail: err.message });
  }
});

export default router;