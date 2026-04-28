import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set — cannot sign customer auth cookie");
  return secret;
}

/**
 * JSON-serialises a cookie payload, base64-encodes it, then appends an
 * HMAC-SHA256 signature: `base64Payload.hexSignature`
 */
export function signCustomerCookie(payload: object): string {
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = createHmac("sha256", getSecret()).update(base64).digest("hex");
  return `${base64}.${sig}`;
}

/**
 * Verifies the HMAC signature BEFORE parsing the payload.
 * Returns the parsed data object when valid, or null when:
 *   - cookie is missing / malformed
 *   - signature is invalid (logs a warning, no sensitive data)
 *   - cookie has expired
 *
 * The DB ownership check that was previously in resolveCustomerAuth
 * (marketplace.ts) is no longer needed once HMAC is enforced — a forged
 * cookie will be rejected here before reaching any database call.
 */
export function parseCustomerCookie(raw: string | undefined): Record<string, any> | null {
  if (!raw) return null;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) {
    console.warn("🔒 Rejected customer_auth cookie: missing signature");
    return null;
  }

  const base64 = raw.substring(0, lastDot);
  const sig = raw.substring(lastDot + 1);

  const expectedSigBuf = Buffer.from(
    createHmac("sha256", getSecret()).update(base64).digest("hex"),
    "hex"
  );
  const actualSigBuf = Buffer.from(sig, "hex");

  const sigValid =
    actualSigBuf.length === expectedSigBuf.length &&
    timingSafeEqual(actualSigBuf, expectedSigBuf);

  if (!sigValid) {
    console.warn("🔒 Rejected customer_auth cookie: invalid signature");
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    console.warn("🔒 Rejected customer_auth cookie: malformed payload");
    return null;
  }

  if (!data?.expires || data.expires <= Date.now()) {
    console.warn("🔒 Rejected customer_auth cookie: expired");
    return null;
  }

  return data;
}

/** Standard cookie options — secure only in production */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  maxAge: COOKIE_TTL_MS,
  sameSite: "lax" as const,
};
