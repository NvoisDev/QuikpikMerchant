---
name: React Query render-gating needs a fetch timeout
description: Why pages that gate their whole render on a query's isLoading can become a permanent blank, and how impersonation fetch works.
---

## Rule
Any query whose `isLoading` gates a whole page's render MUST use a fetch with an
AbortController timeout. React Query's `isLoading` stays true until the fetch
*settles*; a stalled connection (no response body) never settles, so the page is
stuck on its skeleton forever (looks like a permanent blank page).

**Why:** The wholesaler product detail page used a bare `fetch()` with no timeout
and gated the entire render on the product query's loading flag. A stalled
request on production produced a permanent blank page. There is **no global
request timeout** in this app — `queryClient` defaults set staleTime/retry but
not an abort timeout, and several pages use their own inline `queryFn` with raw
`fetch` instead of `getQueryFn`.

**How to apply:** Wrap render-gating queries with an AbortController timeout (see
`client/src/lib/product-detail-fetch.ts`). Also expose `isError`/`refetch` and
render an explicit error + retry state, not just a loading skeleton — otherwise a
failed request either hangs or falls through to a misleading "not found".

## Impersonation fetch gotcha
Admin impersonation is implemented as a **global `window.fetch` monkeypatch**
(`client/src/lib/impersonation.ts`), not session-only. It injects
`X-Admin-Impersonate` / `X-Impersonate-Token` headers for same-origin `/api/`
requests, so even bare `fetch()` calls carry impersonation. It merges
`{ ...(init||{}), headers }`, so a passed `signal` (AbortController) is preserved.
