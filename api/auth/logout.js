// api/auth/logout.js
import { clearSessionCookie, readSession, audit } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const s = readSession(req);
  if (s) await audit(sql, { user_id: s.sub, email: s.email, action: 'logout' });
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
