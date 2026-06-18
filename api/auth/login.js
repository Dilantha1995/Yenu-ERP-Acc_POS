// api/auth/login.js
import bcrypt from 'bcryptjs';
import { sql, dbReady } from '../_lib/db.js';
import { sign, setSessionCookie, audit } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!dbReady) return res.status(503).json({ error: 'Backend not configured' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const rows = await sql`
      SELECT id, email, password_hash, name, short, role, label, color, access, active
      FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
    `;
    const u = rows[0];
    if (!u || !u.active) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    await sql`UPDATE users SET last_login = now() WHERE id = ${u.id}`;
    await audit(sql, {
      user_id: u.id, email: u.email, action: 'login',
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
      ua: req.headers['user-agent']
    });

    const payload = {
      sub:   u.id,
      email: u.email,
      name:  u.name,
      short: u.short,
      role:  u.role,
      label: u.label,
      color: u.color,
      access: u.access
    };
    const token = sign(payload);
    setSessionCookie(res, token);
    return res.status(200).json({ ...payload, demo: false });
  } catch (e) {
    console.error('[login]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
