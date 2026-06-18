// api/journals.js
// POST /api/journals — create a journal entry from any module
// GET  /api/journals?source=RetailFlow&from=...&to=... — list
import { sql, dbReady } from './_lib/db.js';
import { requireAuth, audit } from './_lib/auth.js';

function nextId(rows) {
  const last = rows[0]?.id || 'JE-2026-00000';
  const n = parseInt(last.split('-').pop(), 10) || 0;
  return 'JE-2026-' + String(n + 1).padStart(5, '0');
}
function periodOf(dateStr) {
  return (dateStr || '').slice(0, 7); // YYYY-MM
}

async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });

  if (req.method === 'GET') {
    const { source, from, to, entity, limit = 200 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 1000);
    const rows = await sql`
      SELECT je.*,
        (SELECT json_agg(jl.* ORDER BY jl.line_no) FROM journal_lines jl WHERE jl.je_id = je.id) AS lines
      FROM journal_entries je
      WHERE (${source || null}::text IS NULL OR je.source = ${source || null})
        AND (${from   || null}::date IS NULL OR je.date  >= ${from || null}::date)
        AND (${to     || null}::date IS NULL OR je.date  <= ${to   || null}::date)
        AND (${entity || null}::text IS NULL OR je.entity = ${entity || null})
      ORDER BY je.date DESC, je.id DESC
      LIMIT ${lim}
    `;
    return res.status(200).json({ entries: rows });
  }

  if (req.method === 'POST') {
    const je = req.body || {};
    if (!je.date || !Array.isArray(je.lines) || je.lines.length < 2) {
      return res.status(400).json({ error: 'date and at least 2 lines required' });
    }
    const totDr = je.lines.reduce((s,l)=>s + Number(l.dr||0), 0);
    const totCr = je.lines.reduce((s,l)=>s + Number(l.cr||0), 0);
    if (Math.abs(totDr - totCr) > 0.01) {
      return res.status(400).json({ error: `Entry not balanced: DR ${totDr} vs CR ${totCr}` });
    }

    // Next id
    const last = await sql`SELECT id FROM journal_entries ORDER BY id DESC LIMIT 1`;
    const id   = je.id || nextId(last);

    await sql`
      INSERT INTO journal_entries (id, date, period, source, source_ref, entity, memo, total, status, posted_by, meta)
      VALUES (
        ${id}, ${je.date}::date, ${periodOf(je.date)},
        ${je.source || 'Manual'}, ${je.sourceRef || null},
        ${je.entity || 'PSMS'}, ${je.memo || null},
        ${totDr}, ${je.status || 'posted'},
        ${req.user.sub}, ${je.meta || {}}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;

    // Insert lines (idempotent: clear first if re-posting with same id)
    await sql`DELETE FROM journal_lines WHERE je_id = ${id}`;
    for (let i = 0; i < je.lines.length; i++) {
      const l = je.lines[i];
      await sql`
        INSERT INTO journal_lines (je_id, line_no, account, dr, cr, dimension, memo)
        VALUES (${id}, ${i+1}, ${l.acc}, ${Number(l.dr||0)}, ${Number(l.cr||0)}, ${l.dim||{}}::jsonb, ${l.memo||null})
      `;
    }

    await audit(sql, { user_id: req.user.sub, email: req.user.email, action: 'post_je', entity: 'journal_entries', entity_id: id, details: { source: je.source, total: totDr } });

    return res.status(200).json({ id, ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
