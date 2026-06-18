# PSMS Group ERP

Integrated **AccountsCore** + **RetailFlow POS** on Vercel + Neon PostgreSQL.

This repo contains the production wrapper around your two prototype HTML modules.
It adds:
- A **launcher** (`/`) — beautiful sign-in + module picker
- A **bridge** (`/erp-bridge.js`) — session check, state sync, cross-module event bus
- A **PostgreSQL schema** (`db/schema.sql`) — Neon-ready, 12 tables
- **Vercel serverless API** (`api/*.js`) — auth, journals, POS sales, shared data, event bus
- **Auto-integration** — when POS records a sale, a balanced journal entry is auto-posted into AccountsCore

The two prototype HTML files are kept **as-is** (no behaviour changed).

---

## 📂 What's inside

```
.
├── public/
│   ├── index.html         ← LAUNCHER (sign in + module picker)
│   ├── accounts.html      ← AccountsCore (your file, unchanged)
│   ├── pos.html           ← RetailFlow POS (your file, unchanged)
│   └── erp-bridge.js      ← Shared client: auth guard, state sync, bus
├── api/
│   ├── _lib/db.js         ← Neon serverless client
│   ├── _lib/auth.js       ← JWT sessions (HttpOnly cookie)
│   ├── auth/login.js
│   ├── auth/logout.js
│   ├── auth/me.js
│   ├── state/[module].js  ← Per-user module state snapshots
│   ├── journals.js        ← Post / list journal entries
│   ├── pos-sales.js       ← POS sales + atomic journal posting
│   ├── shared.js          ← COA, customers, vendors, items
│   ├── bus.js             ← Cross-module event bus
│   └── health.js
├── db/
│   └── schema.sql         ← Run this in Neon once
├── scripts/
│   └── seed.mjs           ← Run schema + create demo users
├── vercel.json
├── package.json
└── .env.example
```

---

## 🚀 Deploy in 5 steps

### 1. Create the Neon database

1. Sign up at **https://neon.tech** (free tier is fine for testing).
2. Create a new project named `psms-erp`.
3. From the dashboard, copy the **Pooled connection string** — it looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Push this repo to GitHub

```bash
cd erp-app
git init
git add .
git commit -m "Initial PSMS ERP"
gh repo create psms-erp --private --source=. --push
# (or push manually to a repo you create on github.com)
```

### 3. Deploy to Vercel

1. Go to **https://vercel.com/new**
2. Import your `psms-erp` GitHub repo
3. **Framework Preset:** Other
4. **Build Command:** leave empty
5. **Output Directory:** `public`
6. Under **Environment Variables**, add:

   | Name           | Value                                                       |
   |----------------|-------------------------------------------------------------|
   | `DATABASE_URL` | (your Neon pooled connection string from step 1)            |
   | `JWT_SECRET`   | (run `openssl rand -base64 48` and paste the output)        |

7. Click **Deploy**

### 4. Seed the database

After the first deploy succeeds, run the seed script **once** to create tables
and demo users. You can do this two ways:

**Option A — locally** (recommended):
```bash
npm install
export DATABASE_URL="postgresql://...your Neon URL..."
node scripts/seed.mjs
```

**Option B — via Neon SQL Editor:** open `db/schema.sql`, paste it into the
Neon SQL editor, run it. (Note: the hardcoded password hashes in the SQL file
are placeholders — you must run the seed script to set real hashes, or
manually replace them.)

### 5. Open your app

Visit `https://your-project.vercel.app` and sign in.

| Email              | Password    | Role                       |
|--------------------|-------------|----------------------------|
| cfo@psms.mv        | CFO@2026    | CFO · all modules          |
| ctlr@psms.mv       | Ctlr@2026   | Financial Controller       |
| acct@psms.mv       | Acct@2026   | Senior Accountant          |
| cashier@psms.mv    | Cash@2026   | Cashier · POS only         |
| mgr@psms.mv        | Mgr@2026    | Store Manager              |
| audit@psms.mv      | Audit@2026  | Auditor · read-only        |

---

## 🔌 How integration works

The **integration bridge** (`public/erp-bridge.js`) is loaded by both modules.
It provides `window.ERP` to module code:

```js
window.ERP = {
  session,                // { email, name, role, access, ... }
  api: { call },          // fetch wrapper that adds auth
  state: { load, save },  // per-user, per-module persistence
  bus:   { emit, on },    // cross-module events
  postSale,               // (POS only) — emits pos.sale.completed
};
```

### The POS → AccountsCore flow

1. **Cashier completes a sale** in `pos.html`
2. POS code calls `ERP.postSale(sale)` (or emits `pos.sale.completed`)
3. The bridge POSTs the sale to `/api/pos-sales`
4. The API endpoint **atomically**:
   - Inserts the sale + lines + payments
   - Creates a balanced journal entry (Dr Cash / Cr Sales / Cr GST / Dr COGS / Cr Inventory)
   - Decrements stock
5. The Accounts module (if open in another tab) picks up the event via
   `bus.poll()` every 8 s and refreshes its journal list

To hook this into the POS module, add **one line** to your existing checkout
function in `pos.html`. Look for where `SALES.push(sale)` happens, and add
right after it:
```js
if (window.ERP?.postSale) ERP.postSale(sale);
```

The bridge handles everything else.

### Adding a hook in the Accounts module

If you want the in-memory journal list in `accounts.html` to refresh when a
POS sale arrives in another tab, expose a hook from the React app:

```js
// near the top of accounts.html's App component:
useEffect(() => {
  window.AccountsHooks = { addJournal: (je) => setJournals(j => [...j, je]) };
}, []);
```

The bridge already calls `window.AccountsHooks.addJournal(je)` if it exists.

---

## 🧪 Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local with your DATABASE_URL and JWT_SECRET
npx vercel dev
```

Open `http://localhost:3000`.

---

## 🔒 Security notes

- Passwords are bcrypt-hashed (`rounds=10`)
- Sessions use **HttpOnly** JWT cookies (not localStorage) — XSS-safe
- `Secure` flag is set in production
- `SameSite=Lax` prevents CSRF on cross-site POSTs
- Every API mutation is recorded in `audit_log`
- The bridge **bounces unauthenticated users to `/`** before any module HTML renders

For real production use you should also:
- Rotate `JWT_SECRET` periodically
- Add rate limiting on `/api/auth/login` (Vercel Edge Config or Upstash)
- Enable Neon's IP allow list
- Run regular database backups (Neon does this automatically on paid plans)

---

## 📋 What's preserved from the prototypes

**Both HTML files are byte-identical to your originals** except for a single
`<script src="/erp-bridge.js"></script>` tag injected at the top of `<head>`.
Every feature, every page, every seed data point is intact. The modules will
continue to work in demo mode (localStorage only) if the backend is down — the
bridge auto-detects and falls back gracefully.

---

## 🆘 Troubleshooting

**"Backend not configured" on login**
→ `DATABASE_URL` not set in Vercel. Add it in Project Settings → Environment Variables and redeploy.

**"Invalid email or password" but credentials are correct**
→ The bcrypt hashes in `db/schema.sql` are placeholders. Run `node scripts/seed.mjs` to set fresh ones.

**Modules show but sign-in loops back to /**
→ Cookie domain mismatch. Make sure you're hitting the same hostname for both `/` and `/api/*`.

**POS sale doesn't show up in Accounts journal**
→ Check the browser Network tab on POS — is `POST /api/pos-sales` returning 200?
→ Check the bridge is loaded: `console.log(window.ERP)` in DevTools.

---

© 2026 PSMS Group · Male', Maldives
