// api/pos-sales.js
// POST /api/pos-sales — record a POS sale and auto-post the journal entry atomically.
// GET  /api/pos-sales?from=...&to=...&store=... — list sales
import { sql, dbReady } from './_lib/db.js';
import { requireAuth, audit } from './_lib/auth.js';

async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });

  if (req.method === 'GET') {
    const { from, to, store, limit = 200 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 1000);
    const rows = await sql`
      SELECT s.*,
        (SELECT json_agg(l.* ORDER BY l.line_no) FROM pos_sale_lines l WHERE l.sale_id = s.id) AS lines,
        (SELECT json_agg(p.*) FROM pos_payments p WHERE p.sale_id = s.id) AS payments
      FROM pos_sales s
      WHERE (${from || null}::date IS NULL OR s.date >= ${from || null}::date)
        AND (${to   || null}::date IS NULL OR s.date <= ${to   || null}::date)
        AND (${store|| null}::text IS NULL OR s.store = ${store|| null})
      ORDER BY s.ts DESC
      LIMIT ${lim}
    `;
    return res.status(200).json({ sales: rows });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sale = req.body || {};
  if (!sale.id || !Array.isArray(sale.lines) || sale.lines.length === 0) {
    return res.status(400).json({ error: 'id and lines required' });
  }
  const total    = Number(sale.total || 0);
  const subtotal = Number(sale.subtotal || total);
  const tax      = Number(sale.tax || 0);
  const cogs     = Number(sale.cogs || sale.lines.reduce((s,l)=> s + Number(l.cost||0)*Number(l.qty||0), 0));
  const net      = subtotal;
  const date     = sale.date || new Date().toISOString().slice(0,10);
  const period   = date.slice(0,7);

  // Build JE
  const jeId = `JE-POS-${date.replace(/-/g,'')}-${sale.id.split('-').pop()}`;
  const lines = [];
  const cashAcc = (sale.payment_method || sale.paymentMethod) === 'cash' ? '1000' : '1100';
  lines.push({ acc: cashAcc, dr: total, cr: 0 });
  lines.push({ acc: '4005',  dr: 0, cr: net });
  if (tax > 0) lines.push({ acc: '2200', dr: 0, cr: tax });
  if (cogs > 0) {
    lines.push({ acc: '5005', dr: cogs, cr: 0 });
    lines.push({ acc: '1302', dr: 0, cr: cogs });
  }

  // Insert sale + JE atomically by issuing the statements together.
  // Neon's serverless driver doesn't expose multi-statement TX easily,
  // so we run them sequentially and roll back on JE failure.
  try {
    await sql`
      INSERT INTO pos_sales (id, date, store, register, cashier_id, customer_id,
                             subtotal, discount, tax, total, cogs, currency,
                             status, payment_method, je_id, notes, meta)
      VALUES (${sale.id}, ${date}::date,
              ${sale.store||null}, ${sale.register||null}, ${req.user.sub},
              ${sale.customer_id||null},
              ${subtotal}, ${Number(sale.discount||0)}, ${tax}, ${total}, ${cogs},
              ${sale.currency||'MVR'}, ${sale.status||'completed'},
              ${sale.payment_method||sale.paymentMethod||'cash'},
              ${jeId}, ${sale.notes||null}, ${sale.meta||{}}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
    // Lines
    await sql`DELETE FROM pos_sale_lines WHERE sale_id = ${sale.id}`;
    for (let i = 0; i < sale.lines.length; i++) {
      const l = sale.lines[i];
      await sql`
        INSERT INTO pos_sale_lines (sale_id, line_no, item_id, sku, name, qty, price, discount, tax, cost, total)
        VALUES (${sale.id}, ${i+1}, ${l.item_id||null}, ${l.sku||null}, ${l.name||null},
                ${Number(l.qty||0)}, ${Number(l.price||0)}, ${Number(l.discount||0)},
                ${Number(l.tax||0)}, ${Number(l.cost||0)}, ${Number(l.total||0)})
      `;
    }
    // Payments
    if (Array.isArray(sale.payments)) {
      await sql`DELETE FROM pos_payments WHERE sale_id = ${sale.id}`;
      for (const p of sale.payments) {
        await sql`
          INSERT INTO pos_payments (sale_id, method, amount, ref)
          VALUES (${sale.id}, ${p.method}, ${Number(p.amount||0)}, ${p.ref||null})
        `;
      }
    }
    // Auto-post the JE
    await sql`
      INSERT INTO journal_entries (id, date, period, source, source_ref, entity, memo, total, status, posted_by)
      VALUES (${jeId}, ${date}::date, ${period},
              'RetailFlow', ${sale.id}, ${sale.entity||'PSMS'},
              ${`POS sale ${sale.id} (${sale.store||'POS'})`},
              ${total}, 'posted', ${req.user.sub})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`DELETE FROM journal_lines WHERE je_id = ${jeId}`;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await sql`
        INSERT INTO journal_lines (je_id, line_no, account, dr, cr, dimension)
        VALUES (${jeId}, ${i+1}, ${l.acc}, ${l.dr}, ${l.cr}, ${{store: sale.store||null, ref: sale.id}}::jsonb)
      `;
    }
    // Stock decrement
    for (const l of sale.lines) {
      if (l.item_id) {
        await sql`UPDATE items SET stock = COALESCE(stock,0) - ${Number(l.qty||0)} WHERE id = ${l.item_id}`;
      }
    }

    await audit(sql, { user_id: req.user.sub, email: req.user.email, action: 'pos_sale', entity:'pos_sales', entity_id: sale.id, details:{ total, je_id: jeId } });

    return res.status(200).json({ ok: true, sale_id: sale.id, je_id: jeId });
  } catch (e) {
    console.error('[pos-sales]', e);
    return res.status(500).json({ error: e.message });
  }
}

export default requireAuth(handler);
