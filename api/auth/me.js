// api/auth/me.js
import { readSession } from '../_lib/auth.js';
import { dbReady } from '../_lib/db.js';

export default async function handler(req, res) {
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'Not authenticated' });
  return res.status(200).json({
    email: s.email, name: s.name, short: s.short, role: s.role,
    label: s.label, color: s.color, access: s.access
  });
}
