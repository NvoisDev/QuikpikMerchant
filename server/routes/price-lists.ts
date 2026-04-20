import type { Express } from "express";
import { requireAuth, requireNotViewer, db, storage, z } from "./shared";
import { priceLists, priceListItems, priceListAssignments, products, customerGroups, customerGroupMembers } from "@shared/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import { wrapCustomerEmail, emailCard, emailTable, emailButton, emailHeading, getEmailLogoUrl } from "../email-templates";
import { whatsAppBusinessService } from "../whatsapp-simple";

// Helper: resolve effective price for a product given a price list item
function resolveCustomPrice(basePrice: string, item: { customPrice: string | null; discountPercentage: string | null }): number {
  const base = parseFloat(basePrice || "0");
  if (item.customPrice) return parseFloat(item.customPrice);
  if (item.discountPercentage) {
    const pct = parseFloat(item.discountPercentage);
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

// Helper: check if a price list is currently active (date range)
function isPriceListActive(list: { isActive: boolean; startDate: string | null; endDate: string | null }): boolean {
  if (!list.isActive) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (list.startDate && today < list.startDate) return false;
  if (list.endDate && today > list.endDate) return false;
  return true;
}

export function registerPriceListRoutes(app: Express): void {
  // GET /api/price-lists — list all price lists for this wholesaler
  app.get("/api/price-lists", requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      const lists = await db.select().from(priceLists)
        .where(eq(priceLists.wholesalerId, targetUserId))
        .orderBy(priceLists.createdAt);

      // For each list, fetch item count and assignment count
      const enriched = await Promise.all(lists.map(async (list) => {
        const items = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, list.id));
        const assignments = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, list.id));
        return { ...list, itemCount: items.length, assignmentCount: assignments.length };
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Error fetching price lists:", err);
      res.status(500).json({ message: "Failed to fetch price lists" });
    }
  });

  // GET /api/price-lists/:id — get a single price list with items and assignments
  app.get("/api/price-lists/:id", requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [list] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));

      if (!list) return res.status(404).json({ message: "Price list not found" });

      const items = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, id));
      const assignments = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, id));

      // Enrich items with product info
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return { ...item, product };
      }));

      res.json({ ...list, items: enrichedItems, assignments });
    } catch (err) {
      console.error("Error fetching price list:", err);
      res.status(500).json({ message: "Failed to fetch price list" });
    }
  });

  // POST /api/price-lists — create a price list
  app.post("/api/price-lists", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
        isActive: z.boolean().optional().default(true),
      });

      const data = schema.parse(req.body);
      const [list] = await db.insert(priceLists).values({
        wholesalerId: targetUserId,
        name: data.name,
        description: data.description ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        isActive: data.isActive ?? true,
      }).returning();

      res.json(list);
    } catch (err) {
      console.error("Error creating price list:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to create price list" });
    }
  });

  // PATCH /api/price-lists/:id — update a price list
  app.patch("/api/price-lists/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [existing] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });

      const { name, description, startDate, endDate, isActive } = req.body;
      const [updated] = await db.update(priceLists).set({
        name: name ?? existing.name,
        description: description !== undefined ? description : existing.description,
        startDate: startDate !== undefined ? startDate : existing.startDate,
        endDate: endDate !== undefined ? endDate : existing.endDate,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        updatedAt: new Date(),
      }).where(eq(priceLists.id, id)).returning();

      res.json(updated);
    } catch (err) {
      console.error("Error updating price list:", err);
      res.status(500).json({ message: "Failed to update price list" });
    }
  });

  // DELETE /api/price-lists/:id — delete a price list
  app.delete("/api/price-lists/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [existing] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });

      await db.delete(priceLists).where(eq(priceLists.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting price list:", err);
      res.status(500).json({ message: "Failed to delete price list" });
    }
  });

  // PUT /api/price-lists/:id/items — replace all items in a price list
  app.put("/api/price-lists/:id/items", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [existing] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });

      const schema = z.array(z.object({
        productId: z.number(),
        customPrice: z.string().optional().nullable(),
        discountPercentage: z.string().optional().nullable(),
      }));

      const items = schema.parse(req.body);

      // Replace all items
      await db.delete(priceListItems).where(eq(priceListItems.priceListId, id));
      if (items.length > 0) {
        await db.insert(priceListItems).values(items.map((item) => ({
          priceListId: id,
          productId: item.productId,
          customPrice: item.customPrice ?? null,
          discountPercentage: item.discountPercentage ?? null,
        })));
      }

      const saved = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, id));
      res.json(saved);
    } catch (err) {
      console.error("Error updating price list items:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to update items" });
    }
  });

  // PUT /api/price-lists/:id/assignments — replace all assignments
  app.put("/api/price-lists/:id/assignments", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [existing] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));
      if (!existing) return res.status(404).json({ message: "Price list not found" });

      const schema = z.array(z.object({
        customerId: z.string().optional().nullable(),
        customerGroupId: z.number().optional().nullable(),
      }));

      const assignments = schema.parse(req.body);

      await db.delete(priceListAssignments).where(eq(priceListAssignments.priceListId, id));
      if (assignments.length > 0) {
        await db.insert(priceListAssignments).values(assignments.map((a) => ({
          priceListId: id,
          customerId: a.customerId ?? null,
          customerGroupId: a.customerGroupId ?? null,
        })));
      }

      const saved = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, id));
      res.json(saved);
    } catch (err) {
      console.error("Error updating price list assignments:", err);
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: err.errors });
      res.status(500).json({ message: "Failed to update assignments" });
    }
  });

  // POST /api/price-lists/:id/share — send the price list to all assigned customers via WhatsApp + email
  app.post("/api/price-lists/:id/share", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === "team_member" && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const id = parseInt(req.params.id);

      const [list] = await db.select().from(priceLists)
        .where(and(eq(priceLists.id, id), eq(priceLists.wholesalerId, targetUserId)));
      if (!list) return res.status(404).json({ message: "Price list not found" });

      const wholesaler = await storage.getUser(targetUserId);
      if (!wholesaler) return res.status(404).json({ message: "Wholesaler not found" });

      // Get items with product details
      const items = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, id));
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return { ...item, product };
      }));
      const validItems = enrichedItems.filter(i => i.product);

      if (validItems.length === 0) {
        return res.status(400).json({ message: "This price list has no products. Add some products first." });
      }

      // Collect all assigned customers (direct + via groups)
      const assignments = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, id));
      const customerIds = new Set<string>();

      for (const a of assignments) {
        if (a.customerId) customerIds.add(a.customerId);
        if (a.customerGroupId) {
          const members = await storage.getGroupMembers(a.customerGroupId);
          members.forEach(m => customerIds.add(m.id));
        }
      }

      if (customerIds.size === 0) {
        return res.status(400).json({ message: "No customers assigned to this price list. Assign customers first." });
      }

      const storeUrl = `${req.protocol}://${req.get("host")}/customer/${targetUserId}`;
      const businessName = wholesaler.businessName || "Your Supplier";
      const logoUrl = getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl);

      let emailsSent = 0;
      let whatsappSent = 0;
      let errors = 0;

      for (const customerId of customerIds) {
        const customer = await storage.getUser(customerId);
        if (!customer) continue;

        const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Valued Customer";

        // Build product table rows for email
        const tableRows = validItems.map(item => {
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

        // Email
        if (customer.email) {
          try {
            const body =
              emailHeading(`Your Exclusive Price List: ${list.name}`, { size: "20px", color: "#10b981" }) +
              `<p style="margin:0 0 16px">Dear ${customerName},</p>` +
              `<p style="margin:0 0 16px">${businessName} has put together a special price list just for you. These prices are available exclusively for your account.</p>` +
              emailTable(["Product", "Your Price"], tableRows) +
              (list.startDate || list.endDate
                ? emailCard(
                    `<p style="margin:0;color:#92400e"><strong>Valid Period:</strong> ${list.startDate || "Now"} – ${list.endDate || "Until further notice"}</p>`,
                    { borderColor: "#fcd34d", bgColor: "#fffbeb" }
                  )
                : "") +
              emailCard(
                `<p style="margin:0;color:#0f766e">These prices are applied automatically when you shop with us. Just log in and order as normal.</p>`,
                { borderColor: "#a7f3d0", bgColor: "#ecfdf5" }
              ) +
              emailButton("Shop Now", storeUrl);

            const html = wrapCustomerEmail(body, { businessName, logoUrl }, {
              preheader: `Your exclusive price list from ${businessName}`,
            });

            const sent = await sendEmail({
              to: customer.email,
              from: "hello@quikpik.co",
              subject: `Your Exclusive Price List: ${list.name} — ${businessName}`,
              html,
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
            const productLines = validItems.map(item => {
              const p = item.product!;
              const effectivePrice = resolveCustomPrice(p.price, {
                customPrice: item.customPrice,
                discountPercentage: item.discountPercentage,
              });
              return `• ${p.name}: £${effectivePrice.toFixed(2)}`;
            }).join("\n");

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
              }
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

  // GET /api/price-lists/resolve/:customerId — resolve effective prices for a customer
  // Used by the customer portal products endpoint to inject custom prices
  // (internal use — no auth guard, called server-to-server)
  app.get("/api/price-lists/resolve/:wholesalerId/:customerId", async (req, res) => {
    try {
      const { wholesalerId, customerId } = req.params;

      // Find active price lists for this wholesaler
      const lists = await db.select().from(priceLists)
        .where(eq(priceLists.wholesalerId, wholesalerId));

      const activeLists = lists.filter(isPriceListActive);
      if (activeLists.length === 0) return res.json({});

      // Find which lists are assigned to this customer (direct or via group)
      // Get customer groups for this customer under this wholesaler
      const allGroupRows = await db.select().from(customerGroupMembers)
        .where(eq(customerGroupMembers.customerId, customerId));
      const groupIds = allGroupRows.map(r => r.groupId);

      const activeListIds = activeLists.map(l => l.id);

      // Find assignments
      const assignments = await db.select().from(priceListAssignments)
        .where(eq(priceListAssignments.priceListId, activeListIds[0]));

      // Do broader search
      let matchingListIds: number[] = [];
      for (const listId of activeListIds) {
        const assigns = await db.select().from(priceListAssignments)
          .where(eq(priceListAssignments.priceListId, listId));

        const isAssigned = assigns.some(a =>
          a.customerId === customerId ||
          (a.customerGroupId !== null && groupIds.includes(a.customerGroupId))
        );
        if (isAssigned) matchingListIds.push(listId);
      }

      if (matchingListIds.length === 0) return res.json({});

      // Get all items from matching lists and build a productId → effective price map
      // If multiple lists have the same product, prefer the cheapest (most favourable) price
      const priceMap: Record<number, { customPrice: number; standardPrice: number }> = {};

      for (const listId of matchingListIds) {
        const items = await db.select().from(priceListItems)
          .where(eq(priceListItems.priceListId, listId));

        for (const item of items) {
          const product = await storage.getProduct(item.productId);
          if (!product) continue;
          const effectivePrice = resolveCustomPrice(product.price, {
            customPrice: item.customPrice,
            discountPercentage: item.discountPercentage,
          });
          const standardPrice = parseFloat(product.price || "0");
          // Keep the most favourable price if product appears in multiple lists
          if (!priceMap[item.productId] || effectivePrice < priceMap[item.productId].customPrice) {
            priceMap[item.productId] = { customPrice: effectivePrice, standardPrice };
          }
        }
      }

      res.json(priceMap);
    } catch (err) {
      console.error("Error resolving prices:", err);
      res.json({});
    }
  });
}
