---
name: Multi-currency server-side pattern
description: How to inject currency symbol into server-side messages (email/SMS/WhatsApp) correctly
---

## Rule
Every server-side handler that sends customer-facing text (email, WhatsApp, SMS) must derive `sym` from the wholesaler's currency, not hardcode `£`.

**Why:** Phase 1 multi-currency support — wholesalers outside UK need their own symbol displayed in all outbound communications.

## How to apply

### In route files (`server/routes/*.ts`)
```typescript
// 1. Add to the shared import block at the top:
import { getCurrencySymbol, ... } from "./shared";

// 2. After the wholesaler fetch + null-check, inject sym:
const wholesaler = await storage.getUser(wholesalerId);
if (!wholesaler) return res.status(404).json({ error: 'Not found' });
const sym = getCurrencySymbol((wholesaler as any)?.preferredCurrency || (wholesaler as any)?.defaultCurrency || 'GBP');

// 3. Use sym in all customer-facing strings:
`Total: ${sym}${total.toFixed(2)}`
```

### In service files (`server/services/*.ts`)
```typescript
import { getCurrencySymbol } from "../../shared/utils/currency";
// Then derive sym the same way after getting wholesaler data.
```

### For helper functions that format prices
Add `sym = '£'` as optional param so callers can pass the correct symbol:
```typescript
function formatPrice(price: string | null, sym = '£'): string {
  return `${sym}${Number(price).toFixed(2)}`;
}
```

## Intentionally left as `£` (do NOT change)
- Stripe session `description` field (internal Stripe dashboard metadata)
- `fmtGBP(...)` calls in audit log entries (append-only internal trail, always GBP)
- `templateCatalog.ts` sample/preview templates (hardcoded GBP examples for UI)
- Code comments

## Files already updated (as of this implementation)
All major server-side customer communication paths are fixed:
- payments-quotes.ts, orders-lifecycle.ts, orders-comms.ts
- payment-reminders.ts, sendgrid-service.ts, price-lists.ts
- marketplace-orders-actions.ts, campaigns.ts
- orderCancellationNotificationService.ts, promotionNotificationService.ts
