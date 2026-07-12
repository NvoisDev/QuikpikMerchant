# Threat Model

## Project Overview

Quikpik is a public, internet-facing multi-tenant B2B wholesale platform. It uses a React/Vite frontend and a Node.js/Express backend with PostgreSQL, Stripe, Twilio/WhatsApp, SendGrid, Google OAuth for wholesalers, and SMS OTP for customers. The main production risk is not generic web traffic; it is cross-tenant access, exposure of private wholesaler/customer business data, abuse of public marketplace routes, and compromise of privileged wholesaler or admin sessions.

Production assumptions for this scan:
- `NODE_ENV` is `production` in deployed environments.
- The deployment is public (`https://quikpik.app`), so unauthenticated routes are reachable from the public internet.
- Replit terminates TLS for deployed traffic.
- Dev-only paths such as tests, local scripts, and development-only auth helpers are out of scope unless production reachability is demonstrated.

## Assets

- **Wholesaler accounts and sessions** — owner, admin, and team-member sessions control catalogs, pricing, customers, orders, payouts, and messaging.
- **Customer accounts and sessions** — customer OTP sessions authorize access to order history, invoices, address books, and wholesaler-specific pricing.
- **Tenant business data** — product catalogs, stock levels, pricing, customer lists, order history, revenue, group membership, and operational analytics are commercially sensitive.
- **Payment state and Stripe identities** — checkout sessions, payment intents, payouts, connected account IDs, and order settlement state affect money movement and financial integrity.
- **Platform/admin powers** — super-admin and impersonation capabilities can cross tenant boundaries and expose or modify any wholesaler’s data.
- **Application secrets** — session secrets, OAuth secrets, recovery secrets, Stripe secrets, Twilio/SendGrid credentials, and object-storage credentials.

## Trust Boundaries

- **Browser/mobile client to Express API** — all client input is untrusted, including query parameters, route params, cookies, and JSON bodies.
- **Public marketplace/customer discovery to tenant data** — public and semi-public storefront routes sit close to private tenant catalogs and relationship data; accidental overexposure is a primary risk.
- **Authenticated wholesaler/team-member to effective wholesaler identity** — many routes derive access through `resolveWholesalerId`, so mistakes here can cause cross-tenant access.
- **Customer session/cookie to customer data** — customer access depends on PostgreSQL session state and the signed `customer_auth` cookie; both must stay bound to the correct wholesaler and customer.
- **Admin/platform to impersonated wholesaler** — impersonation introduces a high-risk privilege boundary and must never be reachable without server-side admin checks.
- **API to PostgreSQL** — raw SQL, dynamic filtering, and cross-tenant joins can leak or corrupt data if authorization is not enforced before querying.
- **API to third parties** — Stripe, Twilio, SendGrid, Google, and object storage are trusted integrations that must not accept attacker-controlled data in ways that bypass validation or leak secrets.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/routes/**`
- **Highest-risk areas:** `server/routes/auth-core.ts`, `server/googleAuth.ts`, `server/routes/customer-auth.ts`, `server/routes/marketplace-*.ts`, `server/routes/public-store.ts`, `server/routes/system.ts`, `server/routes/payments-*.ts`, `server/routes/admin-*.ts`
- **Public surfaces:** marketplace browsing/discovery, public storefront search, customer OTP/auth, object download and signed-upload helpers, customer order reads, webhook receivers intended to be public but signature-verified
- **Authenticated tenant surfaces:** wholesaler/team-member product, order, analytics, customer, and settings APIs
- **Admin surfaces:** `/api/admin/**`, impersonation paths, plan/system settings routes
- **Usually dev-only / low-priority:** `tests/**`, `scripts/**`, `attached_assets/**`, development-only quick-login helpers guarded by `NODE_ENV !== 'development'`

## Threat Categories

### Spoofing

The application supports multiple auth systems: Google OAuth for wholesalers, email/password for team members, and SMS OTP for customers. The system must ensure no alternate route can mint a valid session without completing the intended authentication flow, and any support or recovery mechanism must be at least as strong as the primary login path. Public webhook receivers must verify provider signatures before accepting events.

### Tampering

Customers and wholesalers can both trigger order and pricing flows. All prices, discounts, fees, stock changes, refunds, and order-state transitions must be recalculated and authorized server-side. Any admin or impersonation action must be tied to the authenticated server-side identity, not client-provided claims or headers alone.

### Information Disclosure

This project stores commercially sensitive tenant data, not just ordinary profile fields. Public or customer-facing routes must never reveal another tenant’s catalogs, revenue, customer relationships, contact details, internal IDs, or platform-wide analytics unless that data is intentionally public. Logs and error responses must avoid leaking secrets or unnecessary PII.

### Denial of Service

Public OTP, discovery, and enquiry endpoints are reachable from the internet and can trigger SMS, email, database work, or expensive searches. These routes must enforce rate limits and sensible bounds so an attacker cannot exhaust third-party quotas or degrade service.

### Elevation of Privilege

Cross-tenant mistakes are equivalent to privilege escalation in this app. A customer must never escalate into another customer’s or wholesaler’s data; a team member must remain inside their assigned wholesaler; and only platform admins may use impersonation or admin APIs. Any hidden support or recovery path that grants direct session access is a high-risk privilege-escalation vector.