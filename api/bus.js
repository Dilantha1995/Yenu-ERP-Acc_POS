// api/bus.js
// Server-mediated cross-module event bus.
// POST /api/bus           — emit an event   { event, payload, ts, module }
// GET  /api/bus?since=ISO — fetch events since timestamp
import { sql, dbReady } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';

async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });

  if (req.method === 'POST') {
    const { event, payload, module } = req.body || {};
    if (!event) return res.status(400).json({ error: 'event required' });
    await sql`
      INSERT INTO event_bus (event, module, user_id, payload)
      VALUES (${event}, ${module || 'unknown'}, ${req.user.sub}, ${payload || {}}::jsonb)
    `;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const since = req.query.since || new Date(Date.now() - 60_000).toISOString();
    const rows = await sql`
      SELECT id, ts, event, module, payload
      FROM event_bus
      WHERE ts > ${since}::timestamptz
      ORDER BY ts ASC
      LIMIT 200
    `;
    return res.status(200).json({ events: rows });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
