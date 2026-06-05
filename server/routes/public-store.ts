import type { Express } from "express";
import { db } from "../db";
import { users, products, storeEnquiries } from "@shared/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import sgMail from "@sendgrid/mail";

export function registerPublicStoreRoutes(app: Express) {

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
          deliveryRegions: users.deliveryRegions,
          city: users.city,
          country: users.country,
          enableDelivery: users.enableDelivery,
          enablePickup: users.enablePickup,
          deliveryNote: users.deliveryNote,
          preferredCurrency: users.preferredCurrency,
          isInactive: users.isInactive,
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
          unitsPerPack: products.unitsPerPack,
          unitsPerPallet: products.unitsPerPallet,
          baseUnitStock: products.baseUnitStock,
          minOrderQuantity: products.minOrderQuantity,
          sku: products.sku,
        })
        .from(products)
        .where(
          and(
            eq(products.wholesalerId, wholesaler.id),
            eq(products.archived, false)
          )
        )
        .orderBy(products.name);

      res.json({ wholesaler, products: publicProducts });
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
        eq(products.archived, false),
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
          minOrderQuantity: products.minOrderQuantity,
          unitsPerPack: products.unitsPerPack,
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
            eq(products.archived, false),
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
        .select({ id: users.id, storeVisibility: users.storeVisibility, email: users.email, businessName: users.businessName })
        .from(users)
        .where(eq(users.id, data.wholesalerId));

      if (!wholesaler || wholesaler.storeVisibility !== 'public') {
        return res.status(404).json({ message: "Store not found" });
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

          await sgMail.send({
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
  app.get("/api/public/enquiries", async (req: any, res) => {
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
  app.patch("/api/public/enquiries/:id", async (req: any, res) => {
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
}
