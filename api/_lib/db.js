// api/_lib/db.js
// Thin Neon (PostgreSQL) client wrapper using @neondatabase/serverless.
// Designed for Vercel serverless functions — no connection pooling needed.

import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;

if (!url) {
  console.warn('[db] DATABASE_URL not set — API will return 503');
}

export const sql = url ? neon(url) : null;
export const dbReady = !!sql;

/** Convenience: run a parameterised query and return rows. */
export async function query(strings, ...values) {
  if (!sql) throw new Error('DATABASE_URL not configured');
  return sql(strings, ...values);
}
