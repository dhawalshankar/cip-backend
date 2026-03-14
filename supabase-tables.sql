-- 1. Admin Profiles (auth.users se linked)
CREATE TABLE admin_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Products
CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  author         TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'Astrology',
  language       TEXT NOT NULL DEFAULT 'Hindi',
  price          INTEGER NOT NULL,
  original_price INTEGER NOT NULL,
  image          TEXT DEFAULT '',
  description    TEXT DEFAULT '',
  isbn           TEXT,
  pages          INTEGER,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  in_stock       BOOLEAN NOT NULL DEFAULT false,
  bestseller     BOOLEAN NOT NULL DEFAULT false,
  rating         NUMERIC(3,1) DEFAULT 0,
  review_count   INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. Activity Logs
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  entity      TEXT NOT NULL CHECK (entity IN ('product', 'order')),
  entity_id   TEXT NOT NULL,
  changes     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_in_stock ON products(in_stock);
CREATE INDEX idx_logs_created_at   ON activity_logs(created_at DESC);

-- 5. RLS disable (backend service_role key use karega)
ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products       DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0,
  DROP COLUMN IF EXISTS review_count;