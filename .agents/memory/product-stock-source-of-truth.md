---
name: Product stock source of truth
description: Which product column reflects real, live stock — and why baseUnitStock must not be trusted.
---

# Product stock: live source of truth

The live, authoritative stock for a product is `products.stock` (base units) and
`products.palletStock`. Both are recomputed from the SUM of active, non-expired
`product_batches.quantity` by the batch engine whenever stock changes
(`_syncProductStockFromBatches` / `recalcProductStock`). The order/ordering
surfaces, customer portal, and wholesaler product cards all read `stock` /
`palletStock`.

`products.baseUnitStock` is **stale legacy**. The batch engine never updates it,
so it drifts arbitrarily — observed both directions (products with `baseUnitStock=0`
while real `stock>0`, and `baseUnitStock>0` while real `stock=0`). Do NOT use it to
decide availability or display stock anywhere customer-facing.

**Canonical out-of-stock rule (match the customer portal):** out of stock only when
`stock === 0 && palletStock === 0`.

**Why:** `replit.md` documents `baseUnitStock` as the "single source of truth," but
that is aspirational/stale — the real engine writes `stock`/`palletStock`. The public
storefront once trusted `baseUnitStock` and showed dozens of in-stock products as
"Out of stock."

**How to apply:** Any new surface that reads or displays product stock must read
`stock`/`palletStock`, never `baseUnitStock`. If you ever need `baseUnitStock` to be
correct, you must also patch the batch sync to write it — otherwise it will drift.
