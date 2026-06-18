// api/_lib/auth.js
// HttpOnly cookie-based JWT sessions. Helpers used by every API route.

import jwt from 'jsonwebtoken';

const SECRET   = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const COOKIE   = 'psms_token';
const MAX_AGE  = 60 * 60 * 24 * 7;   // 7 days

export function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: MAX_AGE });
}

export function verify(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

export function setSessionCookie(res, token) {
  const isProd = process.env.VERCEL_ENV === 'production';
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE}`,
    isProd ? 'Secure' : ''
  ].filter(Boolean);
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verify(m[1]);
}

/** Wrap a Vercel handler with auth check. Sets req.user. */
export function requireAuth(handler) {
  return async (req, res) => {
    const session = readSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    req.user = session;
    return handler(req, res);
  };
}

/** Audit a user action. */
export async function audit(sql, { user_id, email, action, entity, entity_id, ip, ua, details }) {
  if (!sql) return;
  try {
    await sql`
      INSERT INTO audit_log (user_id, email, action, entity, entity_id, ip, user_agent, details)
      VALUES (${user_id||null}, ${email||null}, ${action}, ${entity||null}, ${entity_id||null}, ${ip||null}::inet, ${ua||null}, ${details||{}})
    `;
  } catch (e) { console.warn('[audit]', e.message); }
}
