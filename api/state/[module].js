// api/state/[module].js
// Persist per-user module state as a JSONB snapshot.
// GET  /api/state/accounts  → { state: {...} }
// PUT  /api/state/accounts  → body: { state: {...} }
import { sql, dbReady } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });
  const module = (req.query.module || '').toLowerCase();
  if (!['accounts','pos'].includes(module)) {
    return res.status(400).json({ error: 'Unknown module' });
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT state, updated_at FROM module_state
      WHERE user_id = ${req.user.sub} AND module = ${module}
      LIMIT 1
    `;
    return res.status(200).json({ state: rows[0]?.state || null, updated_at: rows[0]?.updated_at || null });
  }

  if (req.method === 'PUT') {
    const { state } = req.body || {};
    if (!state || typeof state !== 'object') return res.status(400).json({ error: 'state object required' });
    await sql`
      INSERT INTO module_state (user_id, module, state, updated_at)
      VALUES (${req.user.sub}, ${module}, ${state}::jsonb, now())
      ON CONFLICT (user_id, module) DO UPDATE
        SET state = EXCLUDED.state, updated_at = now()
    `;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default requireAuth(handler);
