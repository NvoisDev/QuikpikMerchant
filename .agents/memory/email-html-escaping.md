---
name: Email HTML escaping architecture
description: Where escaping happens in the server email system, and what each helper does/doesn't escape — read before touching any email HTML.
---

# Email HTML escaping

There is ONE shared `escapeHtml(value: string|number|null|undefined): string` (returns '' for null/undefined), exported from `server/email-templates.ts` and re-exported from `server/routes/shared.ts`. Do not create local copies.

## What is escaped centrally (do NOT re-escape at call sites)
- `branding.businessName` and `branding.logoUrl` — escaped inside `buildHeader`/`wrapCustomerEmail`.
- The `preheader` option passed to `wrapCustomerEmail` — escaped centrally.

Re-escaping these at call sites double-encodes (e.g. `&amp;amp;`).

## Leaf helpers escape their text args (safe-by-default) — do NOT pre-escape
- `emailHeading(text)`, `emailBadge(text)` and `emailButton(text, url)` escape their leaf args **internally**: `text` is HTML-escaped; in `emailButton` the `url` is run through `sanitizeEmailUrl()` (only http(s)/mailto/tel/relative-or-anchor allowed, everything else → `#`) then attribute-escaped.
- So pass these **raw** user text/URLs — do NOT call `escapeHtml(...)` on the text/url arg yourself or you'll double-encode (`&amp;amp;`, `&amp;#39;`).
- `color`/`size`/`borderColor`/`bgColor` options are developer-controlled style constants and are NOT escaped — never pass user input there.

## Composition helpers still take raw HTML (you MUST escape user values inside)
- `emailCard(content)` and `emailTable(headers, rows)` interpolate their args **verbatim** so callers can compose markup. Every user-controlled leaf value inside a card body or table cell must be `escapeHtml(...)`'d at the call site (same for any value dropped into a raw template literal).

**Why:** Task #1374 (XSS in emails: user text rendered as live HTML in SendGrid bodies). Follow-up hardened the leaf helpers so a future contributor can't reintroduce the leak by passing raw user text/URLs into headings/badges/buttons.
**How to apply:** Pass raw text/URLs to `emailHeading`/`emailBadge`/`emailButton`; escape user leaf values yourself only inside `emailCard`/`emailTable`/raw literals. Escape only the user text *inside* intentional spans (e.g. promo `<br/><span>` notes), not the markup.

## Plaintext-into-HTML case
In `orderNotificationService`, `emailContent.body` is plaintext status copy that can contain user values (wholesalerName etc.). Escape it at the final HTML insertion point (`escapeHtml(emailContent.body)`); the same string is reused raw for SMS/WhatsApp, so don't escape it at the source.

## Notes
- `sendgrid-service.ts` imports the template helpers dynamically (`await import('./email-templates')`) but `escapeHtml` is imported statically at top — safe, `email-templates.ts` does not import the services (no cycle).
- `templateCatalog.ts` uses hardcoded SAMPLE data only — no escaping needed.
