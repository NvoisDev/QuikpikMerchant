import crypto from "crypto";
import { db } from "./db";
import { paymentShortLinks } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

const APP_DOMAIN = "https://quikpik.app";

function generateCode(): string {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as any).code;
    const msg: string = (err as any).message || "";
    return code === "23505" || msg.includes("unique") || msg.includes("duplicate");
  }
  return false;
}

export async function createShortPaymentLink(
  stripeUrl: string,
  wholesalerId: string | null,
  expiresInHours = 24
): Promise<string> {
  if (!stripeUrl) return stripeUrl;

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await db.insert(paymentShortLinks).values({
        code,
        url: stripeUrl,
        wholesalerId: wholesalerId ?? undefined,
        expiresAt,
      });
      return `${APP_DOMAIN}/pay/${code}`;
    } catch (err) {
      if (isUniqueViolation(err)) {
        continue;
      }
      console.error("⚠️ Failed to create short payment link — falling back to full URL:", err);
      return stripeUrl;
    }
  }

  console.error("⚠️ Short payment link: exhausted 5 code collision attempts — falling back to full URL");
  return stripeUrl;
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
