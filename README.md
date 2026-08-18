# PennyWise — Personal Finance Tracker

A full-stack personal finance tracker built with **React**, **Node.js/Express**, and **SQLite**, featuring income/expense tracking, budgeting, analytics, receipt OCR scanning, project budgets, recurring transactions, assets & net worth, currency conversion, CSV import/export and full **offline (PWA)** support.

## Features

- **Income & expense tracking** with categories, merchants, notes, currencies, date filters and receipts
- **Receipt OCR scanning** — upload a receipt image or PDF; Tesseract.js extracts merchant, amount and date which are prefilled for confirmation
- **Budget planning** — monthly budgets per category and goal-based **project budgets** with expense linking, live progress bars and alerts at **80%** and **100%** usage
- **Recurring transactions** — auto-create scheduled income/expenses, with upcoming-payment reminders on the dashboard
- **Assets & net worth** — track cash, investments, property and crypto; total and per-type allocation
- **Currency support** — per-transaction currencies, USD-base conversion rates and net conversions
- **Export & import** — download expenses as CSV/JSON/PDF and import bank CSV statements
- **Analytics & insights** — daily/weekly/monthly trends, category distribution, top merchants and high-spending-day detection
- **Authentication** — JWT stored in HTTP-only cookies, bcrypt password hashing, rate-limited login, protected routes
- **Offline support (PWA)** — installable app, service worker caching, and an **IndexedDB** mutation queue (with localStorage fallback) that syncs with conflict handling when you reconnect
- **Browser notifications** — alerts when budgets are exceeded or payments are due
- **Security hardening** — Helmet, compression, request rate limiting, XSS input sanitisation, input validation
- **Dark / light mode** and a responsive layout for mobile and desktop

## Project structure

```
├── backend/                 Express + SQLite API
│   ├── src/
│   │   ├── server.js        Entry point (migrates + starts server, recurring scheduler)
│   │   ├── app.js           Express app wiring
│   │   ├── db/
│   │   │   ├── index.js     better-sqlite3 connection helpers
│   │   │   ├── migrate.js   Migration runner (up + rollback)
│   │   │   ├── migrations/  001–006 schema migrations
│   │   │   ├── seed.js      Demo data (demo@pennywise.app / demo12345)
│   │   │   └── defaultCategories.js
│   │   ├── middleware/      auth, sanitize (XSS guard)
│   │   ├── services/        ocr (Tesseract), recurring processor
│   │   ├── scripts/         load-test.js
│   │   └── routes/          auth, income, expenses, categories, budgets, analytics,
│   │                        projects, recurring, upload, assets, currency,
│   │                        export, import, settings
│   └── tests/               node:test + supertest (77 tests)
├── frontend/                React + Vite PWA
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── sw.js            Service worker (offline caching)
│   │   └── icons/
│   └── src/
│       ├── api/client.js    Fetch wrapper (cookie auth, uploads, downloads)
│       ├── context/         Auth, Theme, Toast, Data (with offline queue)
│       ├── components/      Layout, forms, charts, budget bars, modals...
│       ├── pages/           Dashboard, Transactions, Analytics, Budgets,
│       │                    Projects, Assets, Categories, Settings, Login, Register
│       └── utils/           format, categories, notifications, offlineQueue (IndexedDB)
├── Dockerfile               Multi-stage (frontend build → backend runtime)
├── docker-compose.yml       Single-service deploy with persistent volumes
├── openapi.yaml             OpenAPI 3 specification
└── package.json             Root scripts (dev, test, migrate, seed)
```

## Database schema

| Table | Purpose |
| --- | --- |
| `users` | id, email, password_hash, name, created_at |
| `income` | user_id, amount, source, category, date, is_recurring, notes, currency |
| `expenses` | user_id, amount, merchant, category, date, receipt_path, notes, currency |
| `categories` | user_id (NULL = default), name, type, color, icon |
| `budgets` | user_id, category_id, amount, period, month_year |
| `project_budgets` | user_id, name, total_budget, spent, start_date, end_date |
| `project_expenses` | project_id, expense_id |
| `recurring_transactions` | user_id, type, amount, description, frequency, next_date |
| `assets` | user_id, name, type, value, currency, note |
| `net_worth_snapshots` | user_id, date, value |
| `currency_rates` | base, quote, rate (unique pair) |
| `settings` | user_id, preferred_currency, notify_budget |

Migrations live in `backend/src/db/migrations/` and are tracked in a `migrations` table. Rollback runs the `down()` of each applied migration in reverse.

## Getting started

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
npm run setup
```

This installs `backend/` and `frontend/` dependencies.

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Set a strong `JWT_SECRET` for production. `DB_PATH` defaults to `backend/data/pennywise.db`.

### 3. Run migrations (and optionally seed demo data)

```bash
npm run migrate
npm run seed          # creates demo@pennywise.app / demo12345 with sample data
```

### 4. Run in development

```bash
npm run dev
```

- Frontend (Vite): http://localhost:5173
- Backend API: http://localhost:5000 — health check at `/api/health`

The Vite dev server proxies `/api` and `/uploads` to the backend, so no CORS setup is needed in development.

## Tests

```bash
npm test               # runs backend test suite (77 tests)
npm run build          # production build of the frontend
node backend/scripts/load-test.js [concurrency] [requests]   # API load test
```

The backend suite covers: database connection, schema/table creation, migration up/down/rollback idempotency, auth (register/login/401/validation/rate limit), income/expense CRUD, categories, budget progress, analytics aggregation, receipt upload + OCR parsers, project expense linking, recurring processing, assets/net worth, currency conversion, CSV import, CSV/JSON/PDF export and settings.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register (name, email, password ≥ 8 chars) |
| POST | `/api/auth/login` | Login, sets HTTP-only JWT cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/income` | List / add income (`?from&to&category&month`) |
| PUT/DELETE | `/api/income/:id` | Update / delete income |
| GET/POST | `/api/expenses` | List / add expenses |
| PUT/DELETE | `/api/expenses/:id` | Update / delete expense |
| GET/POST | `/api/categories` | List / create categories |
| DELETE | `/api/categories/:id` | Delete custom category |
| GET/POST | `/api/budgets` | Budgets with live progress (`?month=YYYY-MM`) |
| DELETE | `/api/budgets/:id` | Remove a budget |
| GET/POST | `/api/projects` | Project budgets |
| GET | `/api/projects/:id` | Project with linked expenses |
| GET/POST | `/api/projects/:id/expenses` | List / link an expense to a project |
| DELETE | `/api/projects/:projectId/expenses/:expenseId` | Unlink an expense from a project |
| GET | `/api/analytics/summary` | Totals: income, expenses, net |
| GET | `/api/analytics/daily` | Daily breakdown |
| GET | `/api/analytics/weekly` | Weekly trends |
| GET | `/api/analytics/monthly` | Monthly summary |
| GET | `/api/analytics/categories` | Category spending distribution |
| GET | `/api/analytics/top-spending` | Most frequent merchants |
| GET | `/api/analytics/high-spending-days` | Days above threshold (avg + 1 stddev) |
| GET/POST | `/api/recurring` | Recurring transactions |
| GET | `/api/recurring/upcoming` | Upcoming payments (`?days=14`) |
| POST | `/api/recurring/process` | Process due recurring rules now |
| DELETE | `/api/recurring/:id` | Remove a recurring rule |
| GET/POST | `/api/assets` | List / add assets |
| PUT/DELETE | `/api/assets/:id` | Update / remove an asset |
| GET | `/api/assets/networth` | Net worth total, per-type allocation, history |
| GET/POST | `/api/currency/rates` | List / set USD-base conversion rates |
| GET | `/api/currency/convert` | Convert amount (`?amount&from&to`) |
| GET | `/api/currency/convert/transactions` | Convert all transactions to a currency (`?to`) |
| GET | `/api/export/expenses.csv` | Export expenses as CSV |
| GET | `/api/export/expenses.json` | Export expenses as JSON |
| GET | `/api/export/expenses.pdf` | Export a PDF expense report |
| POST | `/api/import/transactions` | Import transactions from a bank CSV (multipart `file`) |
| GET/PUT | `/api/settings` | Read / update preferences |
| POST | `/api/upload/receipt` | Receipt upload + OCR scan (multipart `receipt`) |

All routes except `/api/health` and `/api/auth/register|login|logout` require authentication. See `openapi.yaml` for the full machine-readable specification.

## Security

- **Helmet** sets secure HTTP headers, **compression** reduces payload size
- **express-rate-limit** on `/api/auth/*` (50 requests / 15 min) mitigates brute force
- **XSS sanitisation** middleware cleans request bodies before validation
- **Input validation** via express-validator on all write routes
- Passwords hashed with **bcrypt**; sessions via **HTTP-only JWT cookies**
- Uploads restricted to images/PDF ≤ 5 MB and stored outside the repo
- Dependency audits run in CI (`npm audit --audit-level=high`)

> Note: the frontend dev dependency `esbuild` (via Vite) has a known moderate advisory that only affects the development server, not production builds. Production serves the prebuilt static bundle through Express. A fix requires a breaking Vite 8 upgrade.

## Offline usage

- The app registers a service worker that precaches the app shell and serves **cached GET responses** when offline.
- Mutations made offline (add/edit/delete transactions) are queued in **IndexedDB** (with a localStorage fallback) and applied optimistically with a "Pending" tag.
- When connectivity returns, the queue is flushed automatically (or via the "Sync now" banner) with **timestamp-based conflict handling** — updates that conflict with server state are replayed against the current record, and failed permanent errors are dropped from the queue.

## Production deployment

### Option A — Native

```bash
npm run build                       # build frontend to frontend/dist
NODE_ENV=production npm start       # run backend from /workspace/backend
```

Set a strong `JWT_SECRET` and serve the frontend from `frontend/dist` (Express falls back to `index.html` for client-side routing).

### Option B — Docker

```bash
docker compose up --build -d
```

- Builds the frontend and backend into a single image (multi-stage)
- Exposes the API on port **5000**
- Persistent volumes for the SQLite database and uploads
- Runs migrations automatically on startup and processes due recurring transactions on a 6-hour interval (`RECURRING_INTERVAL_MS`)

### CI

`.github/workflows/ci.yml` runs backend tests + lint, a frontend production build, and dependency vulnerability audits on every push/PR.

## License

MIT — for educational and personal use.
