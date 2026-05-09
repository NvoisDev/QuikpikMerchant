import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000, // Fail fast if Neon is unreachable — prevents silent hang at startup
  idleTimeoutMillis: 30000,
});

// Prevent the process from crashing when Neon terminates an idle connection.
// The pool automatically replaces the dropped client on the next query, so
// swallowing the error here is safe and intentional.
pool.on('error', (err) => {
  console.error('PG Pool error (connection dropped by server):', err.message);
});

export const db = drizzle({ client: pool, schema });