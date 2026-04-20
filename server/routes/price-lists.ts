import type { Express } from "express";
import {
  requireAuth, requireNotViewer, db, storage, z,
  priceLists, priceListItems, priceListAssignments,
  products, customerGroups, customerGroupMembers,
  wholesalerCustomerRelationships,
} from "./shared";
import { eq, and, inArray } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import {
  wrapCustomerEmail, emailCard, emailTable, emailButton,
  emailHeading, getEmailLogoUrl,
} from "../email-templates";
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
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        startDate: z.string().optional().nullable(),
        endDate: z.string().optional().nullable(),
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

      const { name, description, startDate, endDate, isActive } = req.body;
      const [updated] = await db
        .update(priceLists)
        .set({
          name: name ?? existing.name,
          description: description !== undefined ? description : existing.description,
          startDate: startDate !== undefined ? startDate : existing.startDate,
          endDate: endDate !== undefined ? endDate : existing.endDate,
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

      const schema = z.array(
        z.object({
          productId: z.number(),
          customPrice: z.string().optional().nullable(),
          discountPercentage: z.string().optional().nullable(),
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

      const schema = z.array(
        z.object({
          customerId: z.string().optional().nullable(),
          customerGroupId: z.number().optional().nullable(),
        }),
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

      let emailsSent = 0;
      let whatsappSent = 0;
      let errors = 0;

      for (const customerId of customerIds) {
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
