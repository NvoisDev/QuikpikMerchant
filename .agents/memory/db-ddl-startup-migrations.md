---
name: DDL via startup migrations, not db:push
description: How schema DDL actually reaches dev+prod in this repo, and why db:push can't be relied on here.
---

# DDL runs through the startup migrations array, not `db:push`

New tables/indexes/seed data are applied by the raw-SQL migrations array in `server/index.ts`
that runs on **every boot** (dev and prod). Each statement must be idempotent
(`CREATE TABLE IF NOT EXISTS`, `CREATE ... INDEX IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`).

**Why:** `drizzle-kit push` (`npm run db:push`) requires an interactive TTY. In this agent
environment stdin/stdout are not TTYs, so it errors with "Interactive prompts require a TTY"
the moment it hits any resolver prompt — and there is pre-existing drift between `shared/schema.ts`
and the live Neon DB that triggers a table/schema-conflict prompt. Forcing it risks
dropping/renaming tables. The app's own DB is external Neon via `DATABASE_URL`; Replit's
built-in DB (`checkDatabase`) is NOT provisioned, so that tool reports "not provisioned".

**How to apply:** To add schema, (1) define the table/index in `shared/schema.ts` for ORM
type-safety, and (2) add idempotent DDL + seeds to the startup migrations array in `server/index.ts`.
Verify by booting and watching for "Startup DB migrations applied successfully (N statements)".
Still declare functional/expression indexes in `shared/schema.ts` (e.g.
`uniqueIndex(name).on(sql\`lower(${table.col})\`)`) so a future interactive `db:push` won't drop them.
