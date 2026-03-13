import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes     from './routes/auth.js';
import productRoutes  from './routes/products.js';
import logRoutes      from './routes/logs.js';
import employeeRoutes from './routes/employees.js';

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://admin.cosmoindiaprakashan.in',
  'https://admin.cosmoindiaprakashan.in',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(express.json());

// ── Routes ─────────────────────────────────────────────────
app.use('/auth',      authRoutes);
app.use('/products',  productRoutes);
app.use('/logs',      logRoutes);
app.use('/employees', employeeRoutes);

// ── Health check ───────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// ── 404 ────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ message: 'Route nahi mila' }));

// ── Error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`✅ CIP Admin backend: http://localhost:${PORT}`);
});