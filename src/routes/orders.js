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
  orders: { type: Array,  default: [] },
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
        // "paid" → "pending" — buyer sees "paid", admin sees "pending"
        status: order.status === 'paid' ? 'pending' : order.status,
        name:   order.name  || user.name,
        email:  order.email || user.email,
        phone:  order.phone || user.phone,
      }))
    );

    allOrders.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ orders: allOrders });
  } catch (err) {
    console.error('GET /orders error:', err);
    res.status(500).json({ message: 'Failed to fetch orders', detail: err.message });
  }
});

// ── PATCH /orders/:id/status ───────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id)
    return res.status(400).json({ message: 'Order ID is required' });

  if (!['dispatched', 'cancelled'].includes(status))
    return res.status(400).json({ message: 'Status must be either dispatched or cancelled' });

  try {
    await connectMongo();

    const user = await User.findOne({ 'orders.orderId': id });
    if (!user)
      return res.status(404).json({ message: 'Order not found' });

    const orderIndex = user.orders.findIndex(o => o.orderId === id);
    if (orderIndex === -1)
      return res.status(404).json({ message: 'Order not found' });

    const order = user.orders[orderIndex];

    // ── On dispatch — reduce stock in Supabase ─────────────
    if (status === 'dispatched') {
      const products = order.products || [];

      for (const item of products) {
        if (!item.id) continue;

        const { data: product, error: stockErr } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.id)
          .single();

        if (stockErr) {
          console.error(`Stock fetch error for product ${item.id}:`, stockErr.message);
          continue;
        }

        if (!product) continue;

        const newStock = Math.max(0, product.stock_quantity - (item.qty || 1));

        const { error: updateErr } = await supabase
          .from('products')
          .update({
            stock_quantity: newStock,
            in_stock:       newStock > 0,
          })
          .eq('id', item.id);

        if (updateErr) {
          console.error(`Stock update error for product ${item.id}:`, updateErr.message);
        }
      }
    }

    // ── Update status in MongoDB ───────────────────────────
    user.orders[orderIndex].status = status;
    user.markModified('orders');
    await user.save();

    // ── Activity log ───────────────────────────────────────
    const { error: logErr } = await supabase.from('activity_logs').insert({
      admin_email: req.admin?.email || 'unknown',
      admin_name:  req.admin?.name  || 'Admin',
      action:      'UPDATE',
      entity:      'order',
      entity_id:   id,
      changes: {
        status_changed_to: status,
        customer_name:     order.name  || user.name,
        customer_email:    order.email || user.email,
        amount:            order.amount,
      },
    });

    if (logErr) {
      console.error('Activity log insert error:', logErr.message);
    }

    res.json({ message: `Order marked as ${status} successfully` });
  } catch (err) {
    console.error('PATCH /orders/:id/status error:', err);
    res.status(500).json({ message: 'Failed to update order status', detail: err.message });
  }
});

export default router;