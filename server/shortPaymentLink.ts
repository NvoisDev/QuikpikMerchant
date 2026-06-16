import crypto from "crypto";
import { db } from "./db";
import { paymentShortLinks } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

const APP_DOMAIN = "https://quikpik.app";

function generateCode(): string {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

export async function createShortPaymentLink(
  stripeUrl: string,
  wholesalerId: string | null,
  expiresInHours = 24
): Promise<string> {
  try {
    let code = generateCode();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    let attempts = 0;
    while (attempts < 5) {
      try {
        await db.insert(paymentShortLinks).values({
          code,
          url: stripeUrl,
          wholesalerId: wholesalerId ?? undefined,
          expiresAt,
        });
        break;
      } catch {
        code = generateCode();
        attempts++;
      }
    }

    return `${APP_DOMAIN}/pay/${code}`;
  } catch (err) {
    console.error("⚠️ Failed to create short payment link — falling back to full URL:", err);
    return stripeUrl;
  }
}

export async function resolveShortPaymentLink(code: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ url: paymentShortLinks.url, expiresAt: paymentShortLinks.expiresAt })
      .from(paymentShortLinks)
      .where(eq(paymentShortLinks.code, code))
      .limit(1);

    if (!row) return null;
    if (row.expiresAt < new Date()) return null;
    return row.url;
  } catch (err) {
    console.error("⚠️ Failed to resolve short payment link:", err);
    return null;
  }
}

export async function pruneExpiredShortLinks(): Promise<void> {
  try {
    await db.delete(paymentShortLinks).where(lt(paymentShortLinks.expiresAt, new Date()));
  } catch {
  }
}
