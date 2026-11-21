import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    const rows = await mongoose.connection.collection('users')
      .find({ role: { $ne: 'admin' } }, {
        projection: { name: 1, email: 1, phone: 1, createdAt: 1 },
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ customers: rows.map(({ _id, ...customer }) => ({ id: _id.toString(), ...customer })) });
  } catch (error) {
    console.error('GET /customers error:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    const result = await mongoose.connection.collection('users').deleteOne({
      _id: new mongoose.Types.ObjectId(id),
      role: { $ne: 'admin' },
    });
    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    console.error('DELETE /customers/:id error:', error);
    res.status(500).json({ message: 'Failed to delete customer' });
  }
});

export default router;
