---
name: Quote-edit stock recompute from batch sum
description: Why PATCH /api/quotes/:id can return a spurious OUT_OF_STOCK in tests, and how stock is recomputed on edit.
---

Editing a quote (PATCH /api/quotes/:id in server/routes/payments-quotes.ts) restores the
original lines' stock and then re-allocates the new lines, all inside one transaction. On
restore AND on allocation it recomputes `products.stock`/`palletStock` from `SUM(productBatches.quantity)`
where status='active' — batches are the single source of truth, derived pallet stock = floor(floor(unitStock/qip)/upp).

**Consequence (testing trap):** a product whose `products.stock` was set directly (e.g. a test
fixture with stock=100000 but NO productBatches rows) has that value DISCARDED the moment an edit
restores via batches — stock becomes the batch sum (which only covers the original lines' restored
qty). A newly-added pallet line on a previously units-only order then hits
"Insufficient stock ... after concurrent update. 0 pallets available" even though the fixture
looked well-stocked.

**How to apply:** when writing tests that PATCH a quote and add/realloc lines, seed an ample
active `productBatches` row for the product (e.g. quantity 100000, status 'active') so the
recomputed batch sum stays large. Also clean up productBatches by productId in test teardown —
every quote edit creates `RETURN-*` batches on restore.

**Why:** discovered while adding pallet-price scaling to the 'all' price scope; the same-product
units+pallets edit kept 400ing on stock until an active batch was seeded.
