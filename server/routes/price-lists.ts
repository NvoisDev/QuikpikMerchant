import type { Express } from "express";
import {
  requireAuth, requireNotViewer, db, storage, z,
  priceLists, priceListItems, priceListAssignments,
  products, customerGroups, customerGroupMembers,
  wholesalerCustomerRelationships,
  PLAN_ENFORCEMENT_LIMITS, getPlanLimits,
} from "./shared";
import { eq, and, inArray, count as drizzleCount } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import {
  wrapCustomerEmail, emailCard, emailTable, emailButton,
  emailHeading, getEmailLogoUrl,
} from "../email-templates";
import { fetchLogoBuffer, buildBrandedWorkbook, buildBrandedPdf, type PriceRow } from '../utils/price-list-export';
import { whatsAppBusinessService } from "../whatsapp-simple";

// ── Internal helpers ────────────────────────────────────────────────────────

function resolveCustomPrice(
  basePrice: string,
  item: { customPrice: string | null; discountPercentage: string | null },
): number {
  const base = parseFloat(basePrice || "0");
  if (item.customPrice) return parseFloat(item.customPrice);
  if (item.discountPercentage) {
    const pct = parseFloat(item.discountPercentage);
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

function isPriceListActive(list: {
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}): boolean {
  if (!list.isActive) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (list.startDate && today < list.startDate) return false;
  if (list.endDate && today > list.endDate) return false;
  return true;
}

/** Return the wholesaler ID to use for tenant-scoped queries. */
function getWholesalerId(req: any): string {
  return req.user.role === "team_member" && req.user.wholesalerId
    ? req.user.wholesalerId
    : req.user.id;
}

// ── Excel workbook builder ───────────────────────────────────────────────────

async function getPriceListRows(wholesalerId: string, listId: number) {
  const [list] = await db
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.id, listId), eq(priceLists.wholesalerId, wholesalerId)));
  if (!list) throw new Error("Price list not found");

  const rawItems = await db
    .select()
    .from(priceListItems)
    .where(eq(priceListItems.priceListId, listId));

  const priceListMap = new Map<number, { unitPrice: number; customPalletPrice: number | null }>();
  for (const item of rawItems) {
    if (item.productId === null) continue;
    const product = await storage.getProduct(item.productId);
    if (!product) continue;
    const unitPrice = resolveCustomPrice(product.price, {
      customPrice: item.customPrice,
      discountPercentage: item.discountPercentage,
    });
    const customPalletPrice =
      item.customPalletPrice != null ? parseFloat(item.customPalletPrice) : null;
    priceListMap.set(item.productId, { unitPrice, customPalletPrice });
  }

  const allProducts = (await storage.getProducts(wholesalerId))
    .filter((p) => p.status === "active")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const buildRow = (p: any): PriceRow => {
    const hasPallets = p.palletPrice != null;
    const numericSize = p.unitSize != null ? String(parseFloat(String(p.unitSize))) : null;
    const unitDisplay = numericSize && p.unitOfMeasure
      ? `${numericSize}${p.unitOfMeasure}`
      : numericSize || p.unitOfMeasure || null;
    const packParts = [p.packQuantity, unitDisplay].filter(Boolean);
    const packSize = packParts.length > 0 ? packParts.join(' x ') : '—';
    const listEntry = priceListMap.get(p.id);
    const unitPrice = listEntry !== undefined ? listEntry.unitPrice : parseFloat(p.price || "0");
    const palletPrice: number | '' = hasPallets
      ? (listEntry?.customPalletPrice ?? parseFloat(p.palletPrice))
      : '';
    return {
      name: p.name || "—",
      packSize,
      unitPrice,
      palletPrice,
      unitsPerPallet: hasPallets && p.unitsPerPallet != null ? p.unitsPerPallet : '',
    };
  };

  const priceListRows = allProducts.filter((p) => priceListMap.has(p.id)).map(buildRow);
  const standardRows = allProducts.filter((p) => !priceListMap.has(p.id)).map(buildRow);
  return { list, rows: [...priceListRows, ...standardRows] };
}

async function fetchWholesalerBranding(wholesalerId: string) {
  const wholesaler = await storage.getUser(wholesalerId);
  const businessName = wholesaler?.businessName || 'Price List';
  const logoUrl = getEmailLogoUrl(wholesalerId, wholesaler?.logoType, wholesaler?.logoUrl, wholesaler?.updatedAt);
  let logoBuffer: Buffer | undefined;
  let logoExtension: 'png' | 'jpeg' | 'gif' | undefined;
  if (logoUrl) {
    const logoData = await fetchLogoBuffer(logoUrl);
    if (logoData) { logoBuffer = logoData.buffer; logoExtension = logoData.extension; }
  }
  return { businessName, logoBuffer, logoExtension };
}

async function buildPriceListWorkbook(wholesalerId: string, listId: number) {
  const { list, rows } = await getPriceListRows(wholesalerId, listId);
  const { businessName, logoBuffer, logoExtension } = await fetchWholesalerBranding(wholesalerId);
  const safeName = list.name.replace(/[/\\?%*:|"<>]/g, "-");
  const filename = `${safeName} - Price List.xlsx`;
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return buildBrandedWorkbook({ rows, subtitle: `${list.name} · ${dateStr}`, filename, logoBuffer, logoExtension, businessName });
}

async function buildPriceListPdf(wholesalerId: string, listId: number) {
  const { list, rows } = await getPriceListRows(wholesalerId, listId);
  const { businessName, logoBuffer } = await fetchWholesalerBranding(wholesalerId);
  const safeName = list.name.replace(/[/\\?%*:|"<>]/g, "-");
  const filename = `${safeName} - Price List.pdf`;
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pdfBuffer = await buildBrandedPdf({ rows, subtitle: `${list.name} · ${dateStr}`, logoBuffer, businessName });
  return { pdfBuffer, filename };
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerPriceListRoutes(app: Express): void {
  // GET /api/price-lists — list all price lists for this wholesaler
  app.get("/api/price-lists", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const lists = await db
        .select()
        .from(priceLists)
        .where(eq(priceLists.wholesalerId, wholesalerId))
        .orderBy(priceLists.createdAt);

      const enriched = await Promise.all(
        lists.map(async (list) => {
          const items = await db
            .select()
            .from(priceListItems)
            .where(eq(priceListItems.priceListId, list.id));
          const assignments = await db
            .select()
            .from(priceListAssignments)
            .where(eq(priceListAssignments.priceListId, list.id));
          return { ...list, itemCount: items.length, assignmentCount: assignments.length };
        }),
      );

      res.json(enriched);
    } catch (err) {
      console.error("Error fetching price lists:", err);
      res.status(500).json({ message: "Failed to fetch price lists" });
    }
  });

  // GET /api/price-lists/customer-summary — returns { [customerId]: { count, names } }
  // Must be registered before /:id to avoid the param swallowing "customer-summary"
  app.get("/api/price-lists/customer-summary", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);

      const lists = await db
        .select()
        .from(priceLists)
        .where(eq(priceLists.wholesalerId, wholesalerId));

      const summary: Record<string, { count: number; names: string[]; ids: number[]; directIds: number[] }> = {};

      // Fetch all assignments and group members in bulk to avoid N+1
      const allAssignments = lists.length > 0
        ? await db.select().from(priceListAssignments)
            .where(inArray(priceListAssignments.priceListId, lists.map((l) => l.id)))
        : [];

      const groupIds = Array.from(new Set(allAssignments
        .filter((a) => a.customerGroupId !== null)
        .map((a) => a.customerGroupId as number)));

      const allGroupMembers = groupIds.length > 0
        ? await db.select().from(customerGroupMembers)
            .where(inArray(customerGroupMembers.groupId, groupIds))
        : [];

      for (const list of lists) {
        const assignments = allAssignments.filter((a) => a.priceListId === list.id);
        const customerIds = new Set<string>();
        const directCustomerIds = new Set<string>();

        for (const a of assignments) {
          if (a.customerId) {
            customerIds.add(a.customerId);
            directCustomerIds.add(a.customerId);
          } else if (a.customerGroupId) {
            allGroupMembers
              .filter((m) => m.groupId === a.customerGroupId)
              .forEach((m) => customerIds.add(m.customerId));
          }
        }

        for (const cid of Array.from(customerIds)) {
          if (!summary[cid]) summary[cid] = { count: 0, names: [], ids: [], directIds: [] };
          summary[cid].count += 1;
          summary[cid].names.push(list.name as string);
          summary[cid].ids.push(list.id);
          if (directCustomerIds.has(cid)) summary[cid].directIds.push(list.id);
        }
      }

      res.json(summary);
    } catch (err) {
      console.error("Error fetching price list customer summary:", err);
      res.status(500).json({ message: "Failed to fetch price list customer summary" });
    }
  });

  // GET /api/price-lists/:id/export — download full product catalogue as XLSX
  // Must be registered before /:id to avoid param clash
  app.get("/api/price-lists/:id/export", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid price list ID" });

      const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';

      if (format === 'pdf') {
        const { pdfBuffer, filename } = await buildPriceListPdf(wholesalerId, id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
      }

      const { wb, filename } = await buildPriceListWorkbook(wholesalerId, id);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err: any) {
      console.error("Error exporting price list:", err);
      res.status(err.message === "Price list not found" ? 404 : 500).json({
        message: err.message || "Failed to export price list",
      });
    }
  });

  // GET /api/price-lists/:id — single price list with items and assignments
  app.get("/api/price-lists/:id", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [list] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!list) return res.status(404).json({ message: "Price list not found" });

      const rawItems = await db
        .select()
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, id));
      const assignments = await db
        .select()
        .from(priceListAssignments)
        .where(eq(priceListAssignments.priceListId, id));

      const enrichedItems = await Promise.all(
        rawItems.map(async (item) => ({
          ...item,
          product: await storage.getProduct(item.productId),
        })),
      );

      res.json({ ...list, items: enrichedItems, assignments });
    } catch (err) {
      console.error("Error fetching price list:", err);
      res.status(500).json({ message: "Failed to fetch price list" });
    }
  });

  // POST /api/price-lists — create
  app.post("/api/price-lists", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);

      // Enforce plan limit
      const user = await storage.getUser(wholesalerId);
      const tier = user?.subscriptionTier || 'free';
      const tierLimits = getPlanLimits(tier);
      if (tierLimits.priceLists !== -1) {
        const [countRow] = await db.select({ value: drizzleCount() }).from(priceLists)
          .where(and(eq(priceLists.wholesalerId, wholesalerId), eq(priceLists.isLocked, false)));
        const currentCount = countRow?.value ?? 0;
        if (currentCount >= tierLimits.priceLists) {
          return res.status(403).json({ message: `You've reached your plan limit of ${tierLimits.priceLists} price list${tierLimits.priceLists === 1 ? '' : 's'}. Upgrade to create more.` });
        }
      }

      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        startDate: z.string().optional().nullable().transform(v => v || null),
        endDate: z.string().optional().nullable().transform(v => v || null),
        isActive: z.boolean().optional().default(true),
      });
      const data = schema.parse(req.body);

      const [list] = await db
        .insert(priceLists)
        .values({
          wholesalerId,
          name: data.name,
          description: data.description ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          isActive: data.isActive ?? true,
        })
        .returning();

      res.json(list);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      console.error("Error creating price list:", err);
      res.status(500).json({ message: "Failed to create price list" });
    }
  });

  // PATCH /api/price-lists/:id — update metadata
  app.patch("/api/price-lists/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });
      if (existing.isLocked) return res.status(403).json({ message: "This price list is locked. Upgrade your plan to unlock it." });

      const { name, description, startDate, endDate, isActive } = req.body;
      const [updated] = await db
        .update(priceLists)
        .set({
          name: name ?? existing.name,
          description: description !== undefined ? description : existing.description,
          startDate: startDate !== undefined ? (startDate || null) : existing.startDate,
          endDate: endDate !== undefined ? (endDate || null) : existing.endDate,
          isActive: isActive !== undefined ? isActive : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(priceLists.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error("Error updating price list:", err);
      res.status(500).json({ message: "Failed to update price list" });
    }
  });

  // DELETE /api/price-lists/:id
  app.delete("/api/price-lists/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });

      await db.delete(priceLists).where(eq(priceLists.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting price list:", err);
      res.status(500).json({ message: "Failed to delete price list" });
    }
  });

  // PUT /api/price-lists/:id/items — replace all items
  // Security: verifies every productId belongs to this wholesaler
  app.put("/api/price-lists/:id/items", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });
      if (existing.isLocked) return res.status(403).json({ message: "This price list is locked. Upgrade your plan to unlock it." });

      const schema = z.array(
        z.object({
          productId: z.number(),
          customPrice: z.string().optional().nullable(),
          discountPercentage: z.string().optional().nullable(),
          customPalletPrice: z.string().optional().nullable(),
        }),
      );
      const items = schema.parse(req.body);

      // Verify all products belong to this wholesaler
      if (items.length > 0) {
        const productIds = items.map((i) => i.productId);
        const ownedProducts = await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.wholesalerId, wholesalerId),
              inArray(products.id, productIds),
            ),
          );
        const ownedIds = new Set(ownedProducts.map((p) => p.id));
        const unauthorized = productIds.find((pid) => !ownedIds.has(pid));
        if (unauthorized !== undefined) {
          return res.status(403).json({
            message: `Product ${unauthorized} does not belong to your account`,
          });
        }
      }

      await db.delete(priceListItems).where(eq(priceListItems.priceListId, id));
      if (items.length > 0) {
        await db.insert(priceListItems).values(
          items.map((item) => ({
            priceListId: id,
            productId: item.productId,
            customPrice: item.customPrice ?? null,
            discountPercentage: item.discountPercentage ?? null,
            customPalletPrice: item.customPalletPrice ?? null,
          })),
        );
      }

      const saved = await db
        .select()
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, id));
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      console.error("Error updating price list items:", err);
      res.status(500).json({ message: "Failed to update items" });
    }
  });

  // PUT /api/price-lists/:id/assignments — replace all assignments
  // Security: verifies every customerId has a relationship with this wholesaler
  // and every customerGroupId belongs to this wholesaler
  app.put("/api/price-lists/:id/assignments", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });
      if (existing.isLocked) return res.status(403).json({ message: "This price list is locked. Upgrade your plan to unlock it." });

      const schema = z.array(
        z.object({
          customerId: z.string().optional().nullable(),
          customerGroupId: z.number().optional().nullable(),
        }).refine(
          (a) => {
            const hasCustomer = !!a.customerId;
            const hasGroup = a.customerGroupId !== null && a.customerGroupId !== undefined;
            return hasCustomer !== hasGroup; // exactly one must be set (XOR)
          },
          { message: "Each assignment must target exactly one of: customerId or customerGroupId" },
        ),
      );
      const assignments = schema.parse(req.body);

      // Verify customer IDs — must have an active relationship with this wholesaler
      const customerIds = assignments
        .map((a) => a.customerId)
        .filter((c): c is string => !!c);
      if (customerIds.length > 0) {
        const validRels = await db
          .select({ customerId: wholesalerCustomerRelationships.customerId })
          .from(wholesalerCustomerRelationships)
          .where(
            and(
              eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
              inArray(wholesalerCustomerRelationships.customerId, customerIds),
            ),
          );
        const validIds = new Set(validRels.map((r) => r.customerId));
        const unauthorized = customerIds.find((cid) => !validIds.has(cid));
        if (unauthorized !== undefined) {
          return res.status(403).json({
            message: `Customer ${unauthorized} is not in your customer list`,
          });
        }
      }

      // Verify group IDs — groups must belong to this wholesaler
      const groupIds = assignments
        .map((a) => a.customerGroupId)
        .filter((g): g is number => g !== null && g !== undefined);
      if (groupIds.length > 0) {
        const validGroups = await db
          .select({ id: customerGroups.id })
          .from(customerGroups)
          .where(
            and(
              eq(customerGroups.wholesalerId, wholesalerId),
              inArray(customerGroups.id, groupIds),
            ),
          );
        const validGroupIds = new Set(validGroups.map((g) => g.id));
        const unauthorized = groupIds.find((gid) => !validGroupIds.has(gid));
        if (unauthorized !== undefined) {
          return res.status(403).json({
            message: `Group ${unauthorized} does not belong to your account`,
          });
        }
      }

      await db.delete(priceListAssignments).where(eq(priceListAssignments.priceListId, id));
      if (assignments.length > 0) {
        await db.insert(priceListAssignments).values(
          assignments.map((a) => ({
            priceListId: id,
            customerId: a.customerId ?? null,
            customerGroupId: a.customerGroupId ?? null,
          })),
        );
      }

      const saved = await db
        .select()
        .from(priceListAssignments)
        .where(eq(priceListAssignments.priceListId, id));
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      console.error("Error updating price list assignments:", err);
      res.status(500).json({ message: "Failed to update assignments" });
    }
  });

  // POST /api/price-lists/:id/customers/:customerId — atomically add one customer
  app.post("/api/price-lists/:id/customers/:customerId", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);
      const { customerId } = req.params;

      const [list] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!list) return res.status(404).json({ message: "Price list not found" });
      if (list.isLocked) return res.status(403).json({ message: "This price list is locked." });

      // Verify customer belongs to this wholesaler
      const [rel] = await db
        .select()
        .from(wholesalerCustomerRelationships)
        .where(
          and(
            eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
            eq(wholesalerCustomerRelationships.customerId, customerId),
          ),
        );
      if (!rel) return res.status(403).json({ message: "Customer not found in your account" });

      // Idempotent insert — skip if already assigned
      const [existing] = await db
        .select()
        .from(priceListAssignments)
        .where(
          and(
            eq(priceListAssignments.priceListId, id),
            eq(priceListAssignments.customerId, customerId),
          ),
        );
      if (!existing) {
        await db.insert(priceListAssignments).values({ priceListId: id, customerId, customerGroupId: null });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Error adding customer to price list:", err);
      res.status(500).json({ message: "Failed to add customer to price list" });
    }
  });

  // DELETE /api/price-lists/:id/customers/:customerId — atomically remove one customer
  app.delete("/api/price-lists/:id/customers/:customerId", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);
      const { customerId } = req.params;

      const [list] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!list) return res.status(404).json({ message: "Price list not found" });
      if (list.isLocked) return res.status(403).json({ message: "This price list is locked." });

      await db
        .delete(priceListAssignments)
        .where(
          and(
            eq(priceListAssignments.priceListId, id),
            eq(priceListAssignments.customerId, customerId),
          ),
        );

      res.json({ success: true });
    } catch (err) {
      console.error("Error removing customer from price list:", err);
      res.status(500).json({ message: "Failed to remove customer from price list" });
    }
  });

  // POST /api/price-lists/:id/share — send to all assigned customers
  app.post("/api/price-lists/:id/share", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = getWholesalerId(req);
      const id = parseInt(req.params.id);

      const [list] = await db
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, wholesalerId)));
      if (!list) return res.status(404).json({ message: "Price list not found" });

      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      // Build product list
      const rawItems = await db
        .select()
        .from(priceListItems)
        .where(eq(priceListItems.priceListId, id));
      const enrichedItems = (
        await Promise.all(
          rawItems.map(async (item) => ({
            ...item,
            product: await storage.getProduct(item.productId),
          })),
        )
      ).filter((i) => i.product !== undefined);

      if (enrichedItems.length === 0) {
        return res.status(400).json({
          message: "This price list has no products. Add some products first.",
        });
      }

      // Collect unique customer IDs from assignments (already validated on save)
      const assignments = await db
        .select()
        .from(priceListAssignments)
        .where(eq(priceListAssignments.priceListId, id));

      const customerIds = new Set<string>();
      for (const a of assignments) {
        if (a.customerId) customerIds.add(a.customerId);
        if (a.customerGroupId) {
          const members = await storage.getGroupMembers(a.customerGroupId);
          members.forEach((m) => customerIds.add(m.id));
        }
      }

      if (customerIds.size === 0) {
        return res.status(400).json({
          message: "No customers assigned to this price list. Assign customers first.",
        });
      }

      const storeUrl = `${req.protocol}://${req.get("host")}/customer/${wholesalerId}`;
      const businessName = wholesaler.businessName || "Your Supplier";
      const logoUrl = getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl);

      // Build Excel attachment once — same file for all assigned customers
      const { wb, filename: xlsxFilename } = await buildPriceListWorkbook(wholesalerId, id);
      const xlsxBase64: string = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
      const xlsxAttachment = {
        content: xlsxBase64,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: xlsxFilename,
        disposition: "attachment" as const,
      };

      let emailsSent = 0;
      let whatsappSent = 0;
      let errors = 0;

      for (const customerId of Array.from(customerIds)) {
        const customer = await storage.getUser(customerId);
        if (!customer) continue;

        const customerName =
          `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
          "Valued Customer";

        // Email
        if (customer.email) {
          try {
            const tableRows = enrichedItems.map((item) => {
              const p = item.product!;
              const effectivePrice = resolveCustomPrice(p.price, {
                customPrice: item.customPrice,
                discountPercentage: item.discountPercentage,
              });
              const standardPrice = parseFloat(p.price || "0");
              const hasDiscount = effectivePrice < standardPrice;
              const priceCell = hasDiscount
                ? `£${effectivePrice.toFixed(2)} <span style="color:#9ca3af;text-decoration:line-through;font-size:12px">£${standardPrice.toFixed(2)}</span>`
                : `£${effectivePrice.toFixed(2)}`;
              return [p.name, priceCell];
            });

            const body =
              emailHeading(`Your Exclusive Price List: ${list.name}`, {
                size: "20px",
                color: "#10b981",
              }) +
              `<p style="margin:0 0 16px">Dear ${customerName},</p>` +
              `<p style="margin:0 0 16px">${businessName} has prepared a special price list just for you. These prices are available exclusively for your account.</p>` +
              emailTable(["Product", "Your Price"], tableRows) +
              (list.startDate || list.endDate
                ? emailCard(
                    `<p style="margin:0;color:#92400e"><strong>Valid Period:</strong> ${list.startDate || "Now"} – ${list.endDate || "Until further notice"}</p>`,
                    { borderColor: "#fcd34d", bgColor: "#fffbeb" },
                  )
                : "") +
              emailCard(
                `<p style="margin:0;color:#0f766e">These prices are applied automatically when you shop with us. Just log in and order as normal.</p>`,
                { borderColor: "#a7f3d0", bgColor: "#ecfdf5" },
              ) +
              emailButton("Shop Now", storeUrl);

            const html = wrapCustomerEmail(
              body,
              { businessName, logoUrl },
              { preheader: `Your exclusive price list from ${businessName}` },
            );

            const sent = await sendEmail({
              to: customer.email,
              from: "hello@quikpik.co",
              subject: `Your Exclusive Price List: ${list.name} — ${businessName}`,
              html,
              attachments: [xlsxAttachment],
            });
            if (sent) emailsSent++;
          } catch (e) {
            console.error(`Email failed for ${customer.email}:`, e);
            errors++;
          }
        }

        // WhatsApp
        if (
          customer.phoneNumber &&
          wholesaler.whatsappAccessToken &&
          wholesaler.whatsappBusinessPhoneId
        ) {
          try {
            const productLines = enrichedItems
              .map((item) => {
                const p = item.product!;
                const effectivePrice = resolveCustomPrice(p.price, {
                  customPrice: item.customPrice,
                  discountPercentage: item.discountPercentage,
                });
                return `• ${p.name}: £${effectivePrice.toFixed(2)}`;
              })
              .join("\n");

            const message =
              `🏷️ *Your Exclusive Price List: ${list.name}*\n\n` +
              `Hi ${customerName},\n\n` +
              `${businessName} has prepared a special price list just for you:\n\n` +
              productLines +
              `\n\n` +
              (list.endDate ? `⏰ Valid until: ${list.endDate}\n\n` : "") +
              `These prices are applied automatically when you order.\n\n` +
              `🛒 Shop here: ${storeUrl}\n\n` +
              `Powered by Quikpik`;

            await whatsAppBusinessService.sendMessage(
              customer.phoneNumber,
              message,
              {
                accessToken: wholesaler.whatsappAccessToken,
                phoneNumberId: wholesaler.whatsappBusinessPhoneId,
              },
            );
            whatsappSent++;
          } catch (e) {
            console.error(`WhatsApp failed for ${customer.phoneNumber}:`, e);
            errors++;
          }
        }
      }

      res.json({
        success: true,
        totalCustomers: customerIds.size,
        emailsSent,
        whatsappSent,
        errors,
        message: `Price list shared with ${customerIds.size} customer${customerIds.size !== 1 ? "s" : ""}. ${emailsSent} email${emailsSent !== 1 ? "s" : ""} and ${whatsappSent} WhatsApp message${whatsappSent !== 1 ? "s" : ""} sent.`,
      });
    } catch (err) {
      console.error("Error sharing price list:", err);
      res.status(500).json({ message: "Failed to share price list" });
    }
  });
}
