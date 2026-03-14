import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes     from './routes/auth.js';
import productRoutes  from './routes/products.js';
import logRoutes      from './routes/logs.js';
import employeeRoutes from './routes/employees.js';
import profileRoutes from './routes/profile.js';

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS ───────────────────────────────────────────────────
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (/^https?:\/\/([\w-]+\.)?cosmoindiaprakashan\.in$/.test(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/[\w-]+-cosmo-india\.vercel\.app$/.test(origin)) return true;  // ← add
  if (origin === 'https://cosmo-india.vercel.app') return true;                   // ← add
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// ── Preflight for ALL routes ────────────────────────────────
app.options('*', cors(corsOptions));

app.use(express.json());

// ── Routes ─────────────────────────────────────────────────
app.use('/auth',      authRoutes);
app.use('/products',  productRoutes);
app.use('/logs',      logRoutes);
app.use('/employees', employeeRoutes);
app.use('/profile', profileRoutes);
// ── Health check ───────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// ── 404 ────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ message: 'Route nahi mila' }));

// ── Error handler (CORS headers must be set here too) ──────
app.use((err, req, res, _next) => {
  console.error(err);
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(500).json({ message: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`✅ CIP Admin backend: http://localhost:${PORT}`);
});