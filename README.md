# YenuERP — Complete Fresh Package

Everything you need to run YenuERP as a live multi-tenant SaaS on Vercel.

---

## 📦 What's in this package

```
yenuerp/
├── README.md             ← This file
├── vercel.json           ← Vercel routing config
├── package.json          ← Dependencies (for optional backend)
├── .env.example          ← Environment variable template
├── .gitignore
│
├── public/               ← Everything users see (frontend)
│   ├── index.html        ← YenuERP landing page
│   ├── signup.html       ← Trial signup wizard
│   ├── login.html        ← Sign in for returning customers
│   ├── app.html          ← Customer workspace / module picker
│   ├── setup.html        ← Company setup module
│   ├── admin.html        ← YOUR admin dashboard
│   ├── accounts.html     ← AccountsCore module
│   ├── pos.html          ← RetailFlow POS module
│   ├── erp-bridge.js     ← Tenant-aware integration bridge
│   └── diag.html         ← Diagnostics page
│
├── api/                  ← Optional backend (Vercel serverless functions)
│   ├── _lib/
│   │   ├── db.js         ← Neon database client
│   │   └── auth.js       ← JWT session helper
│   ├── auth/
│   │   ├── login.js
│   │   ├── logout.js
│   │   └── me.js
│   ├── state/[module].js ← Per-user state snapshot
│   ├── journals.js       ← Post/list journal entries
│   ├── pos-sales.js      ← POS sale + auto-journal
│   ├── shared.js         ← COA, customers, vendors, items
│   ├── bus.js            ← Cross-module event bus
│   └── health.js         ← Health check endpoint
│
├── db/
│   └── schema.sql        ← Run in Neon SQL Editor (only if using backend)
│
└── scripts/
    └── seed.mjs          ← One-shot DB seed (only if using backend)
```

---

## 🚀 How to deploy (choose your path)

### PATH A — Quick demo (works right now, no database needed)

This works **today** without any backend. Data saves in each browser's localStorage.

#### 1. Create a fresh GitHub repo
- Go to https://github.com/new
- Name: `yenuerp` (or anything)
- Set to **Private**
- Don't add README, .gitignore, or license (we have them)
- Click **Create repository**

#### 2. Upload these files to GitHub
- On the new empty repo page, click **"uploading an existing file"**
- Drag ALL the files and folders from this zip
- Wait for upload to finish (1-2 minutes)
- Scroll down → **"Commit changes"**

#### 3. Deploy to Vercel
- Go to https://vercel.com/new
- Import your `yenuerp` GitHub repo
- **Framework Preset:** Other
- **Build Command:** leave EMPTY
- **Output Directory:** `public`
- **Skip the Environment Variables step** (not needed for Path A)
- Click **Deploy**

#### 4. Done — you're live!
- Visit your `https://[project-name].vercel.app`
- See the YenuERP landing page
- Click "Start free trial" → sign up as a company → start using it

### PATH B — Full SaaS with persistent database (Neon)

Same as Path A, plus connect Neon for persistent cross-device data.

#### 1-3. Same as Path A above

#### 4. Add Neon database via Vercel Storage
- In Vercel: open your project → **Storage** tab
- Click **Create Database** → **Neon (Free)**
- Vercel creates the database and auto-links it (env vars added automatically)

#### 5. Run the schema in Neon
- In Vercel Storage → click on your `neon-xxx-xxx` database
- Click **"Open in Neon"**
- In Neon: **SQL Editor**
- Copy the contents of `db/schema.sql` (open in GitHub → click "Raw" → Ctrl+A → Ctrl+C)
- Paste into Neon SQL Editor → click **Run**
- You should see "Successful" with mostly green checkmarks

#### 6. Add JWT_SECRET in Vercel
- Vercel project → **Settings** → **Environment Variables**
- Click **Add another**
- Name: `JWT_SECRET`
- Value: Use any random 40+ character string (or run `openssl rand -base64 48` if you have a terminal)
  - Example value: `K7mN2pQ9rT5vX8aB3cE6fH1jL4nP7sU0wY9zD2gJ5kM8`
- Click **Save**

#### 7. Redeploy
- Vercel → **Deployments** tab → click "..." on latest → **Redeploy**

#### 8. Verify
- Visit `https://[your-project].vercel.app/diag` to run automatic diagnostics
- All checks should pass ✓

---

## 🗺️ The customer journey (what people will do)

```
1. Visit your site:        →  YenuERP landing page (homepage)
2. Click "Start free trial" →  3-step signup wizard
   ├─ Step 1: Name, email, password
   ├─ Step 2: Company name, industry, workspace URL
   └─ Step 3: Pick plan (Starter/Business/Enterprise)
3. Land in /app             →  Workspace with "Welcome! Set up your company"
4. Click "Start setup →"    →  Company Setup module
   ├─ Company Info tab
   ├─ Chart of Accounts (with 7 industry templates)
   ├─ Products / Items
   ├─ Customers
   ├─ Vendors
   ├─ Tax Settings (GST, BPT)
   ├─ Branding (logo, colors)
   └─ Users & Roles
5. Setup complete           →  AccountsCore / RetailFlow POS ready to use
6. 14-day trial countdown   →  Banner shows days remaining
7. Trial ends               →  Modules become read-only, upgrade prompt
```

---

## 🗺️ URLs you'll have

| URL | What it is | Who uses it |
|---|---|---|
| `/` | YenuERP landing page | Visitors / prospects |
| `/signup` | Trial signup wizard | New customers |
| `/login` | Sign in | Returning customers |
| `/app` | Workspace / module picker | Logged-in customers |
| `/setup` | Company setup | Customer admins |
| `/accounts` | AccountsCore | Customers |
| `/pos` | RetailFlow POS | Customers |
| `/admin` | YOUR admin dashboard | **You only** |
| `/diag` | Diagnostics (backend health) | You for testing |

---

## 🔑 Demo accounts

If you ever need to test the old PSMS demo (still works as an option), these login codes work in `accounts.html` and `pos.html`:

| Email | Password | Role |
|---|---|---|
| cfo@psms.mv | CFO@2026 | CFO (full access) |
| ctlr@psms.mv | Ctlr@2026 | Controller |
| cashier@psms.mv | Cash@2026 | Cashier (POS only) |

But for the new YenuERP SaaS flow, customers create their own accounts through `/signup`.

---

## 🆘 Common issues & fixes

### "I see 'PSMS Group ERP' instead of YenuERP"
You haven't uploaded the new `public/index.html` yet (or browser is cached). Force-refresh with **Ctrl+F5**.

### "Sign in doesn't work / nothing happens"
You're in demo mode (no backend) → use `/signup` to create an account first. Or visit `/diag` to see what's wrong.

### "I want to start fresh / clear all test data"
In your browser's DevTools (F12) → Console → run:
```js
localStorage.clear(); location.reload();
```
This clears all tenants and sessions on this browser.

### "I want to add the Neon database later"
Follow Path B steps 4-7 above whenever you're ready. The frontend doesn't change — only the backend wakes up.

### "/admin shows nothing"
The admin dashboard reads tenants from localStorage on your current browser. To see customers from across devices, you need Path B (Neon backend) where the data lives server-side.

---

## 📋 What works right now (Path A, no backend)

- ✅ Beautiful YenuERP landing page
- ✅ 3-step signup wizard with 3 plans
- ✅ Login for returning customers
- ✅ Per-tenant isolated data (each company's data is separate)
- ✅ Full Company Setup module:
  - 7 industry COA templates
  - Add/edit products, customers, vendors
  - Tax settings (GST, BPT, TGST)
  - Branding with logo upload
  - Users & roles
  - CSV import/export
- ✅ 14-day trial countdown
- ✅ Trial expiry → modules become read-only
- ✅ AccountsCore + RetailFlow POS work fully
- ✅ Cross-tab POS → Accounts sync
- ✅ Your admin dashboard at /admin

**Limitation:** Data is per-browser. A customer signing in on their phone won't see the data they entered on their laptop. That's what Path B (Neon) solves.

## 📋 What Path B adds (Neon database)

- ✅ Real cross-device data — customer's phone sees what they did on laptop
- ✅ Multiple users per tenant — accountant and cashier both work on the same data
- ✅ Real authentication with bcrypt password hashing
- ✅ Audit log of every action
- ✅ Server-side journal posting (POS sales auto-create real GL entries)
- ✅ Backups via Neon's 7-day point-in-time recovery

---

## 🎯 Recommended next steps

1. **Today**: Deploy Path A. Sign up as your own company. Verify everything works.
2. **This week**: Show 2-3 prospects. Have them sign up themselves. See if anyone has issues.
3. **Next week**: Move to Path B (Neon backend). Now data persists across devices.
4. **Later**: Wire AccountsCore and POS to read each tenant's own COA/products from Setup. This is the final piece to remove all PSMS sample data.

---

© 2026 YenuERP · Built in the Maldives
