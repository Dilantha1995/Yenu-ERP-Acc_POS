-- ═══════════════════════════════════════════════════════════════════
-- PSMS Group ERP — Neon PostgreSQL Schema
-- Run this once in Neon SQL editor before first deploy.
-- Safe to re-run (uses CREATE TABLE IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════

-- ── EXTENSIONS ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive emails

-- ── USERS / AUTH ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                  -- bcrypt
  name          TEXT NOT NULL,
  short         TEXT,                            -- 2-letter initials
  role          TEXT NOT NULL,                   -- cfo|controller|accountant|cashier|manager|auditor
  label         TEXT,
  color         TEXT,
  access        JSONB NOT NULL DEFAULT '["accounts","pos"]',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── COMPANIES / LEGAL ENTITIES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  code        TEXT PRIMARY KEY,                  -- PSMS, PPM, MDX, SCC
  name        TEXT NOT NULL,
  full_name   TEXT,
  biz_reg     TEXT,
  tin         TEXT,
  base_cur    TEXT NOT NULL DEFAULT 'MVR',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── MODULE STATE (per-user JSONB snapshot) ────────────────────────
-- Used by erp-bridge.js to persist arbitrary module state without
-- needing to model every entity individually. Allows the modules to
-- "just work" without migration.
CREATE TABLE IF NOT EXISTS module_state (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,                      -- 'accounts' | 'pos'
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module)
);
CREATE INDEX IF NOT EXISTS idx_state_updated ON module_state(updated_at DESC);

-- ── CHART OF ACCOUNTS (shared across modules) ─────────────────────
CREATE TABLE IF NOT EXISTS coa (
  code      TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,                       -- ast|lia|eq|rev|exp
  class     TEXT NOT NULL,                       -- ca|fa|cl|ncl|eq|rev|oi|cogs|opex|oe|fc|tx
  parent    TEXT REFERENCES coa(code),
  normal    TEXT NOT NULL CHECK (normal IN ('dr','cr')),
  contra    BOOLEAN NOT NULL DEFAULT FALSE,
  ctrl      TEXT,                                -- AR|AP|INV|FA|WIP|PAY|SAL|POS|PRD|CAB
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  meta      JSONB DEFAULT '{}'::jsonb
);

-- ── CUSTOMERS (shared) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  segment       TEXT,
  currency      TEXT NOT NULL DEFAULT 'MVR',
  credit_limit  NUMERIC(14,2),
  tin           TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  gl_ar         TEXT REFERENCES coa(code),
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── VENDORS (shared) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'MVR',
  tin           TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  gl_ap         TEXT REFERENCES coa(code),
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ITEMS / PRODUCTS (shared across POS & Accounts) ───────────────
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  sku           TEXT UNIQUE,
  name          TEXT NOT NULL,
  barcode       TEXT,
  category      TEXT,
  uom           TEXT,
  cost          NUMERIC(14,4),
  price         NUMERIC(14,4),
  stock         NUMERIC(14,4) DEFAULT 0,
  gl_revenue    TEXT REFERENCES coa(code),
  gl_cogs       TEXT REFERENCES coa(code),
  gl_inventory  TEXT REFERENCES coa(code),
  tax_rate      NUMERIC(6,4) DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);

-- ── JOURNAL ENTRIES (the heart of AccountsCore) ───────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id            TEXT PRIMARY KEY,                -- JE-2026-00001
  date          DATE NOT NULL,
  period        TEXT,                            -- 2026-05
  source        TEXT NOT NULL,                   -- PayFlow|SalesFlow|RetailFlow|...|Manual
  source_ref    TEXT,                            -- referencing doc id
  entity        TEXT NOT NULL DEFAULT 'PSMS' REFERENCES companies(code),
  memo          TEXT,
  total         NUMERIC(16,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'posted',  -- posted|draft|reversed
  posted_by     UUID REFERENCES users(id),
  posted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_by   TEXT REFERENCES journal_entries(id),
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_je_date     ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_je_period   ON journal_entries(period);
CREATE INDEX IF NOT EXISTS idx_je_source   ON journal_entries(source);
CREATE INDEX IF NOT EXISTS idx_je_entity   ON journal_entries(entity);

CREATE TABLE IF NOT EXISTS journal_lines (
  id        BIGSERIAL PRIMARY KEY,
  je_id     TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no   INT NOT NULL,
  account   TEXT NOT NULL REFERENCES coa(code),
  dr        NUMERIC(16,2) NOT NULL DEFAULT 0,
  cr        NUMERIC(16,2) NOT NULL DEFAULT 0,
  dimension JSONB DEFAULT '{}'::jsonb,           -- {customer, vendor, store, dept, ...}
  memo      TEXT
);
CREATE INDEX IF NOT EXISTS idx_jl_je       ON journal_lines(je_id);
CREATE INDEX IF NOT EXISTS idx_jl_account  ON journal_lines(account);

-- ── POS SALES (raw; auto-posts to journal_entries) ────────────────
CREATE TABLE IF NOT EXISTS pos_sales (
  id           TEXT PRIMARY KEY,                 -- SALE-20260615-0001
  date         DATE NOT NULL,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  store        TEXT,
  register     TEXT,
  cashier_id   UUID REFERENCES users(id),
  customer_id  TEXT REFERENCES customers(id),
  subtotal     NUMERIC(14,2) NOT NULL,
  discount     NUMERIC(14,2) DEFAULT 0,
  tax          NUMERIC(14,2) DEFAULT 0,
  total        NUMERIC(14,2) NOT NULL,
  cogs         NUMERIC(14,2),
  currency     TEXT NOT NULL DEFAULT 'MVR',
  status       TEXT NOT NULL DEFAULT 'completed', -- completed|voided|refunded|parked
  payment_method TEXT,                            -- cash|card|transfer|mixed
  je_id        TEXT REFERENCES journal_entries(id),
  notes        TEXT,
  meta         JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pos_date    ON pos_sales(date);
CREATE INDEX IF NOT EXISTS idx_pos_status  ON pos_sales(status);

CREATE TABLE IF NOT EXISTS pos_sale_lines (
  id       BIGSERIAL PRIMARY KEY,
  sale_id  TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  line_no  INT NOT NULL,
  item_id  TEXT REFERENCES items(id),
  sku      TEXT,
  name     TEXT,
  qty      NUMERIC(14,4) NOT NULL,
  price    NUMERIC(14,4) NOT NULL,
  discount NUMERIC(14,2) DEFAULT 0,
  tax      NUMERIC(14,2) DEFAULT 0,
  cost     NUMERIC(14,4),
  total    NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_psl_sale ON pos_sale_lines(sale_id);

CREATE TABLE IF NOT EXISTS pos_payments (
  id        BIGSERIAL PRIMARY KEY,
  sale_id   TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method    TEXT NOT NULL,                       -- cash|card|transfer
  amount    NUMERIC(14,2) NOT NULL,
  ref       TEXT,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── EVENT BUS (server-mediated cross-module events) ───────────────
CREATE TABLE IF NOT EXISTS event_bus (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  event     TEXT NOT NULL,
  module    TEXT NOT NULL,
  user_id   UUID REFERENCES users(id),
  payload   JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bus_ts ON event_bus(ts DESC);

-- ── AUDIT LOG ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id   UUID REFERENCES users(id),
  email     TEXT,
  action    TEXT NOT NULL,                       -- login|logout|post_je|reverse_je|create|update|delete
  entity    TEXT,                                -- table or doc
  entity_id TEXT,
  ip        INET,
  user_agent TEXT,
  details   JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);

-- ═══════════════════════════════════════════════════════════════════
-- SEED DATA  (run once)
-- ═══════════════════════════════════════════════════════════════════

-- Companies
INSERT INTO companies (code, name, full_name, biz_reg, tin) VALUES
  ('PSMS', 'PSMS Trading Pvt Ltd',         'Premier Supplies & Medical Services', 'C-0145/2014', '1027401-GST'),
  ('PPM',  'PPM Pharmaceuticals Pvt Ltd',  'PPM Pharmaceuticals',                 'C-0789/2017', '1098765-GST'),
  ('MDX',  'Maldex Medical Distribution',  'Maldex Medical Pvt Ltd',              'C-0234/2019', '1056789-GST'),
  ('SCC',  'SCC Clinics Pvt Ltd',          'SCC Specialty Clinics',               'C-0567/2020', '1078901-GST')
ON CONFLICT (code) DO NOTHING;

-- Bcrypt hashes generated with bcryptjs; rounds=10
-- CFO@2026   -> $2a$10$KixCa4WK9/EtbgWznQGIN.h.0gPNm6F94XBdmmYK6QH3PvE9p7m9q
-- Ctlr@2026  -> $2a$10$E6t9TR.iyPzGd3KKMq3Y9.K6.wQ/qYsLAdAB7d2DEnLF7BfWzm99K
-- Acct@2026  -> $2a$10$1pYRxBmRyHCx5/zlnxojcueZ8MnZmTBl9c1JuOI9ESEpqsLs/9FN.
-- Cash@2026  -> $2a$10$3Bzs0Bgn6cn5RXf8jUKxvO3KIaT5VlMcL5e/MmsQs1FTtCs7DZNYS
-- Mgr@2026   -> $2a$10$Hh7N1Bzu1zSxQTwlOhO.S.HHmA9aH3eX3KqHbcl0xPg1y4y7yMu5e
-- Audit@2026 -> $2a$10$Xb8O5RtFiqJyQ7BBLfRJyOh.GW3T7TgRq0jSAAdwYAyG3OB2/lL2y

INSERT INTO users (email, password_hash, name, short, role, label, color, access) VALUES
  ('cfo@psms.mv',     '$2a$10$KixCa4WK9/EtbgWznQGIN.h.0gPNm6F94XBdmmYK6QH3PvE9p7m9q', 'Aishath Rasheeda', 'AR', 'cfo',        'Chief Financial Officer',  '#0d2d6e', '["accounts","pos","payflow","hr"]'),
  ('ctlr@psms.mv',    '$2a$10$E6t9TR.iyPzGd3KKMq3Y9.K6.wQ/qYsLAdAB7d2DEnLF7BfWzm99K', 'Mohamed Faisal',   'MF', 'controller', 'Financial Controller',     '#1849a9', '["accounts","pos","payflow"]'),
  ('acct@psms.mv',    '$2a$10$1pYRxBmRyHCx5/zlnxojcueZ8MnZmTBl9c1JuOI9ESEpqsLs/9FN.', 'Priya Sharma',     'PS', 'accountant', 'Senior Accountant',        '#166534', '["accounts","payflow"]'),
  ('cashier@psms.mv', '$2a$10$3Bzs0Bgn6cn5RXf8jUKxvO3KIaT5VlMcL5e/MmsQs1FTtCs7DZNYS', 'Shamil Ibrahim',   'SI', 'cashier',    'Cashier · POS only',       '#166534', '["pos"]'),
  ('mgr@psms.mv',     '$2a$10$Hh7N1Bzu1zSxQTwlOhO.S.HHmA9aH3eX3KqHbcl0xPg1y4y7yMu5e', 'Fathimath Manike', 'FM', 'manager',    'Store Manager',            '#92400e', '["pos","accounts"]'),
  ('audit@psms.mv',   '$2a$10$Xb8O5RtFiqJyQ7BBLfRJyOh.GW3T7TgRq0jSAAdwYAyG3OB2/lL2y', 'External Auditor', 'EA', 'auditor',    'Auditor · Read-only',      '#6b21a8', '["accounts"]')
ON CONFLICT (email) DO NOTHING;

-- Minimal COA seed (the full 86-account COA is loaded by the modules on first run)
INSERT INTO coa (code, name, type, class, normal, ctrl) VALUES
  ('1000', 'Cash on Hand',                  'ast', 'ca',  'dr', NULL),
  ('1100', 'Bank — BML MVR (Main)',         'ast', 'ca',  'dr', NULL),
  ('1200', 'Accounts Receivable — Trade',   'ast', 'ca',  'dr', 'AR'),
  ('1302', 'Inventory — Finished Goods',    'ast', 'ca',  'dr', 'INV'),
  ('2000', 'Accounts Payable — Trade',      'lia', 'cl',  'cr', 'AP'),
  ('2200', 'GST Payable (MIRA)',            'lia', 'cl',  'cr', NULL),
  ('3200', 'Retained Earnings',             'eq',  'eq',  'cr', NULL),
  ('4005', 'Revenue — Retail/POS',          'rev', 'rev', 'cr', 'POS'),
  ('5005', 'COGS — Retail/POS',             'exp', 'cogs','dr', 'POS')
ON CONFLICT (code) DO NOTHING;
