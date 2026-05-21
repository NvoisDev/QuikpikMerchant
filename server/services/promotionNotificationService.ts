import { db } from "../db";
import { products, users } from "../../shared/schema";
import type { PromotionalOffer } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import { ReliableSMSService } from "../sms-service";
import {
  wrapCustomerEmail,
  emailHeading,
  emailCard,
  emailButton,
  emailTable,
  emailBadge,
} from "../email-templates";
import { storage } from "../storage";

interface PromoProduct {
  id: number;
  name: string;
  price: string | null;
  promoPrice: string | null;
  wholesalerId: string;
  promotionalOffers: PromotionalOffer[];
  matchedPromo: PromotionalOffer;
}

interface WholesalerInfo {
  id: string;
  businessName: string;
  logoUrl?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatPromoType(type: PromotionalOffer["type"], promo: PromotionalOffer): string {
  switch (type) {
    case "percentage_discount":
      return promo.discountPercentage ? `${promo.discountPercentage}% OFF` : "% Off";
    case "fixed_discount":
    case "fixed_amount_discount":
      return promo.discountAmount ? `£${Number(promo.discountAmount).toFixed(2)} OFF` : "Price Off";
    case "fixed_price":
      return "Fixed Price";
    case "bogo":
    case "buy_x_get_y_free":
      return promo.buyQuantity && promo.getQuantity
        ? `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`
        : "Buy X Get Y Free";
    case "bulk_tier":
    case "bulk_discount":
    case "multi_buy":
      return "Bulk Discount";
    case "free_shipping":
      return "Free Shipping";
    case "bundle_deal":
      return "Bundle Deal";
    default:
      return "Special Offer";
  }
}

function formatPrice(price: string | null | undefined): string {
  if (!price) return "—";
  return `£${Number(price).toFixed(2)}`;
}

function buildPromoBadgeColor(type: PromotionalOffer["type"]): string {
  switch (type) {
    case "percentage_discount": return "#dc2626";
    case "fixed_price":
    case "fixed_discount":
    case "fixed_amount_discount": return "#059669";
    case "bogo":
    case "buy_x_get_y_free": return "#7c3aed";
    case "bundle_deal": return "#2563eb";
    default: return "#d97706";
  }
}

function buildStartEmailHtml(
  products: PromoProduct[],
  wholesaler: WholesalerInfo,
  storeUrl: string
): string {
  const productCount = products.length;
  const heading = emailHeading(
    productCount === 1
      ? "A new deal just launched!"
      : `${productCount} new deals just launched!`,
    { size: "22px", color: "#059669" }
  );

  const intro = `<p style="margin:0 0 16px;color:#374151">Great news! ${wholesaler.businessName} has just launched ${productCount === 1 ? "a special promotion" : "special promotions"} — don't miss out on these limited-time offers.</p>`;

  const rows = products.map((p) => {
    const promo = p.matchedPromo;
    const badge = emailBadge(formatPromoType(promo.type, promo), buildPromoBadgeColor(promo.type));
    const salePrice = p.promoPrice ? `<strong style="color:#059669">${formatPrice(p.promoPrice)}</strong>` : formatPrice(p.price);
    return [p.name, badge, salePrice];
  });

  const table = emailTable(["Product", "Promo", "Price"], rows);

  const endDateLine = (() => {
    const earliest = products
      .map((p) => p.matchedPromo.endDate)
      .filter(Boolean)
      .sort()[0];
    if (!earliest) return "";
    const d = new Date(earliest);
    return `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">These deals end on <strong>${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong> — shop early to avoid missing out.</p>`;
  })();

  const body =
    heading +
    intro +
    emailCard(table + endDateLine, { borderColor: "#d1fae5", bgColor: "#f0fdf4" }) +
    emailButton("Shop Now", storeUrl, "#059669");

  return wrapCustomerEmail(body, {
    businessName: wholesaler.businessName,
    logoUrl: wholesaler.logoUrl,
    accentColor: "#059669",
  }, { preheader: `${productCount} product${productCount > 1 ? "s" : ""} just went on sale at ${wholesaler.businessName}` });
}

function buildEndEmailHtml(
  products: PromoProduct[],
  wholesaler: WholesalerInfo,
  storeUrl: string
): string {
  const productCount = products.length;
  const heading = emailHeading(
    productCount === 1
      ? "Last chance — this deal ends today!"
      : `Last chance — ${productCount} deals end today!`,
    { size: "22px", color: "#d97706" }
  );

  const intro = `<p style="margin:0 0 16px;color:#374151">Time is running out! ${productCount === 1 ? "This promotion" : "These promotions"} at ${wholesaler.businessName} ${productCount === 1 ? "ends" : "end"} today. Order now before it's too late.</p>`;

  const rows = products.map((p) => {
    const promo = p.matchedPromo;
    const badge = emailBadge(formatPromoType(promo.type, promo), buildPromoBadgeColor(promo.type));
    const salePrice = p.promoPrice ? `<strong style="color:#059669">${formatPrice(p.promoPrice)}</strong>` : formatPrice(p.price);
    return [p.name, badge, salePrice];
  });

  const table = emailTable(["Product", "Promo", "Price"], rows);

  const body =
    heading +
    intro +
    emailCard(table, { borderColor: "#fde68a", bgColor: "#fffbeb" }) +
    emailButton("Order Before It's Gone", storeUrl, "#d97706");

  return wrapCustomerEmail(body, {
    businessName: wholesaler.businessName,
    logoUrl: wholesaler.logoUrl,
  }, { preheader: `Hurry — ${productCount} deal${productCount > 1 ? "s" : ""} ending today at ${wholesaler.businessName}` });
}

function buildStartSMS(products: PromoProduct[], wholesaler: WholesalerInfo, storeUrl: string): string {
  if (products.length === 1) {
    return `${wholesaler.businessName}: ${products[0].name} is now on sale! Shop now: ${storeUrl}`;
  }
  return `${wholesaler.businessName}: ${products.length} products just went on sale! Shop now: ${storeUrl}`;
}

function buildEndSMS(products: PromoProduct[], wholesaler: WholesalerInfo, storeUrl: string): string {
  if (products.length === 1) {
    return `${wholesaler.businessName}: Last chance — ${products[0].name} deal ends today! Shop: ${storeUrl}`;
  }
  return `${wholesaler.businessName}: Last chance — ${products.length} deals end today! Shop: ${storeUrl}`;
}

async function getWholesalerInfo(wholesalerId: string): Promise<WholesalerInfo | null> {
  const rows = await db
    .select({
      id: users.id,
      businessName: users.businessName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      logoUrl: users.logoUrl,
      logoType: users.logoType,
    })
    .from(users)
    .where(eq(users.id, wholesalerId))
    .limit(1);

  if (rows.length === 0) return null;
  const u = rows[0];

  const resolvedLogoUrl =
    u.logoType === "custom"
      ? `https://quikpik.app/api/logo/${wholesalerId}`
      : u.logoUrl?.startsWith("http")
      ? u.logoUrl
      : null;

  return {
    id: wholesalerId,
    businessName: u.businessName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || wholesalerId,
    email: u.email,
    phoneNumber: u.phoneNumber,
    logoUrl: resolvedLogoUrl,
  };
}

async function markPromotionNotified(
  productId: number,
  promoId: string,
  field: "startNotificationSentAt" | "endNotificationSentAt"
): Promise<void> {
  const rows = await db
    .select({ promotionalOffers: products.promotionalOffers })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (rows.length === 0) return;

  const offers: PromotionalOffer[] = (rows[0].promotionalOffers as PromotionalOffer[]) || [];
  const updated = offers.map((o) =>
    o.id === promoId ? { ...o, [field]: new Date().toISOString() } : o
  );

  await storage.updateProduct(productId, { promotionalOffers: updated });
}

export class PromotionNotificationService {
  async checkAndSendPromotionNotifications(): Promise<void> {
    const today = getTodayDateString();

    try {
      const allActiveProducts = await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          promoPrice: products.promoPrice,
          wholesalerId: products.wholesalerId,
          promotionalOffers: products.promotionalOffers,
        })
        .from(products)
        .where(
          and(
            eq(products.status, "active"),
            sql`jsonb_array_length(COALESCE(${products.promotionalOffers}, '[]'::jsonb)) > 0`
          )
        );

      if (allActiveProducts.length === 0) {
        return;
      }

      const startingByWholesaler = new Map<string, PromoProduct[]>();
      const endingByWholesaler = new Map<string, PromoProduct[]>();

      for (const product of allActiveProducts) {
        const offers = (product.promotionalOffers as PromotionalOffer[]) || [];

        for (const promo of offers) {
          if (
            promo.startDate &&
            promo.startDate.slice(0, 10) === today &&
            !promo.startNotificationSentAt
          ) {
            const entry: PromoProduct = { ...product, promotionalOffers: offers, matchedPromo: promo };
            if (!startingByWholesaler.has(product.wholesalerId)) {
              startingByWholesaler.set(product.wholesalerId, []);
            }
            startingByWholesaler.get(product.wholesalerId)!.push(entry);
          }

          if (
            promo.endDate &&
            promo.endDate.slice(0, 10) === today &&
            !promo.endNotificationSentAt
          ) {
            const entry: PromoProduct = { ...product, promotionalOffers: offers, matchedPromo: promo };
            if (!endingByWholesaler.has(product.wholesalerId)) {
              endingByWholesaler.set(product.wholesalerId, []);
            }
            endingByWholesaler.get(product.wholesalerId)!.push(entry);
          }
        }
      }

      const startingCount = Array.from(startingByWholesaler.values()).reduce((s, a) => s + a.length, 0);
      const endingCount = Array.from(endingByWholesaler.values()).reduce((s, a) => s + a.length, 0);

      if (startingCount === 0 && endingCount === 0) {
        return;
      }

      for (const [wholesalerId, promoProducts] of Array.from(startingByWholesaler.entries())) {
        await this.notifyCustomers(wholesalerId, promoProducts, "start");
      }

      for (const [wholesalerId, promoProducts] of Array.from(endingByWholesaler.entries())) {
        await this.notifyCustomers(wholesalerId, promoProducts, "end");
      }

    } catch (error) {
      console.error("❌ Promotion notification check failed:", error);
    }
  }

  private async notifyCustomers(
    wholesalerId: string,
    promoProducts: PromoProduct[],
    eventType: "start" | "end"
  ): Promise<void> {
    try {
      const wholesaler = await getWholesalerInfo(wholesalerId);
      if (!wholesaler) {
        return;
      }

      const [wRow] = await db.select({ notificationPreferences: users.notificationPreferences }).from(users).where(eq(users.id, wholesalerId)).limit(1);
      const notifPrefs = (wRow?.notificationPreferences as any) || {};
      if (notifPrefs.promotionReminderEnabled === false) {
        return;
      }

      const customers = await storage.getAllCustomers(wholesalerId);

      if (customers.length === 0) {
        return;
      }

      const storeUrl = `https://quikpik.app/store/${wholesalerId}`;

      const emailHtml =
        eventType === "start"
          ? buildStartEmailHtml(promoProducts, wholesaler, storeUrl)
          : buildEndEmailHtml(promoProducts, wholesaler, storeUrl);

      const smsText =
        eventType === "start"
          ? buildStartSMS(promoProducts, wholesaler, storeUrl)
          : buildEndSMS(promoProducts, wholesaler, storeUrl);

      const n = promoProducts.length;
      const subject =
        eventType === "start"
          ? `New deals just launched — ${n} product${n === 1 ? "" : "s"} on sale now`
          : `Last chance — ${n} deal${n === 1 ? "" : "s"} end today`;

      let emailsSent = 0;
      let smsSent = 0;

      for (const customer of customers) {
        if (customer.email) {
          const ok = await sendEmail({
            to: customer.email,
            from: "hello@quikpik.co",
            subject,
            html: emailHtml,
            text: smsText,
          });
          if (ok) emailsSent++;
        }

        if (customer.phoneNumber) {
          const result = await ReliableSMSService.sendMarketingSMS(customer.phoneNumber, smsText);
          if (result.success) smsSent++;
        }
      }

      const atLeastOneDelivered = emailsSent > 0 || smsSent > 0;

      if (atLeastOneDelivered) {
        for (const pp of promoProducts) {
          await markPromotionNotified(
            pp.id,
            pp.matchedPromo.id,
            eventType === "start" ? "startNotificationSentAt" : "endNotificationSentAt"
          );
        }
      }

    } catch (error) {
      console.error(`❌ Failed to notify customers for wholesaler ${wholesalerId}:`, error);
    }
  }
}

export const promotionNotificationService = new PromotionNotificationService();
