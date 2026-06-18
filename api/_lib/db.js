// api/_lib/db.js
// Neon (PostgreSQL) client wrapper for Vercel serverless functions.
//
// Looks for the connection string under several common names so it works with
// BOTH (a) Vercel's automatic Neon Storage integration and (b) a manually-set
// DATABASE_URL. Vercel's integration creates POSTGRES_URL, POSTGRES_PRISMA_URL,
// etc.; manual setup typically uses DATABASE_URL.

import { neon } from '@neondatabase/serverless';

const url =
  process.env.DATABASE_URL          ||  // manually added (our deployment guide)
  process.env.POSTGRES_URL          ||  // Vercel-Neon integration default
  process.env.POSTGRES_PRISMA_URL   ||  // Prisma-style (pooled)
  process.env.POSTGRES_URL_NON_POOLING || // Vercel non-pooled
  process.env.NEON_DATABASE_URL     ||
  null;

if (!url) {
  console.warn(
    '[db] No database URL found. Looked for: DATABASE_URL, POSTGRES_URL, ' +
    'POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, NEON_DATABASE_URL.'
  );
} else {
  // Log which one we found (without the password)
  const which =
    process.env.DATABASE_URL          ? 'DATABASE_URL' :
    process.env.POSTGRES_URL          ? 'POSTGRES_URL' :
    process.env.POSTGRES_PRISMA_URL   ? 'POSTGRES_PRISMA_URL' :
    process.env.POSTGRES_URL_NON_POOLING ? 'POSTGRES_URL_NON_POOLING' :
    'NEON_DATABASE_URL';
  console.log('[db] using ' + which + ' (host:', url.replace(/^.*@/, '').split('/')[0] + ')');
}

export const sql = url ? neon(url) : null;
export const dbReady = !!sql;

/** Run a parameterised query. */
export async function query(strings, ...values) {
  if (!sql) throw new Error('No database URL configured in environment');
  return sql(strings, ...values);
}
