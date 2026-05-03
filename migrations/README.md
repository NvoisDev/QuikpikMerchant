# Migrations

## Migration strategy for this project

Schema changes in Quikpik are applied via **startup SQL** in `server/index.ts`,
not via Drizzle migration files.

Every statement in the `migrations` array near the top of `server/index.ts` is
**idempotent** (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.), so the array
can be appended to freely without risk to existing data.  Statements run once
at server boot and are no-ops on subsequent restarts.

### Why startup SQL instead of Drizzle migrate?

The project pre-dates Drizzle's `migrate()` helper, and all schema evolution to
date has been shipped as startup SQL.  Introducing a parallel Drizzle migration
chain at this stage would create a dual source of truth.  The startup-SQL
approach is therefore **canonical** for this codebase.

### Drizzle schema (`shared/schema.ts`)

`shared/schema.ts` is the single authoritative definition of the data model.
It is used by:
- TypeScript for type inference (`$inferSelect`, `$inferInsert`)
- Drizzle ORM for query building (`db.select().from(...)`)
- `drizzle-kit generate` when schema drift needs to be diagnosed

Index declarations in `shared/schema.ts` reflect the intended schema but are
**not** the mechanism that creates indexes in the live database — that role
belongs to the startup SQL statements in `server/index.ts`.

### `meta/_journal.json`

The journal is kept with empty entries because no Drizzle migration files have
been committed.  If a SQL migration file were ever added here it must also be
listed in the journal; mismatches cause `drizzle-kit migrate` to fail.
