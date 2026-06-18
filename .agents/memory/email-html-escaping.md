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

## What is NOT escaped (you MUST escape user values before passing)
- The composition helpers `emailCard`, `emailTable`, `emailHeading`, `emailButton`, `emailBadge` all take **raw HTML** and interpolate it verbatim. They do not escape their arguments — that is by design so callers can compose markup.
- Therefore every user-controlled leaf value (customer/wholesaler/product/business names, addresses, phone, email, promo labels, free-text messages, tracking numbers) interpolated into an email body must be wrapped in `escapeHtml(...)` at the call site before it reaches these helpers or a raw template literal.

**Why:** Task #1374 (XSS in emails). User text was rendered as live HTML in SendGrid email bodies.
**How to apply:** When adding/editing any server email, escape leaf user values; leave composed helper output and intentional spans (e.g. promo `<br/><span>` notes) unescaped — escape only the user text *inside* them.

## Plaintext-into-HTML case
In `orderNotificationService`, `emailContent.body` is plaintext status copy that can contain user values (wholesalerName etc.). Escape it at the final HTML insertion point (`escapeHtml(emailContent.body)`); the same string is reused raw for SMS/WhatsApp, so don't escape it at the source.

## Notes
- `sendgrid-service.ts` imports the template helpers dynamically (`await import('./email-templates')`) but `escapeHtml` is imported statically at top — safe, `email-templates.ts` does not import the services (no cycle).
- `templateCatalog.ts` uses hardcoded SAMPLE data only — no escaping needed.
