import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// neon() connects via HTTPS (port 443) — works in all environments including
// production deployment containers that block outbound TCP/5432.
// drizzle-orm/neon-http supports interactive transactions via Neon's HTTP
// transaction API (session tokens), so db.transaction() works correctly.
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });

// Dummy pool export for any legacy code that might reference it.
// connect-pg-simple uses conString directly, not this pool.
export const pool = { query: sql, end: async () => {} };
