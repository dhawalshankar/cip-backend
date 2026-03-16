# cip-backend

> Internal REST API for the Cosmo India Prakashan admin panel. Manages inventory, orders, employees, and activity logs.

[![API](https://img.shields.io/badge/api-render-430098?style=flat-square)](https://cip-backend.onrender.com)

---

## About

This is the backend service powering the internal warehouse and inventory management system for Cosmo India Prakashan. It connects to two databases — Supabase for admin data and MongoDB for customer orders from the public website.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (ESM) |
| Framework | Express 4 |
| Admin DB | Supabase (PostgreSQL) |
| Orders DB | MongoDB Atlas + Mongoose |
| Auth | Supabase Auth + custom JWT |
| Deployment | Render |

---

## Project Structure

```
cip-backend/
├── src/
│   ├── lib/
│   │   ├── jwt.js          # signToken, verifyToken
│   │   ├── logger.js       # Activity log helper
│   │   └── supabase.js     # Supabase client (service role)
│   ├── middleware/
│   │   └── auth.js         # requireAuth (req.admin), requireAdmin
│   └── routes/
│       ├── auth.js         # POST /login, GET /me
│       ├── products.js     # CRUD /products
│       ├── orders.js       # GET /orders (MongoDB), PATCH status + stock update
│       ├── employees.js    # GET, POST, PATCH /employees
│       ├── logs.js         # GET /logs
│       └── profile.js      # GET + PATCH /profile/me/*
├── index.js                # App entry, CORS, route mounts
├── seed-admin.js           # First admin seed script (run once)
├── supabase-tables.sql     # Database schema
├── .env
└── package.json
```

---

## Setup

```bash
npm install
```

Create `.env`:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-secret-min-32-chars
MONGODB_URI=your-mongodb-connection-string
PORT=4000
NODE_ENV=development
```

Run Supabase migrations:
```
# Paste supabase-tables.sql into Supabase SQL editor
```

Seed first admin (once only):
```bash
# Edit ADMIN object in seed-admin.js first
node seed-admin.js
```

Start server:
```bash
node index.js
```

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Login, returns JWT |
| GET | `/auth/me` | Bearer JWT | Current user |

### Products
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | Bearer JWT | List all products |
| POST | `/products` | Bearer JWT | Create product |
| PUT | `/products/:id` | Bearer JWT | Update product |
| DELETE | `/products/:id` | Admin only | Delete product |

### Orders
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/orders` | Bearer JWT | All orders from MongoDB |
| PATCH | `/orders/:id/status` | Bearer JWT | Dispatch / Cancel + auto stock update |

### Employees
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/employees` | Admin only | List employees |
| POST | `/employees` | Admin only | Create employee |
| PATCH | `/employees/:id` | Admin only | Activate / deactivate |

### Logs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/logs` | Admin only | Activity logs |

### Profile
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile/me` | Bearer JWT | Own profile |
| PATCH | `/profile/me/display-name` | Bearer JWT | Update name |
| PATCH | `/profile/me/email` | Bearer JWT | Change email |
| PATCH | `/profile/me/password` | Bearer JWT | Change password |

### Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Server health check |

---

## CORS

Allowed origins:
- `https://*.cosmoindiaprakashan.in`
- `https://cosmo-india.vercel.app`
- `https://*-cosmo-india.vercel.app`
- `http://localhost:*`

---

## Dispatch Flow

When admin clicks Dispatch on an order:

```
PATCH /orders/:id/status { status: "dispatched" }
        ↓
MongoDB order status → "dispatched"
        ↓
For each product in order:
  Supabase stock_quantity -= qty
  in_stock = false if stock hits 0
```

---

## Roles & Permissions

| Feature | Employee | Admin |
|---------|----------|-------|
| View Dashboard | ✅ | ✅ |
| Add / Edit Products | ✅ | ✅ |
| Delete Products | ❌ | ✅ |
| View & update Orders | ✅ | ✅ |
| View Activity Logs | ❌ | ✅ |
| Manage Employees | ❌ | ✅ |
| Update Own Profile | ✅ | ✅ |

---

## Related Repositories

| Repo | Description |
|------|-------------|
| [cosmo-india](https://github.com/dhawalshankar/cosmo-india) | Public website (React + Vercel) |
| [cip-admin](https://github.com/dhawalshankar/cip-admin) | Admin panel frontend (React + TypeScript) |

---

*Cosmo India Prakashan — Internal Use Only*