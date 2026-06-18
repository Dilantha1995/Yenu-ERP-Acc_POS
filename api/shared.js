// api/shared.js
// Shared master data for both modules.
// GET /api/shared?kind=coa|customers|vendors|items
// POST /api/shared?kind=...  body: row to upsert
import { sql, dbReady } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';

const KINDS = {
  coa:       { table: 'coa',       pk: 'code' },
  customers: { table: 'customers', pk: 'id' },
  vendors:   { table: 'vendors',   pk: 'id' },
  items:     { table: 'items',     pk: 'id' }
};

async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });
  const kind = req.query.kind;
  const cfg  = KINDS[kind];
  if (!cfg) return res.status(400).json({ error: 'Unknown kind' });

  if (req.method === 'GET') {
    let rows;
    if (kind === 'coa')        rows = await sql`SELECT * FROM coa ORDER BY code`;
    else if (kind === 'customers') rows = await sql`SELECT * FROM customers ORDER BY name`;
    else if (kind === 'vendors')   rows = await sql`SELECT * FROM vendors   ORDER BY name`;
    else if (kind === 'items')     rows = await sql`SELECT * FROM items WHERE active = TRUE ORDER BY name`;
    return res.status(200).json({ rows });
  }

  if (req.method === 'POST') {
    // Generic upsert by PK. Caller supplies the full row object.
    const row = req.body || {};
    if (!row[cfg.pk]) return res.status(400).json({ error: cfg.pk + ' required' });

    if (kind === 'customers') {
      await sql`
        INSERT INTO customers (id, name, segment, currency, credit_limit, tin, phone, email, address, gl_ar, meta)
        VALUES (${row.id}, ${row.name}, ${row.segment||null}, ${row.currency||'MVR'}, ${row.credit_limit||null},
                ${row.tin||null}, ${row.phone||null}, ${row.email||null}, ${row.address||null},
                ${row.gl_ar||'1200'}, ${row.meta||{}}::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, segment=EXCLUDED.segment, currency=EXCLUDED.currency,
          credit_limit=EXCLUDED.credit_limit, tin=EXCLUDED.tin, phone=EXCLUDED.phone,
          email=EXCLUDED.email, address=EXCLUDED.address, meta=EXCLUDED.meta
      `;
    } else if (kind === 'items') {
      await sql`
        INSERT INTO items (id, sku, name, barcode, category, uom, cost, price, stock,
                           gl_revenue, gl_cogs, gl_inventory, tax_rate, active, meta)
        VALUES (${row.id}, ${row.sku||null}, ${row.name}, ${row.barcode||null},
                ${row.category||null}, ${row.uom||'pcs'},
                ${row.cost||0}, ${row.price||0}, ${row.stock||0},
                ${row.gl_revenue||'4005'}, ${row.gl_cogs||'5005'}, ${row.gl_inventory||'1302'},
                ${row.tax_rate||0}, ${row.active!==false}, ${row.meta||{}}::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          sku=EXCLUDED.sku, name=EXCLUDED.name, barcode=EXCLUDED.barcode,
          category=EXCLUDED.category, uom=EXCLUDED.uom,
          cost=EXCLUDED.cost, price=EXCLUDED.price, stock=EXCLUDED.stock,
          tax_rate=EXCLUDED.tax_rate, active=EXCLUDED.active, meta=EXCLUDED.meta
      `;
    } else if (kind === 'coa') {
      await sql`
        INSERT INTO coa (code, name, type, class, normal, parent, contra, ctrl, active, meta)
        VALUES (${row.code}, ${row.name}, ${row.type}, ${row.class||row.cls}, ${row.normal},
                ${row.parent||null}, ${!!row.contra}, ${row.ctrl||null}, ${row.active!==false}, ${row.meta||{}}::jsonb)
        ON CONFLICT (code) DO UPDATE SET
          name=EXCLUDED.name, type=EXCLUDED.type, class=EXCLUDED.class, normal=EXCLUDED.normal,
          contra=EXCLUDED.contra, ctrl=EXCLUDED.ctrl, active=EXCLUDED.active, meta=EXCLUDED.meta
      `;
    } else if (kind === 'vendors') {
      await sql`
        INSERT INTO vendors (id, name, currency, tin, phone, email, address, gl_ap, meta)
        VALUES (${row.id}, ${row.name}, ${row.currency||'MVR'}, ${row.tin||null},
                ${row.phone||null}, ${row.email||null}, ${row.address||null},
                ${row.gl_ap||'2000'}, ${row.meta||{}}::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, currency=EXCLUDED.currency, tin=EXCLUDED.tin,
          phone=EXCLUDED.phone, email=EXCLUDED.email, address=EXCLUDED.address, meta=EXCLUDED.meta
      `;
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
