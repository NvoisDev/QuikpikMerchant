import type { Express } from "express";
import { ADMIN_EMAILS, and, asc, db, eq, getAdminEmail, products, requireAuth, sql } from "./shared";
import { categories } from "@shared/schema";

const MAX_CATEGORY_NAME_LENGTH = 60;

function isAdmin(req: any): boolean {
  return ADMIN_EMAILS.includes(getAdminEmail(req) || "");
}

// Returns a trimmed name or an error message describing why it is invalid.
function validateName(raw: unknown): { name: string } | { error: string } {
  const name = (raw ?? "").toString().trim();
  if (!name) return { error: "Category name is required" };
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { error: `Category name must be ${MAX_CATEGORY_NAME_LENGTH} characters or less` };
  }
  return { name };
}

export function registerCategoryRoutes(app: Express): void {
  // GET /api/categories — PUBLIC. The central list is readable by everyone,
  // including unauthenticated storefront visitors. Includes a product count.
  // products.category is free text, so older products may have been saved with a
  // different casing/whitespace ("beverages & drinks" vs "Beverages & Drinks").
  // Match case- and whitespace-insensitively so those legacy variants are counted.
  app.get("/api/categories", async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          productCount: sql<number>`COUNT(${products.id})::int`,
        })
        .from(categories)
        .leftJoin(
          products,
          sql`LOWER(TRIM(${products.category})) = LOWER(TRIM(${categories.name}))`,
        )
        .groupBy(categories.id, categories.name)
        .orderBy(asc(categories.name));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // POST /api/admin/categories — central admin only. Add a new category.
  app.post("/api/admin/categories", requireAuth, async (req: any, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });

      const result = validateName(req.body?.name);
      if ("error" in result) return res.status(400).json({ error: result.error });
      const { name } = result;

      const existing = await db
        .select({ id: categories.id })
        .from(categories)
        .where(sql`LOWER(${categories.name}) = LOWER(${name})`);
      if (existing.length > 0) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }

      const [created] = await db.insert(categories).values({ name }).returning();
      res.status(201).json(created);
    } catch (error: any) {
      // DB-level backstop for the case-insensitive unique index (concurrent add race).
      if (error?.code === "23505") {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  // PATCH /api/admin/categories/:id — central admin only. Rename a category and
  // bulk-update every product that used the old name to the new name.
  app.patch("/api/admin/categories/:id", requireAuth, async (req: any, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid category ID" });

      const result = validateName(req.body?.name);
      if ("error" in result) return res.status(400).json({ error: result.error });
      const { name } = result;

      const [existing] = await db.select().from(categories).where(eq(categories.id, id));
      if (!existing) return res.status(404).json({ error: "Category not found" });

      // Case-insensitive duplicate check, excluding the row being renamed.
      const dup = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(sql`LOWER(${categories.name}) = LOWER(${name})`, sql`${categories.id} <> ${id}`));
      if (dup.length > 0) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }

      let productsUpdated = 0;
      await db.transaction(async (tx) => {
        await tx.update(categories).set({ name }).where(eq(categories.id, id));
        // Update every product that used the old name, including legacy
        // case/whitespace variants ("beverages & drinks" vs "Beverages & Drinks").
        const updated = await tx
          .update(products)
          .set({ category: name })
          .where(
            and(
              sql`LOWER(TRIM(${products.category})) = LOWER(TRIM(${existing.name}))`,
              sql`${products.category} <> ${name}`,
            ),
          )
          .returning({ id: products.id });
        productsUpdated = updated.length;
      });

      res.json({ id, name, productsUpdated });
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      console.error("Error renaming category:", error);
      res.status(500).json({ error: "Failed to rename category" });
    }
  });

  // DELETE /api/admin/categories/:id — central admin only. Delete a category and
  // clear it from every product that used it (those products become uncategorised).
  app.delete("/api/admin/categories/:id", requireAuth, async (req: any, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid category ID" });

      const [existing] = await db.select().from(categories).where(eq(categories.id, id));
      if (!existing) return res.status(404).json({ error: "Category not found" });

      let productsCleared = 0;
      await db.transaction(async (tx) => {
        // Clear the category from every product that used it, including legacy
        // case/whitespace variants ("beverages & drinks" vs "Beverages & Drinks").
        const cleared = await tx
          .update(products)
          .set({ category: null })
          .where(sql`LOWER(TRIM(${products.category})) = LOWER(TRIM(${existing.name}))`)
          .returning({ id: products.id });
        productsCleared = cleared.length;
        await tx.delete(categories).where(eq(categories.id, id));
      });

      res.json({ success: true, productsCleared });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });
}
