// api/health.js
import { sql, dbReady } from './_lib/db.js';

export default async function handler(req, res) {
  const result = { ok: true, ts: new Date().toISOString(), db: false, env: process.env.VERCEL_ENV || 'dev' };
  if (dbReady) {
    try {
      const r = await sql`SELECT 1 AS ok`;
      result.db = r[0]?.ok === 1;
    } catch (e) {
      result.db = false;
      result.error = e.message;
    }
  }
  return res.status(result.ok && (!dbReady || result.db) ? 200 : 503).json(result);
}
