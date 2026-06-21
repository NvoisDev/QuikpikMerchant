import type { Express } from "express";
import { db } from "../db";
import { users, products, storeEnquiries } from "@shared/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "../sendgrid-service";
import { requireAuth } from "../googleAuth";
import { resolveShortPaymentLink } from "../shortPaymentLink";

export function registerPublicStoreRoutes(app: Express) {

  // GET /api/public/homepage-wholesalers
  // Returns wholesalers who have opted in to appear on the landing page logo strip (no auth required)
  app.get("/api/public/homepage-wholesalers", async (_req, res) => {
    try {
      const wholesalers = await db
        .select({
          id: users.id,
          businessName: users.businessName,
          logoUrl: users.logoUrl,
          logoType: users.logoType,
        })
        .from(users)
        .where(
          and(
            eq(users.showOnHomepage, true),
            eq(users.isInactive, false),
            eq(users.role, 'wholesaler')
          )
        );

      return res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching homepage wholesalers:", error);
      return res.status(500).json({ message: "Failed to fetch wholesalers" });
    }
  });

  // GET /api/public/wholesaler/:slug
  // Returns public wholesaler info + their public products (no auth required)
  app.get("/api/public/wholesaler/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      // Resolve by slug or ID
      const [wholesaler] = await db
        .select({
          id: users.id,
          businessName: users.businessName,
          logoUrl: users.logoUrl,
          logoType: users.logoType,
          storeTagline: users.storeTagline,
          storeDescription: users.storeDescription,
          storeSlug: users.storeSlug,
          storeVisibility: users.storeVisibility,
          priceDisplayMode: users.priceDisplayMode,
          moqVisible: users.moqVisible,
          stockVisible: users.stockVisible,
          packSizeVisible: users.packSizeVisible,
          deliveryRegions: users.deliveryRegions,
          city: users.city,
          country: users.country,
          enableDelivery: users.enableDelivery,
          enablePickup: users.enablePickup,
          deliveryNote: users.deliveryNote,
          preferredCurrency: users.preferredCurrency,
          isInactive: users.isInactive,
          enquiriesEnabled: users.enquiriesEnabled,
          minOrderAmount: users.minOrderAmount,
          allowQuoteRequests: users.allowQuoteRequests,
          whatsappContactVisible: users.whatsappContactVisible,
        })
        .from(users)
        .where(
          and(
            or(eq(users.storeSlug, slug), eq(users.id, slug)),
            eq(users.storeVisibility, 'public'),
            eq(users.isInactive, false)
          )
        );

      if (!wholesaler) {
        return res.status(404).json({ message: "Store not found or not public" });
      }

      // Fetch their public products
      const publicProducts = await db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          price: products.price,
          palletPrice: products.palletPrice,
          category: products.category,
          imageUrl: products.imageUrl,
          images: products.images,
          unitsPerPack: products.quantityInPack,
          unitsPerPallet: products.unitsPerPallet,
          stock: products.stock,
          palletStock: products.palletStock,
          minOrderQuantity: products.moq,
          unitWeightKg: products.unitWeightKg,
          totalPackageWeight: products.totalPackageWeight,
          packQuantity: products.packQuantity,
        })
        .from(products)
        .where(
          and(
            eq(products.wholesalerId, wholesaler.id),
            eq(products.status, 'active')
          )
        )
        .orderBy(products.name);

      // Redact fields the wholesaler has chosen to hide so they never reach public clients
      const showPrices = (wholesaler.priceDisplayMode ?? 'hidden') === 'shown';
      const showMoq = wholesaler.moqVisible !== false;
      const showStock = wholesaler.stockVisible === true;
      const showPackSize = wholesaler.packSizeVisible !== false;
      const sanitizedProducts = publicProducts.map((p) => ({
        ...p,
        price: showPrices ? p.price : null,
        palletPrice: showPrices ? p.palletPrice : null,
        minOrderQuantity: showMoq ? p.minOrderQuantity : null,
        stock: showStock ? p.stock : null,
        palletStock: showStock ? p.palletStock : null,
        unitsPerPack: showPackSize ? p.unitsPerPack : null,
        unitsPerPallet: showPackSize ? p.unitsPerPallet : null,
        unitWeightKg: showPackSize ? p.unitWeightKg : null,
        totalPackageWeight: showPackSize ? p.totalPackageWeight : null,
        packQuantity: showPackSize ? p.packQuantity : null,
      }));

      res.json({ wholesaler, products: sanitizedProducts });
    } catch (err) {
      console.error("Error fetching public wholesaler:", err);
      res.status(500).json({ message: "Failed to load store" });
    }
  });

  // GET /api/public/search?q=&category=&page=
  // Cross-wholesaler product search (only public stores)
  app.get("/api/public/search", async (req, res) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      const category = ((req.query.category as string) || '').trim();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = 24;
      const offset = (page - 1) * limit;

      // Build conditions
      const conditions = [
        eq(users.storeVisibility, 'public'),
        eq(users.isInactive, false),
        eq(products.status, 'active'),
      ] as any[];

      if (q) {
        conditions.push(
          or(
            ilike(products.name, `%${q}%`),
            ilike(products.category, `%${q}%`),
            ilike(products.description, `%${q}%`),
            ilike(users.businessName, `%${q}%`)
          )
        );
      }

      if (category) {
        conditions.push(ilike(products.category, `%${category}%`));
      }

      const rows = await db
        .select({
          productId: products.id,
          productName: products.name,
          category: products.category,
          imageUrl: products.imageUrl,
          images: products.images,
          price: products.price,
          minOrderQuantity: products.moq,
          unitsPerPack: products.quantityInPack,
          wholesalerId: users.id,
          businessName: users.businessName,
          storeSlug: users.storeSlug,
          logoUrl: users.logoUrl,
          priceDisplayMode: users.priceDisplayMode,
          city: users.city,
        })
        .from(products)
        .innerJoin(users, eq(products.wholesalerId, users.id))
        .where(and(...conditions))
        .orderBy(products.name)
        .limit(limit)
        .offset(offset);

      // Get categories for filter chips
      const categoryRows = await db
        .selectDistinct({ category: products.category })
        .from(products)
        .innerJoin(users, eq(products.wholesalerId, users.id))
        .where(
          and(
            eq(users.storeVisibility, 'public'),
            eq(users.isInactive, false),
            eq(products.status, 'active'),
            sql`${products.category} is not null and ${products.category} != ''`
          )
        )
        .orderBy(products.category);

      res.json({
        results: rows,
        categories: categoryRows.map(r => r.category).filter(Boolean),
        page,
        hasMore: rows.length === limit,
      });
    } catch (err) {
      console.error("Error in public search:", err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // POST /api/public/enquiry
  // Submit a quote/contact enquiry from the public storefront
  app.post("/api/public/enquiry", async (req, res) => {
    try {
      const schema = z.object({
        wholesalerId: z.string().min(1),
        enquirerName: z.string().min(1),
        enquirerEmail: z.string().email().optional().or(z.literal('')).transform(v => v || null),
        enquirerPhone: z.string().optional().transform(v => v || null),
        enquirerBusiness: z.string().optional().transform(v => v || null),
        businessType: z.string().optional().transform(v => v || null),
        estimatedOrderVolume: z.string().optional().transform(v => v || null),
        preferredContact: z.string().optional().transform(v => v || null),
        message: z.string().optional().transform(v => v || null),
        productId: z.number().optional().nullable(),
        productName: z.string().optional().transform(v => v || null),
        quantity: z.number().optional().nullable(),
      });

      const data = schema.parse(req.body);

      // Verify the wholesaler is public
      const [wholesaler] = await db
        .select({ id: users.id, storeVisibility: users.storeVisibility, email: users.email, businessName: users.businessName, enquiriesEnabled: users.enquiriesEnabled })
        .from(users)
        .where(eq(users.id, data.wholesalerId));

      if (!wholesaler || wholesaler.storeVisibility !== 'public') {
        return res.status(404).json({ message: "Store not found" });
      }

      if (wholesaler.enquiriesEnabled === false) {
        return res.status(403).json({ message: "Enquiries are not currently enabled for this store" });
      }

      const [enquiry] = await db
        .insert(storeEnquiries)
        .values({
          wholesalerId: data.wholesalerId,
          enquirerName: data.enquirerName,
          enquirerEmail: data.enquirerEmail ?? null,
          enquirerPhone: data.enquirerPhone ?? null,
          enquirerBusiness: data.enquirerBusiness ?? null,
          businessType: data.businessType ?? null,
          estimatedOrderVolume: data.estimatedOrderVolume ?? null,
          preferredContact: data.preferredContact ?? null,
          message: data.message ?? null,
          productId: data.productId ?? null,
          productName: data.productName ?? null,
          quantity: data.quantity ?? null,
          status: 'new',
        })
        .returning();

      // Email notification to wholesaler
      if (wholesaler.email) {
        try {
          const businessLabel = data.enquirerBusiness ? ` from ${data.enquirerBusiness}` : '';
          const productLine = data.productName ? `<p><strong>Product interest:</strong> ${data.productName}${data.quantity ? ` (qty: ${data.quantity})` : ''}</p>` : '';
          const volumeLine = data.estimatedOrderVolume ? `<p><strong>Estimated order value:</strong> ${data.estimatedOrderVolume}</p>` : '';
          const businessTypeLine = data.businessType ? `<p><strong>Business type:</strong> ${data.businessType}</p>` : '';
          const contactLine = data.preferredContact ? `<p><strong>Preferred contact:</strong> ${data.preferredContact}</p>` : '';
          const messageLine = data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : '';

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `New lead${businessLabel} — ${data.enquirerName}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                <h2 style="color:#16a34a;margin-bottom:4px">New Wholesale Enquiry</h2>
                <p style="color:#6b7280;margin-bottom:20px">Someone found your store on Quikpik and wants to connect.</p>
                <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:16px">
                  <p><strong>Name:</strong> ${data.enquirerName}</p>
                  ${data.enquirerBusiness ? `<p><strong>Business:</strong> ${data.enquirerBusiness}</p>` : ''}
                  ${businessTypeLine}
                  ${data.enquirerPhone ? `<p><strong>Phone/WhatsApp:</strong> ${data.enquirerPhone}</p>` : ''}
                  ${data.enquirerEmail ? `<p><strong>Email:</strong> ${data.enquirerEmail}</p>` : ''}
                  ${contactLine}
                </div>
                ${productLine || volumeLine || messageLine ? `
                <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:16px">
                  ${productLine}${volumeLine}${messageLine}
                </div>` : ''}
                <a href="https://quikpik.app/leads" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Leads Inbox →</a>
              </div>
            `,
          });
        } catch (emailErr) {
          console.warn("Failed to send lead email notification:", emailErr);
        }
      }

      res.json({ success: true, enquiryId: enquiry.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      }
      console.error("Error saving enquiry:", err);
      res.status(500).json({ message: "Failed to submit enquiry" });
    }
  });

  // GET /api/public/enquiries — wholesaler views their own leads (auth required)
  app.get("/api/public/enquiries", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user?.id || req.user?.claims?.sub;
      if (!wholesalerId) return res.status(401).json({ message: "Unauthorised" });

      const enquiries = await db
        .select()
        .from(storeEnquiries)
        .where(eq(storeEnquiries.wholesalerId, wholesalerId))
        .orderBy(sql`${storeEnquiries.createdAt} desc`);

      res.json(enquiries);
    } catch (err) {
      console.error("Error fetching enquiries:", err);
      res.status(500).json({ message: "Failed to fetch enquiries" });
    }
  });

  // PATCH /api/public/enquiries/:id — mark viewed/responded
  app.patch("/api/public/enquiries/:id", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user?.id || req.user?.claims?.sub;
      if (!wholesalerId) return res.status(401).json({ message: "Unauthorised" });

      const id = parseInt(req.params.id);
      const { status } = req.body;

      const [updated] = await db
        .update(storeEnquiries)
        .set({ status })
        .where(and(eq(storeEnquiries.id, id), eq(storeEnquiries.wholesalerId, wholesalerId)))
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update" });
    }
  });

  // GET /pay/:code — short payment link redirect (no auth required)
  app.get("/pay/:code", async (req, res) => {
    const { code } = req.params;
    if (!code || !/^[A-Za-z0-9_-]{6,16}$/.test(code)) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>Invalid link</h2>
          <p>This payment link is not valid. Please contact your supplier for a new link.</p>
        </body></html>
      `);
    }
    const url = await resolveShortPaymentLink(code);
    if (!url) {
      return res.status(410).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>Link expired</h2>
          <p>This payment link has expired. Please contact your supplier to request a new one.</p>
        </body></html>
      `);
    }
    return res.redirect(302, url);
  });
}
