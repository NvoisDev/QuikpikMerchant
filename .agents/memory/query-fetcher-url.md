---
name: Default React Query fetcher uses only queryKey[0]
description: How this app's default queryFn builds request URLs from the query key, and the trap it creates.
---

The default `queryFn` in `client/src/lib/queryClient.ts` (`getQueryFn`) fetches
`queryKey[0]` as the URL and ignores every later segment. It does NOT join array
segments into a path.

**Why it matters:** The generic fullstack guidelines tell you to use array keys for
hierarchical URLs (`queryKey: ['/api/x', id]` → `/api/x/id`). In THIS app that is a
silent trap: such a key fetches `/api/x` (the first element only), not `/api/x/id`.

**How to apply:**
- For a parameterized GET with the default fetcher, put the full URL in `queryKey[0]`
  (e.g. `['/api/price-lists/123']`), OR
- Keep a segmented key for cache hierarchy (`['/api/price-lists', id]`) but supply an
  explicit `queryFn` using `apiRequest('GET', \`/api/price-lists/${id}\`)`. The segmented
  key still benefits from prefix invalidation of `['/api/price-lists']`.
