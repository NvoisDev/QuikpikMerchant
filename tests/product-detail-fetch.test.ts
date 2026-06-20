import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchWithTimeout,
  fetchProductDetail,
} from "@/lib/product-detail-fetch";

// Regression coverage for the "blank product detail page" bug (product id 77,
// "khadus peanut 165g"). The page hung forever on a skeleton because the
// product request never settled. These tests pin the contract that every
// request settles and that the different outcomes map to a usable UI state.

const PRODUCT_77 = {
  id: 77,
  name: "khadus peanut 165g",
  price: "20.00",
  costPrice: null,
  currency: "GBP",
  quantityInPack: 1,
  packQuantity: 12,
  palletStock: 27,
  unitsPerPallet: null,
  sellingFormat: "units",
  stock: 27,
  images: [],
  imageUrl: null,
  promotionalOffers: [],
  batchCount: 1,
  nearestExpiry: null,
  expiryDate: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchProductDetail", () => {
  it("resolves the product payload on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(PRODUCT_77)),
    );

    const product = await fetchProductDetail<typeof PRODUCT_77>(77);
    expect(product).not.toBeNull();
    expect(product?.id).toBe(77);
    expect(product?.name).toBe("khadus peanut 165g");
  });

  it("returns null (not an error) for a genuine 404 so the page shows 'not found'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Not found" }, 404)),
    );

    await expect(fetchProductDetail(77)).resolves.toBeNull();
  });

  it("throws on a server error so the page can show an error + retry state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500)),
    );

    await expect(fetchProductDetail(77)).rejects.toThrow();
  });

  it("does NOT hang forever when the request stalls — it aborts and rejects", async () => {
    // Simulate a connection that never responds but honours the abort signal,
    // exactly the failure mode that left the page stuck on a skeleton.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener("abort", () =>
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                ),
              );
            }
          }),
      ),
    );

    // Short timeout keeps the test fast; the point is that it settles at all.
    await expect(fetchProductDetail(77, 25)).rejects.toThrow();
  });
});

describe("fetchWithTimeout", () => {
  it("aborts a stalled request within the timeout window", async () => {
    let abortedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            abortedSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    await expect(fetchWithTimeout("/api/products/77", 25)).rejects.toThrow();
    expect(abortedSignal?.aborted).toBe(true);
  });

  it("returns the response when the request completes in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(PRODUCT_77)),
    );

    const res = await fetchWithTimeout("/api/products/77", 5000);
    expect(res.ok).toBe(true);
  });
});
