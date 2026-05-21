/**
 * marketplace-browsing.ts
 *
 * Read-only discovery/browsing routes for the customer-facing marketplace.
 * Extracted from marketplace.ts — behaviour is unchanged.
 *
 * Routes registered here:
 *   GET /api/marketplace/featured
 *   GET /api/marketplace/products
 *   GET /api/customer-products/:wholesalerId
 *   GET /api/marketplace/wholesalers
 *   GET /api/wholesalers/all
 *   GET /api/wholesaler/:id
 *   GET /api/marketplace/wholesaler/:id
 *   GET /api/marketplace/products/:id
 */
import type { Express } from "express";
import {
  db, getUserPlanLimits, inArray, sql, storage, priceListItems, requireAuth,
} from "./shared";
import { stripGuestPricingDataFromProducts } from "../utils/guest-products";
import { getFeeConfigForWholesaler } from "../utils/fee-config";

interface RawProductRow {
  id: unknown;
  wholesaler_id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  moq: number;
  stock: number;
  image_url: string | null;
  images: unknown;
  category: string | null;
  price_visible: boolean | null;
  pack_quantity: unknown;
  unit_of_measure: unknown;
  unit_size: unknown;
  selling_format: string | null;
  delivery_excluded: boolean | null;
  units_per_pallet: unknown;
  pallet_price: unknown;
  pallet_moq: unknown;
  pallet_stock: unknown;
  pallet_weight: unknown;
  promotional_offers: unknown;
  created_at: unknown;
  nearest_expiry: unknown;
  business_name: unknown;
}
import {
  computeEffectivePrice,
  resolveActivePriceListIds,
  resolveCustomerProductPrice,
} from "./marketplace-price-lists";

export function registerBrowsingRoutes(app: Express): void {

  // GET /api/marketplace/featured
  app.get("/api/marketplace/featured", async (req, res) => {
    try {
      const featuredCategories = [
        "Groceries & Food",
        "Fresh Produce",
        "Beverages & Drinks",
        "Personal Care & Hygiene",
        "Electronics & Gadgets",
        "Home & Kitchen"
      ];

      const topWholesalers = await storage.getMarketplaceWholesalers({ search: "" });
      const recentProducts = await storage.getMarketplaceProducts({
        search: "",
        sortBy: "newest"
      });

      res.json({
        categories: featuredCategories,
        topWholesalers: topWholesalers.slice(0, 6),
        recentProducts: recentProducts.slice(0, 8),
        stats: {
          totalWholesalers: topWholesalers.length,
          totalProducts: recentProducts.length,
          totalCategories: 20
        }
      });
    } catch (error) {
      console.error("Error fetching featured content:", error);
      res.status(500).json({ message: "Failed to fetch featured content" });
    }
  });

  // GET /api/marketplace/products
  app.get('/api/marketplace/products', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        category: req.query.category as string,
        location: req.query.location as string,
        sortBy: req.query.sortBy as string || "featured",
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        wholesalerId: req.query.wholesalerId as string
      };

      const products = await storage.getMarketplaceProducts(filters);
      res.json(products);
    } catch (error) {
      console.error("Error fetching marketplace products:", error);
      res.status(500).json({ message: "Failed to fetch marketplace products" });
    }
  });

  // GET /api/customer-products/:wholesalerId
  app.get('/api/customer-products/:wholesalerId', async (req, res) => {
    let wholesalerId = '';
    try {
      wholesalerId = req.params.wholesalerId;

      if (!wholesalerId) {
        return res.status(400).json({ error: 'Wholesaler ID is required' });
      }

      // 🔒 SUBSCRIPTION FEATURE GATING: Check wholesaler's subscription limits
      const limits = await getUserPlanLimits(wholesalerId);
      const productLimit = limits.limits.products;

      // Use direct SQL query with subscription-based limits
      const queryStart = Date.now();

      try {
        // 🎯 CRITICAL: Apply subscription limits to customer-visible products
        // Customers should only see products within the wholesaler's subscription tier
        // Hard cap of 100: prevents a single request returning thousands of products
        const rawLimit = productLimit === -1 || !productLimit ? 100 : productLimit;
        const effectiveLimit = Math.min(rawLimit, 100);

        const result = await db.execute(sql`
          SELECT p.id, p.name, p.description, p.price, p.currency, p.moq, p.stock,
                 p.image_url, p.images, p.category, p.status, p.wholesaler_id, p.created_at,
                 p.promo_price, p.promo_active, p.promotional_offers,
                 p.price_visible, p.pack_quantity, p.unit_of_measure,
                 p.unit_size, p.selling_format, p.delivery_excluded,
                 p.units_per_pallet, p.pallet_price, p.pallet_moq, p.pallet_stock, p.pallet_weight,
                 'Surulere Foods Wholesale' as business_name,
                 b.nearest_expiry
          FROM products p
          LEFT JOIN (
            SELECT product_id, MIN(expiry_date) AS nearest_expiry
            FROM product_batches
            WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE
            GROUP BY product_id
          ) b ON b.product_id = p.id
          WHERE p.wholesaler_id = ${wholesalerId} AND p.status = 'active'
          ORDER BY p.created_at DESC
          LIMIT ${effectiveLimit}
        `);

        const rows = result.rows as unknown as RawProductRow[];
        const queryTime = Date.now() - queryStart;

        if (rows.length === 0) {
          return res.json([]);
        }

        // Complete transformation with promotional data
        const formattedProducts = rows.map(row => {
          let parsedOffers: any[] = [];
          try {
            if (!row.promotional_offers) parsedOffers = [];
            else if (Array.isArray(row.promotional_offers)) parsedOffers = row.promotional_offers;
            else if (typeof row.promotional_offers === 'string') {
              const trimmed = row.promotional_offers.trim();
              if (trimmed && trimmed !== '[]' && trimmed !== 'null') parsedOffers = JSON.parse(trimmed);
            }
          } catch { parsedOffers = []; }
          const now = new Date();
          const activeOffer = parsedOffers.find((o: any) => {
            if (!o.isActive) return false;
            if (o.startDate && new Date(o.startDate) > now) return false;
            if (o.endDate && new Date(o.endDate) < now) return false;
            return true;
          });
          let livePromoActive = false;
          let livePromoPrice: string | null = null;
          if (activeOffer) {
            livePromoActive = true;
            const base = parseFloat(row.price || '0');
            if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice != null) {
              livePromoPrice = String(activeOffer.fixedPrice);
            } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage != null) {
              livePromoPrice = String(Math.round(base * (1 - activeOffer.discountPercentage / 100) * 100) / 100);
            } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice != null) {
              livePromoPrice = String(activeOffer.fixedPrice);
            }
          }
          return ({
          id: row.id,
          wholesalerId: row.wholesaler_id,
          name: row.name || '',
          description: row.description || '',
          price: row.price || '0.00',
          currency: row.currency || 'GBP',
          moq: row.moq || 1,
          stock: row.stock || 0,
          imageUrl: row.image_url || (Array.isArray(row.images) && row.images[0]) || '',
          images: Array.isArray(row.images) ? row.images : [],
          category: row.category || '',
          status: 'active',
          priceVisible: row.price_visible !== false,
          packQuantity: row.pack_quantity,
          unitOfMeasure: row.unit_of_measure,
          unitSize: row.unit_size,
          sellingFormat: row.selling_format || 'units',
          deliveryExcluded: row.delivery_excluded === true,
          unitsPerPallet: row.units_per_pallet,
          palletPrice: row.pallet_price,
          palletMoq: row.pallet_moq,
          palletStock: row.pallet_stock,
          palletWeight: row.pallet_weight,
          promoPrice: livePromoPrice,
          promoActive: livePromoActive,
          promotionalOffers: parsedOffers,
          createdAt: row.created_at,
          isExpiringSoon: (() => {
            if (!row.nearest_expiry) return false;
            const expiry = new Date(String(row.nearest_expiry));
            const now = new Date();
            const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
          })(),
          wholesaler: {
            id: row.wholesaler_id,
            businessName: row.business_name,
            defaultCurrency: row.currency || 'GBP',
            rating: 4.5
          }
          }) as {
            id: unknown; wholesalerId: string; name: string; description: string; price: string;
            currency: string; moq: number; stock: number; imageUrl: unknown; images: unknown[];
            category: string; status: string; priceVisible: boolean; packQuantity: unknown;
            unitOfMeasure: unknown; unitSize: unknown; sellingFormat: string; deliveryExcluded: boolean;
            unitsPerPallet: unknown; palletPrice: unknown; palletMoq: unknown; palletStock: unknown;
            palletWeight: unknown; promoPrice: string | null; promoActive: boolean;
            promotionalOffers: unknown[]; createdAt: unknown; isExpiringSoon: boolean;
            wholesaler: { id: string; businessName: unknown; defaultCurrency: string; rating: number };
            customPrice?: string; standardPrice?: string; hasPriceList?: boolean;
          };
        });

        // Inject custom prices from price lists if customer is authenticated
        try {
          const customerId = req.session?.customerAuth?.customerId;
          if (customerId) {
            const listIds = await resolveActivePriceListIds(wholesalerId, customerId);
            if (listIds.length > 0) {
              // Fetch all price list items for these lists via parameterised query
              const itemRows = await db
                .select({
                  productId: priceListItems.productId,
                  customPrice: priceListItems.customPrice,
                  discountPercentage: priceListItems.discountPercentage,
                  customPalletPrice: priceListItems.customPalletPrice,
                })
                .from(priceListItems)
                .where(inArray(priceListItems.priceListId, listIds));

              // Build productId -> lowest effective unit price map
              const priceOverrides: Record<number, number> = {};
              for (const row of itemRows) {
                const productId = row.productId;
                if (productId === null) continue;
                const baseProduct = formattedProducts.find((p: any) => p.id === productId);
                if (!baseProduct) continue;
                const base = parseFloat(baseProduct.price || '0');
                const effective = computeEffectivePrice(base, row);
                if (priceOverrides[productId] === undefined || effective < priceOverrides[productId]) {
                  priceOverrides[productId] = effective;
                }
              }

              // Build productId -> lowest custom pallet price map
              const palletPriceOverrides: Record<number, number> = {};
              for (const row of itemRows) {
                const productId = row.productId;
                if (productId === null || row.customPalletPrice == null) continue;
                const effective = parseFloat(String(row.customPalletPrice));
                if (palletPriceOverrides[productId] === undefined || effective < palletPriceOverrides[productId]) {
                  palletPriceOverrides[productId] = effective;
                }
              }

              for (const product of formattedProducts) {
                const productId = product.id as number;
                const override = priceOverrides[productId];
                if (override !== undefined && override !== parseFloat(product.price || '0')) {
                  product.customPrice = override.toFixed(2);
                  product.standardPrice = product.price;
                  product.hasPriceList = true;
                }
                const palletOverride = palletPriceOverrides[productId];
                if (palletOverride !== undefined) {
                  product.palletPrice = palletOverride.toFixed(2);
                }
              }
            }
          }
        } catch (priceListErr) {
          console.error('⚠️ Price list resolution failed (non-fatal):', priceListErr);
        }

        // Strip all pricing data for unauthenticated guest requests
        if (req.query.guest === 'true') {
          stripGuestPricingDataFromProducts(formattedProducts as Parameters<typeof stripGuestPricingDataFromProducts>[0]);
        }

        res.json(formattedProducts);

      } catch (sqlError) {
        console.error('💥 SQL execution failed:', sqlError);
        throw sqlError; // Re-throw to be caught by outer try-catch
      }

    } catch (error: unknown) {
      const err = error as Error;
      console.error("❌ CRITICAL ERROR in customer products endpoint:", {
        message: err?.message || 'Unknown error',
        stack: err?.stack,
        name: err?.name,
        wholesalerId: wholesalerId,
        query: req.query,
        environment: process.env.NODE_ENV
      });

      res.status(500).json({
        message: "Failed to fetch customer products",
        error: process.env.NODE_ENV === 'development' ? (err?.message || 'Unknown error') : 'Internal server error'
      });
    }
  });

  // GET /api/marketplace/wholesalers
  app.get('/api/marketplace/wholesalers', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        location: req.query.location as string,
        category: req.query.category as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined
      };

      const wholesalers = await storage.getMarketplaceWholesalers(filters);
      res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching marketplace wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch marketplace wholesalers" });
    }
  });

  // GET /api/wholesalers/all
  app.get("/api/wholesalers/all", async (req, res) => {
    try {
      const wholesalers = await storage.getAllWholesalers();
      res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching all wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch wholesalers" });
    }
  });

  // GET /api/wholesaler/:id
  app.get("/api/wholesaler/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const wholesaler = await storage.getUser(id);

      if (!wholesaler || wholesaler.role !== 'wholesaler') {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      res.json({
        id: wholesaler.id,
        businessName: wholesaler.businessName || null,
        firstName: wholesaler.firstName || null,
        email: wholesaler.email
      });
    } catch (error) {
      console.error("Error looking up wholesaler:", error);
      res.status(500).json({ message: "Failed to lookup wholesaler" });
    }
  });

  // GET /api/marketplace/check-slug/:slug — check if a store slug is available (auth required)
  app.get('/api/marketplace/check-slug/:slug', requireAuth, async (req: any, res) => {
    try {
      const slug = req.params.slug.toLowerCase().trim();
      const userId = req.user.id;
      const reserved = ['admin', 'api', 'customer', 'store', 'welcome', 'super-admin', 'login', 'signup', 'dashboard'];
      if (reserved.includes(slug)) {
        return res.json({ available: false, reason: 'reserved' });
      }
      if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
        return res.json({ available: false, reason: 'format' });
      }
      const result = await db.execute(sql`SELECT id FROM users WHERE store_slug = ${slug} AND id != ${userId} LIMIT 1`);
      res.json({ available: result.rows.length === 0 });
    } catch (error) {
      res.status(500).json({ available: false, reason: 'error' });
    }
  });

  // GET /api/marketplace/wholesaler/:id
  app.get('/api/marketplace/wholesaler/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const wholesaler = await storage.getWholesalerProfile(id);

      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Include the effective fee config so the checkout dialog can display the
      // correct fee without a separate /api/config/customer-fee round-trip.
      const effectiveFeeConfig = await getFeeConfigForWholesaler(id);

      // Replace the raw logoUrl (may be a large base64 data URL) with the
      // proper serving endpoint so the response stays small and the image loads
      // reliably on the WelcomePage and customer portal.
      const resolvedLogoUrl = wholesaler.logoType === 'custom'
        ? `/api/logo/${wholesaler.id}`
        : (wholesaler.logoUrl && String(wholesaler.logoUrl).startsWith('http') ? wholesaler.logoUrl : null);

      res.json({
        ...wholesaler,
        logoUrl: resolvedLogoUrl,
        effectiveFeeConfig: {
          percentage: effectiveFeeConfig.percentage,
          fixed: effectiveFeeConfig.fixed,
        },
      });
    } catch (error) {
      console.error("=== Error in wholesaler profile route ===");
      console.error("Error type:", error instanceof Error ? error.constructor?.name : typeof error);
      console.error("Error message:", error instanceof Error ? error.message : 'Unknown error');
      console.error("Full error:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ message: "Failed to fetch wholesaler profile" });
    }
  });

  // GET /api/marketplace/products/:id
  app.get('/api/marketplace/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const productId = parseInt(id);

      if (isNaN(productId)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      const product = await storage.getProduct(productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.id === 23) {
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(product.wholesalerId);

      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Resolve custom price list pricing if customer is authenticated
      const detailCustomerId = req.session?.customerAuth?.customerId;
      let customPriceOverride: { customPrice: string; standardPrice: string; hasPriceList: true } | null = null;
      if (detailCustomerId) {
        customPriceOverride = await resolveCustomerProductPrice({
          wholesalerId: product.wholesalerId,
          customerId: detailCustomerId,
          productId: product.id,
          standardPrice: product.price || '0',
        });
      }

      // SEPARATE STOCK TRACKING: Use actual stock fields directly
      // Return product with actual separate stock values and wholesaler information.
      // costPrice is a wholesaler-only margin field — never expose it to customers.
      const { costPrice: _stripped, ...safeProduct } = product as typeof product & { costPrice?: unknown };
      res.json({
        ...safeProduct,
        // Use actual separate stock fields (no calculations needed)
        stock: product.stock || 0, // Individual units stock
        palletStock: product.palletStock || 0, // Pallet stock
        // Legacy compatibility fields
        availablePacks: product.stock || 0, // For display purposes, show units as "packs"
        availablePallets: product.palletStock || 0, // Show actual pallet stock
        // Custom price list pricing (null spreads cleanly)
        ...(customPriceOverride ?? {}),
        wholesaler: {
          id: wholesaler.id,
          businessName: wholesaler.businessName || 'Business',
          businessPhone: wholesaler.businessPhone,
          businessAddress: wholesaler.businessAddress,
          profileImageUrl: wholesaler.profileImageUrl,
          logoType: wholesaler.logoType || 'initials',
          logoUrl: wholesaler.logoUrl || undefined,
          firstName: wholesaler.firstName,
          lastName: wholesaler.lastName,
          defaultCurrency: wholesaler.preferredCurrency
        }
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

}
