// Fetch helpers for the wholesaler product detail page.
//
// The product detail page gates its entire render on the product query's
// loading state. A bare `fetch()` with no timeout can stay "in flight"
// forever (e.g. a stalled connection behind a proxy), which leaves the page
// stuck on a skeleton with no way to recover — appearing as a permanent blank
// page to the user. Wrapping every request in an AbortController-backed
// timeout guarantees each request eventually settles (resolves or rejects),
// so the UI can fall through to a real error/retry state instead of hanging.

export const PRODUCT_DETAIL_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = PRODUCT_DETAIL_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Loads a single product. Resolves to the product, or `null` when the product
// genuinely does not exist (404). Any other non-OK response throws so the page
// can surface an explicit error + retry state rather than a misleading
// "not found" or an endless skeleton.
export async function fetchProductDetail<T = unknown>(
  productId: number,
  timeoutMs: number = PRODUCT_DETAIL_TIMEOUT_MS,
): Promise<T | null> {
  const res = await fetchWithTimeout(`/api/products/${productId}`, timeoutMs);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load product (${res.status})`);
  return res.json();
}
