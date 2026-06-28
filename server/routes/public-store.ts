import type { Express } from "express";
import { db } from "../db";
import { users, products, storeEnquiries, orders, orderItems, deliveryAddresses } from "@shared/schema";
import { eq, and, ilike, or, sql, inArray } from "drizzle-orm";
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
          whatsappContactVisible: users.whatsappContactVisible,
          phoneNumber: users.phoneNumber,
          isVerified: users.isVerified,
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

      // Redact PII that the wholesaler has chosen to hide
      if (wholesaler.whatsappContactVisible === false) {
        (wholesaler as Record<string, unknown>).phoneNumber = null;
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

  // POST /api/public/cart-quote
  // Customer submits their full cart as a quote request.
  // Creates a provisional customer + draft order with line items + a storeEnquiry linked to it.
  app.post("/api/public/cart-quote", async (req, res) => {
    try {
      const schema = z.object({
        wholesalerId: z.string().min(1),
        enquirerName: z.string().min(1),
        enquirerPhone: z.string().optional().transform(v => v?.trim() || null),
        enquirerEmail: z.string().email().optional().or(z.literal('')).transform(v => v || null),
        enquirerBusiness: z.string().optional().transform(v => v?.trim() || null),
        items: z.array(z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive(),
          sellingType: z.string().default('units'),
        })).min(1),
      });

      const data = schema.parse(req.body);

      if (!data.enquirerPhone && !data.enquirerEmail) {
        return res.status(400).json({ message: "Phone or email is required" });
      }

      const [wholesaler] = await db
        .select({
          id: users.id,
          storeVisibility: users.storeVisibility,
          email: users.email,
          businessName: users.businessName,
          enquiriesEnabled: users.enquiriesEnabled,
          preferredCurrency: users.preferredCurrency,
        })
        .from(users)
        .where(eq(users.id, data.wholesalerId));

      if (!wholesaler || wholesaler.storeVisibility !== 'public') {
        return res.status(404).json({ message: "Store not found" });
      }
      if (wholesaler.enquiriesEnabled === false) {
        return res.status(403).json({ message: "Enquiries are not currently enabled for this store" });
      }

      // Validate all products exist and belong to this wholesaler
      const productIds = data.items.map(i => i.productId);
      const productRows = await db
        .select({ id: products.id, name: products.name, price: products.price, palletPrice: products.palletPrice, status: products.status, wholesalerId: products.wholesalerId })
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.wholesalerId, data.wholesalerId)));

      const productMap = new Map(productRows.map(p => [p.id, p]));
      for (const item of data.items) {
        const p = productMap.get(item.productId);
        if (!p || p.status !== 'active') {
          return res.status(400).json({ message: `Product ${item.productId} not found or not available` });
        }
      }

      // Find or create provisional customer — dedup by phone then email
      let provisionalCustomer: { id: string } | undefined;
      if (data.enquirerPhone) {
        const [found] = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, data.enquirerPhone)).limit(1);
        if (found) provisionalCustomer = found;
      }
      if (!provisionalCustomer && data.enquirerEmail) {
        const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.enquirerEmail)).limit(1);
        if (found) provisionalCustomer = found;
      }
      if (!provisionalCustomer) {
        const nameParts = data.enquirerName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || null;
        const [created] = await db.insert(users).values({
          id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          phoneNumber: data.enquirerPhone ?? null,
          firstName,
          lastName,
          role: 'customer',
          email: data.enquirerEmail ?? null,
          businessName: data.enquirerBusiness ?? null,
          wholesalerId: data.wholesalerId,
        } as any).returning({ id: users.id });
        provisionalCustomer = created;
      }

      // Build line items with prices
      const lineItems = data.items.map(item => {
        const p = productMap.get(item.productId)!;
        const rawPrice = item.sellingType === 'pallets' ? (p.palletPrice ?? p.price) : p.price;
        const unitPrice = parseFloat(rawPrice ?? '0') || 0;
        return {
          productId: item.productId,
          name: p.name,
          quantity: item.quantity,
          unitPrice,
          total: unitPrice * item.quantity,
          sellingType: item.sellingType,
        };
      });

      const subtotal = lineItems.reduce((s, l) => s + l.total, 0);

      // Create draft order
      const notes = `Quote requested via store${data.enquirerBusiness ? ` by ${data.enquirerBusiness}` : ''}`;
      const [newOrder] = await db.insert(orders).values({
        wholesalerId: data.wholesalerId,
        retailerId: provisionalCustomer.id,
        customerName: data.enquirerName,
        customerEmail: data.enquirerEmail ?? null,
        customerPhone: data.enquirerPhone ?? null,
        subtotal: subtotal.toFixed(2),
        platformFee: '0.00',
        customerTransactionFee: '0.00',
        vatAmount: '0.00',
        total: subtotal.toFixed(2),
        status: 'draft',
        isQuote: true,
        paymentStatus: 'unpaid',
        notes,
      } as any).returning({ id: orders.id });

      // Insert order items (no stock reservation for quote requests)
      if (lineItems.length > 0) {
        await db.insert(orderItems).values(
          lineItems.map(l => ({
            orderId: newOrder.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice.toFixed(2),
            total: l.total.toFixed(2),
            sellingType: l.sellingType,
          }))
        );
      }

      // Snapshot cart for the enquiry record
      const cartSnapshot = lineItems.map(l => ({
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toFixed(2),
        total: l.total.toFixed(2),
        sellingType: l.sellingType,
      }));

      // Create store enquiry linked to the new draft order
      const [enquiry] = await db.insert(storeEnquiries).values({
        wholesalerId: data.wholesalerId,
        enquirerName: data.enquirerName,
        enquirerEmail: data.enquirerEmail ?? null,
        enquirerPhone: data.enquirerPhone ?? null,
        enquirerBusiness: data.enquirerBusiness ?? null,
        productId: null,
        productName: null,
        quantity: null,
        status: 'new',
        orderId: newOrder.id,
        cartItems: cartSnapshot,
      } as any).returning({ id: storeEnquiries.id });

      // Email wholesaler
      if (wholesaler.email) {
        try {
          const currency = wholesaler.preferredCurrency || 'GBP';
          const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
          const businessLabel = data.enquirerBusiness ? ` from ${data.enquirerBusiness}` : '';
          const itemRows = cartSnapshot.map(l =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${l.name}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center">${l.quantity}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(parseFloat(l.unitPrice))}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(parseFloat(l.total))}</td></tr>`
          ).join('');

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `New quote request from ${data.enquirerName} — ${cartSnapshot.length} item${cartSnapshot.length !== 1 ? 's' : ''}`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#16a34a;margin-bottom:4px">New Quote Request</h2>
                <p style="color:#6b7280;margin-bottom:20px">A customer has requested a quote from your store.</p>
                <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:16px">
                  <p style="margin:0 0 6px"><strong>Name:</strong> ${data.enquirerName}</p>
                  ${data.enquirerBusiness ? `<p style="margin:0 0 6px"><strong>Business:</strong> ${data.enquirerBusiness}</p>` : ''}
                  ${data.enquirerPhone ? `<p style="margin:0 0 6px"><strong>Phone/WhatsApp:</strong> ${data.enquirerPhone}</p>` : ''}
                  ${data.enquirerEmail ? `<p style="margin:0 0 0"><strong>Email:</strong> ${data.enquirerEmail}</p>` : ''}
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <thead>
                    <tr style="background:#f9fafb">
                      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Product</th>
                      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280">Qty</th>
                      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">Unit</th>
                      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">Total</th>
                    </tr>
                  </thead>
                  <tbody>${itemRows}</tbody>
                  <tfoot>
                    <tr>
                      <td colspan="3" style="padding:8px 12px;text-align:right;font-weight:600">Subtotal</td>
                      <td style="padding:8px 12px;text-align:right;font-weight:600">${fmt(subtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                <a href="https://quikpik.app/quick-quote?draftId=${newOrder.id}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Draft Invoice →</a>
              </div>
            `,
          });
        } catch (emailErr) {
          console.warn("Failed to send cart-quote email notification:", emailErr);
        }
      }

      res.json({ success: true, enquiryId: enquiry.id, orderId: newOrder.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      }
      console.error("Error creating cart quote:", err);
      res.status(500).json({ message: "Failed to submit quote request" });
    }
  });

  // POST /api/customer/cart-quote
  // Authenticated customer submits their cart as a quote request from the private customer portal.
  // Unlike /api/public/cart-quote, the wholesaler does not need a public store — this is for
  // approved customers who are already logged in and browsing with prices hidden.
  app.post("/api/customer/cart-quote", async (req: any, res) => {
    try {
      const customerAuth = req.session?.customerAuth;
      if (!customerAuth?.customerId || !customerAuth?.wholesalerId) {
        return res.status(401).json({ message: "Not authenticated as customer" });
      }

      const schema = z.object({
        wholesalerId: z.string().min(1),
        items: z.array(z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive(),
          sellingType: z.string().default('units'),
        })).min(1),
        notes: z.string().optional().transform(v => v?.trim() || null),
        deliveryAddressId: z.number().int().positive().optional().nullable(),
        deliveryAddress: z.string().optional().nullable(),
      });

      const data = schema.parse(req.body);

      if (data.wholesalerId !== customerAuth.wholesalerId) {
        return res.status(403).json({ message: "Wholesaler mismatch" });
      }

      const [wholesaler] = await db
        .select({
          id: users.id,
          email: users.email,
          businessName: users.businessName,
          enquiriesEnabled: users.enquiriesEnabled,
          preferredCurrency: users.preferredCurrency,
        })
        .from(users)
        .where(eq(users.id, data.wholesalerId));

      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      if (wholesaler.enquiriesEnabled === false) {
        return res.status(403).json({ message: "Enquiries are not currently enabled for this store" });
      }

      const [customer] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phoneNumber: users.phoneNumber,
          businessName: users.businessName,
        })
        .from(users)
        .where(eq(users.id, customerAuth.customerId));

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';

      const productIds = data.items.map(i => i.productId);
      const productRows = await db
        .select({ id: products.id, name: products.name, price: products.price, palletPrice: products.palletPrice, status: products.status, wholesalerId: products.wholesalerId })
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.wholesalerId, data.wholesalerId)));

      const productMap = new Map(productRows.map(p => [p.id, p]));
      for (const item of data.items) {
        const p = productMap.get(item.productId);
        if (!p || p.status !== 'active') {
          return res.status(400).json({ message: `Product ${item.productId} not found or not available` });
        }
      }

      const lineItems = data.items.map(item => {
        const p = productMap.get(item.productId)!;
        const rawPrice = item.sellingType === 'pallets' ? (p.palletPrice ?? p.price) : p.price;
        const unitPrice = parseFloat(rawPrice ?? '0') || 0;
        return {
          productId: item.productId,
          name: p.name,
          quantity: item.quantity,
          unitPrice,
          total: unitPrice * item.quantity,
          sellingType: item.sellingType,
        };
      });

      const subtotal = lineItems.reduce((s, l) => s + l.total, 0);

      const notes = [
        `Quote requested via customer portal`,
        customer.businessName ? `Business: ${customer.businessName}` : null,
        data.notes ? `Note: ${data.notes}` : null,
      ].filter(Boolean).join(' · ');

      let resolvedDeliveryAddress: string | null = data.deliveryAddress ?? null;
      let verifiedDeliveryAddressId: number | null = null;

      if (data.deliveryAddressId) {
        const [savedAddr] = await db
          .select()
          .from(deliveryAddresses)
          .where(eq(deliveryAddresses.id, data.deliveryAddressId))
          .limit(1);
        if (!savedAddr || savedAddr.customerId !== customer.id) {
          return res.status(403).json({ message: "Delivery address does not belong to this customer" });
        }
        verifiedDeliveryAddressId = savedAddr.id;
        resolvedDeliveryAddress = [savedAddr.addressLine1, savedAddr.addressLine2, savedAddr.city, savedAddr.postalCode, savedAddr.country]
          .filter(Boolean).join(', ');
      }

      const [newOrder] = await db.insert(orders).values({
        wholesalerId: data.wholesalerId,
        retailerId: customer.id,
        customerName,
        customerEmail: customer.email ?? null,
        customerPhone: customer.phoneNumber ?? null,
        subtotal: subtotal.toFixed(2),
        platformFee: '0.00',
        customerTransactionFee: '0.00',
        vatAmount: '0.00',
        total: subtotal.toFixed(2),
        status: 'draft',
        isQuote: true,
        paymentStatus: 'unpaid',
        notes,
        ...(verifiedDeliveryAddressId ? { deliveryAddressId: verifiedDeliveryAddressId } : {}),
        ...(resolvedDeliveryAddress ? { deliveryAddress: resolvedDeliveryAddress } : {}),
      } as any).returning({ id: orders.id });

      if (lineItems.length > 0) {
        await db.insert(orderItems).values(
          lineItems.map(l => ({
            orderId: newOrder.id,
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice.toFixed(2),
            total: l.total.toFixed(2),
            sellingType: l.sellingType,
          }))
        );
      }

      const cartSnapshot = lineItems.map(l => ({
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toFixed(2),
        total: l.total.toFixed(2),
        sellingType: l.sellingType,
      }));

      const [enquiry] = await db.insert(storeEnquiries).values({
        wholesalerId: data.wholesalerId,
        enquirerName: customerName,
        enquirerEmail: customer.email ?? null,
        enquirerPhone: customer.phoneNumber ?? null,
        enquirerBusiness: customer.businessName ?? null,
        productId: null,
        productName: null,
        quantity: null,
        status: 'new',
        orderId: newOrder.id,
        cartItems: cartSnapshot,
      } as any).returning({ id: storeEnquiries.id });

      if (wholesaler.email) {
        try {
          const currency = wholesaler.preferredCurrency || 'GBP';
          const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
          const businessLabel = customer.businessName ? ` from ${customer.businessName}` : '';
          const itemRows = cartSnapshot.map(l =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6">${l.name}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center">${l.quantity} (${l.sellingType})</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(parseFloat(l.unitPrice))}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(parseFloat(l.total))}</td></tr>`
          ).join('');

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Quote request${businessLabel} — ${customerName} (${cartSnapshot.length} item${cartSnapshot.length !== 1 ? 's' : ''})`,
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#16a34a;margin-bottom:4px">Quote Request from Customer Portal</h2>
                <p style="color:#6b7280;margin-bottom:20px">An existing customer is requesting trade pricing for the following items.</p>
                <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:16px">
                  <p style="margin:0 0 6px"><strong>Name:</strong> ${customerName}</p>
                  ${customer.businessName ? `<p style="margin:0 0 6px"><strong>Business:</strong> ${customer.businessName}</p>` : ''}
                  ${customer.phoneNumber ? `<p style="margin:0 0 6px"><strong>Phone/WhatsApp:</strong> ${customer.phoneNumber}</p>` : ''}
                  ${customer.email ? `<p style="margin:0 0 0"><strong>Email:</strong> ${customer.email}</p>` : ''}
                  ${resolvedDeliveryAddress ? `<p style="margin:6px 0 0"><strong>Delivery address:</strong> ${resolvedDeliveryAddress}</p>` : ''}
                  ${data.notes ? `<p style="margin:6px 0 0"><strong>Note:</strong> ${data.notes}</p>` : ''}
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <thead>
                    <tr style="background:#f9fafb">
                      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">Product</th>
                      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280">Qty</th>
                      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">Unit</th>
                      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">Total</th>
                    </tr>
                  </thead>
                  <tbody>${itemRows}</tbody>
                </table>
                <a href="https://quikpik.app/quick-quote?draftId=${newOrder.id}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Draft Invoice →</a>
              </div>
            `,
          });
        } catch (emailErr) {
          console.warn("Failed to send customer cart-quote email:", emailErr);
        }
      }

      res.json({ success: true, enquiryId: enquiry.id, orderId: newOrder.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: err.errors });
      }
      console.error("Error creating customer cart quote:", err);
      res.status(500).json({ message: "Failed to submit quote request" });
    }
  });

  // GET /api/public/leads/new-count — lightweight count of unread leads + quote requests
  app.get("/api/public/leads/new-count", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user?.id || req.user?.claims?.sub;
      if (!wholesalerId) return res.status(401).json({ message: "Unauthorised" });

      const rows = await db
        .select({ id: storeEnquiries.id, orderId: storeEnquiries.orderId })
        .from(storeEnquiries)
        .where(and(eq(storeEnquiries.wholesalerId, wholesalerId), eq(storeEnquiries.status, 'new')));

      const leads = rows.filter(r => !r.orderId).length;
      const quoteRequests = rows.filter(r => !!r.orderId).length;
      res.json({ leads, quoteRequests, total: rows.length });
    } catch (err) {
      console.error("Error fetching leads new count:", err);
      res.status(500).json({ message: "Failed to fetch count" });
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
      if (!id || isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const { status, wholesalerNote } = req.body;

      const VALID_STATUSES = ['new', 'viewed', 'responded'];
      if (status !== undefined && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      if (wholesalerNote !== undefined && typeof wholesalerNote !== 'string') {
        return res.status(400).json({ message: "wholesalerNote must be a string" });
      }
      if (wholesalerNote !== undefined && wholesalerNote.length > 2000) {
        return res.status(400).json({ message: "wholesalerNote too long (max 2000 chars)" });
      }

      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;
      if (wholesalerNote !== undefined) updateData.wholesalerNote = wholesalerNote;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const [updated] = await db
        .update(storeEnquiries)
        .set(updateData)
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
