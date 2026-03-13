import { verifyToken } from '../lib/jwt.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    req.admin = verifyToken(header.split(' ')[1]);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}