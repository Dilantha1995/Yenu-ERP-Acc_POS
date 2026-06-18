// scripts/seed.mjs
// One-shot setup script. Reads db/schema.sql, runs it against Neon, then
// generates fresh bcrypt hashes for the demo users (more reliable than
// hardcoded hashes in the SQL file).
//
// Usage:  node scripts/seed.mjs
// Requires:  DATABASE_URL env var set (use .env.local + dotenv if needed)

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL is not set. Set it before running:\n  export DATABASE_URL="postgresql://..."\n');
  process.exit(1);
}

const sql = neon(url);

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf-8');

const DEMO_USERS = [
  ['cfo@psms.mv',     'CFO@2026',  'Aishath Rasheeda', 'AR', 'cfo',        'Chief Financial Officer',  '#0d2d6e', '["accounts","pos","payflow","hr"]'],
  ['ctlr@psms.mv',    'Ctlr@2026', 'Mohamed Faisal',   'MF', 'controller', 'Financial Controller',     '#1849a9', '["accounts","pos","payflow"]'],
  ['acct@psms.mv',    'Acct@2026', 'Priya Sharma',     'PS', 'accountant', 'Senior Accountant',        '#166534', '["accounts","payflow"]'],
  ['cashier@psms.mv', 'Cash@2026', 'Shamil Ibrahim',   'SI', 'cashier',    'Cashier · POS only',       '#166534', '["pos"]'],
  ['mgr@psms.mv',     'Mgr@2026',  'Fathimath Manike', 'FM', 'manager',    'Store Manager',            '#92400e', '["pos","accounts"]'],
  ['audit@psms.mv',   'Audit@2026','External Auditor', 'EA', 'auditor',    'Auditor · Read-only',      '#6b21a8', '["accounts"]']
];

async function run() {
  console.log('🚀 Running schema…');
  // The Neon serverless driver doesn't run multi-statement scripts in one shot;
  // split on semicolons that end statements. Naive split, but our SQL is well-formed.
  const stmts = schema
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const stmt of stmts) {
    if (!stmt) continue;
    try { await sql(stmt + ';'); }
    catch (e) {
      if (/already exists|duplicate key/i.test(e.message)) continue;
      console.warn('⚠ ', e.message.split('\n')[0], '\n   in:', stmt.slice(0,80) + '…');
    }
  }
  console.log('✓  Schema applied');

  console.log('🔐 Re-hashing demo user passwords…');
  for (const [email, pwd, name, short, role, label, color, access] of DEMO_USERS) {
    const hash = await bcrypt.hash(pwd, 10);
    await sql`
      INSERT INTO users (email, password_hash, name, short, role, label, color, access)
      VALUES (${email}, ${hash}, ${name}, ${short}, ${role}, ${label}, ${color}, ${access}::jsonb)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name,
        short = EXCLUDED.short, role = EXCLUDED.role, label = EXCLUDED.label, color = EXCLUDED.color,
        access = EXCLUDED.access, active = TRUE
    `;
    console.log(`  ✓ ${email}  (pwd: ${pwd})`);
  }

  console.log('\n✅ Database is ready. You can now run: vercel dev');
}

run().catch(err => { console.error('❌', err); process.exit(1); });
