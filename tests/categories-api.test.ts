/**
 * Task #1392 — Central product-categories API regression tests.
 *
 * These run against the real database via the route handlers (supertest), with
 * only authentication mocked. Doing so genuinely exercises the data-protection
 * rules that live in SQL (case-insensitive uniqueness, bulk product updates on
 * rename, and clearing the category from products on delete) rather than
 * re-asserting hand-fed mock returns.
 *
 * Covered behaviour (server/routes/categories.ts):
 *   - GET /api/categories is public, returns names + product counts, name-ordered
 *   - POST/PATCH/DELETE /api/admin/categories reject non-admin callers (403)
 *   - Duplicate names are rejected case-insensitively (409)
 *   - Renaming bulk-updates every product that used the old name
 *   - Deleting clears the category from affected products and returns the count
 *
 * All test rows use the "zz_test_" name prefix and are cleaned up afterwards.
 */

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Mutable auth state — the mocked requireAuth injects whatever user is set here,
// letting individual tests switch between an admin and a non-admin caller.
const authState = vi.hoisted(() => ({
  user: { id: 'test-user', email: 'hello@quikpik.co' } as { id: string; email: string },
}));

// Bypass Google/Replit auth. shared.ts re-exports requireAuth from here, and
// categories.ts imports it from shared, so this mock reaches the route.
vi.mock('../server/googleAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authState.user;
    next();
  },
  getGoogleAuthUrl: vi.fn(),
  verifyGoogleToken: vi.fn(),
  createOrUpdateUser: vi.fn(),
  GoogleAuthBlockedError: class extends Error {},
}));

import request from 'supertest';
import express from 'express';
import { eq, sql, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { categories, products } from '@shared/schema';
import { registerCategoryRoutes } from '../server/routes/categories';

const ADMIN = { id: 'admin-user', email: 'hello@quikpik.co' };
const NON_ADMIN = { id: 'member-user', email: 'someone@notadmin.example' };

const PREFIX = 'zz_test_';
const TEST_NAME_LIKE = `${PREFIX}%`;

const app = express();
app.use(express.json());
registerCategoryRoutes(app);

let wholesalerId: string;
const insertedProductIds: number[] = [];

function asAdmin() {
  authState.user = { ...ADMIN };
}
function asNonAdmin() {
  authState.user = { ...NON_ADMIN };
}

async function cleanup() {
  // Null out products that still reference a test category, then drop test rows.
  await db.update(products).set({ category: null }).where(sql`${products.category} LIKE ${TEST_NAME_LIKE}`);
  if (insertedProductIds.length > 0) {
    await db.delete(products).where(inArray(products.id, insertedProductIds));
    insertedProductIds.length = 0;
  }
  await db.delete(categories).where(sql`${categories.name} LIKE ${TEST_NAME_LIKE}`);
}

async function makeCategory(name: string): Promise<number> {
  const [row] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  return row.id;
}

async function makeProduct(category: string | null): Promise<number> {
  const [row] = await db
    .insert(products)
    .values({ wholesalerId, name: `${PREFIX}product`, price: '1.00', category: category ?? undefined })
    .returning({ id: products.id });
  insertedProductIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const result = await db.execute(sql`SELECT id FROM users LIMIT 1`);
  const id = result.rows[0]?.id as string | undefined;
  if (!id) throw new Error('No users in database — cannot attach test products to a wholesaler');
  wholesalerId = id;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('GET /api/categories (public list)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  it('is reachable without an admin/login and returns names + product counts ordered by name', async () => {
    // Names chosen so the alphabetical order is Apples < Beverages.
    const bevName = `${PREFIX}Beverages`;
    const appleName = `${PREFIX}Apples`;
    await makeCategory(bevName);
    await makeCategory(appleName);
    // Two products in Beverages, none in Apples.
    await makeProduct(bevName);
    await makeProduct(bevName);

    // No user at all — GET must remain public.
    authState.user = undefined as any;
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const mine = res.body.filter((c: any) => typeof c.name === 'string' && c.name.startsWith(PREFIX));
    const names = mine.map((c: any) => c.name);
    // Ordered by name ascending (relative order of our prefixed rows).
    expect(names).toEqual([...names].sort());
    expect(names).toEqual([appleName, bevName]);

    const bev = mine.find((c: any) => c.name === bevName);
    const apples = mine.find((c: any) => c.name === appleName);
    expect(bev.productCount).toBe(2);
    expect(apples.productCount).toBe(0);
  });
});

describe('Admin guard — non-admins are rejected with 403', () => {
  let categoryId: number;

  beforeEach(async () => {
    await cleanup();
    categoryId = await makeCategory(`${PREFIX}Guarded`);
    asNonAdmin();
  });

  it('POST /api/admin/categories rejects a non-admin', async () => {
    const res = await request(app).post('/api/admin/categories').send({ name: `${PREFIX}New` });
    expect(res.status).toBe(403);
    // No row was created.
    const rows = await db.select().from(categories).where(eq(categories.name, `${PREFIX}New`));
    expect(rows.length).toBe(0);
  });

  it('PATCH /api/admin/categories/:id rejects a non-admin', async () => {
    const res = await request(app).patch(`/api/admin/categories/${categoryId}`).send({ name: `${PREFIX}Renamed` });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(row.name).toBe(`${PREFIX}Guarded`);
  });

  it('DELETE /api/admin/categories/:id rejects a non-admin', async () => {
    const res = await request(app).delete(`/api/admin/categories/${categoryId}`);
    expect(res.status).toBe(403);
    const rows = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(rows.length).toBe(1);
  });
});

describe('POST /api/admin/categories — duplicate name handling', () => {
  beforeEach(async () => {
    await cleanup();
    asAdmin();
  });

  it('creates a new category (201)', async () => {
    const res = await request(app).post('/api/admin/categories').send({ name: `${PREFIX}Snacks` });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${PREFIX}Snacks`);
    // The created row is cleaned up by name prefix in afterAll/cleanup.
  });

  it('rejects a case-insensitive duplicate (409)', async () => {
    await makeCategory(`${PREFIX}Beverages`);
    const res = await request(app).post('/api/admin/categories').send({ name: `${PREFIX}beverages` });
    expect(res.status).toBe(409);
    // Only the original row exists (no second casing variant).
    const rows = await db
      .select()
      .from(categories)
      .where(sql`LOWER(${categories.name}) = LOWER(${`${PREFIX}Beverages`})`);
    expect(rows.length).toBe(1);
  });
});

describe('PATCH /api/admin/categories/:id — rename bulk-updates products', () => {
  beforeEach(async () => {
    await cleanup();
    asAdmin();
  });

  it('updates every product that used the old name and leaves others untouched', async () => {
    const oldName = `${PREFIX}OldName`;
    const newName = `${PREFIX}NewName`;
    const otherName = `${PREFIX}Other`;
    const categoryId = await makeCategory(oldName);
    await makeCategory(otherName);

    const p1 = await makeProduct(oldName);
    const p2 = await makeProduct(oldName);
    const control = await makeProduct(otherName);

    const res = await request(app).patch(`/api/admin/categories/${categoryId}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
    expect(res.body.productsUpdated).toBe(2);

    // The category row was renamed.
    const [renamed] = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(renamed.name).toBe(newName);

    // Affected products now carry the new name.
    const updated = await db.select({ id: products.id, category: products.category })
      .from(products).where(inArray(products.id, [p1, p2]));
    expect(updated.every((p) => p.category === newName)).toBe(true);

    // The control product is unchanged.
    const [controlRow] = await db.select({ category: products.category }).from(products).where(eq(products.id, control));
    expect(controlRow.category).toBe(otherName);
  });

  it('rejects renaming to an existing name, case-insensitively (409)', async () => {
    const a = await makeCategory(`${PREFIX}Alpha`);
    await makeCategory(`${PREFIX}Bravo`);
    const res = await request(app).patch(`/api/admin/categories/${a}`).send({ name: `${PREFIX}BRAVO` });
    expect(res.status).toBe(409);
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, a));
    expect(unchanged.name).toBe(`${PREFIX}Alpha`);
  });
});

describe('DELETE /api/admin/categories/:id — clears category from products', () => {
  beforeEach(async () => {
    await cleanup();
    asAdmin();
  });

  it('removes the category and clears it from affected products, returning the count', async () => {
    const name = `${PREFIX}DelCat`;
    const otherName = `${PREFIX}KeepCat`;
    const categoryId = await makeCategory(name);
    await makeCategory(otherName);

    const p1 = await makeProduct(name);
    const p2 = await makeProduct(name);
    const control = await makeProduct(otherName);

    const res = await request(app).delete(`/api/admin/categories/${categoryId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.productsCleared).toBe(2);

    // Category row deleted.
    const rows = await db.select().from(categories).where(eq(categories.id, categoryId));
    expect(rows.length).toBe(0);

    // Affected products are now uncategorised.
    const cleared = await db.select({ id: products.id, category: products.category })
      .from(products).where(inArray(products.id, [p1, p2]));
    expect(cleared.every((p) => p.category === null)).toBe(true);

    // The control product keeps its category.
    const [controlRow] = await db.select({ category: products.category }).from(products).where(eq(products.id, control));
    expect(controlRow.category).toBe(otherName);
  });
});
