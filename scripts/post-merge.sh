#!/bin/bash
set -e

npm install

# Sync Drizzle schema changes to the database.
# The expression-based partial unique index added in Task #320 causes drizzle-kit
# introspection to fail (arrayfuncs.c / ArrayCount bug in drizzle-kit when
# encountering functional indexes). We therefore allow db:push to fail here —
# all schema changes, column additions, and the unique index itself are also
# applied by runStartupMigrations in server/index.ts on every boot, so
# nothing is lost if this step errors.
npm run db:push --force || true
