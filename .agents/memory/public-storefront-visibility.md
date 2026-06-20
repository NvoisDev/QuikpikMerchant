---
name: Public storefront field visibility
description: Hiding storefront fields (price/MOQ/stock/pack-size) must be enforced server-side, not just in the UI.
---

# Public storefront field visibility

Wholesalers control which product details PUBLIC (unauthenticated) visitors
see via store-wide flags on `users`: `priceDisplayMode` ('hidden'|'shown'),
`moqVisible`, `stockVisible`, `packSizeVisible`.

**Rule:** any field a wholesaler can hide MUST be redacted in the public API
response, not only gated in the React render. The two public endpoints that
must redact are `/api/public/wholesaler/:slug` (store grid) and
`/api/public/products/:slug` (single product page). Both surfaces are in
scope together — a change to one usually needs the same change to the other.

**Why:** UI-only gating still ships the real values in the JSON, so a public
visitor can read hidden price/stock/MOQ/pack data in network/devtools. That
defeats the purpose of the toggle and is a privacy leak.

**How to apply:** when adding a new hideable storefront field, (1) add the
flag to the public wholesaler/product selects, (2) null the value in the
response when the flag is off, (3) gate the render, and (4) keep the default
conventions consistent: show-by-default fields use `flag !== false`,
hide-by-default (stock) uses `flag === true`.
