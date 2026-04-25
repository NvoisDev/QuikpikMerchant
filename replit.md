# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an e-commerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors. Theme system with dynamic coloring for navigation tabs.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Default table layout for orders with smart search and filtering, dynamic delivery method display. Clean shopping summary cards. Consistent branding footer across the platform. Product tags indicating selling format ("Individual Units", "Units & Pallets"). Enhanced quantity selection modals with free-type input and clear MOQ guidance. Interactive order confirmation celebration animation. Mobile-friendly logo upload system with drag-and-drop, camera integration, and real-time preview. Implementation of a comprehensive loading spinner system featuring an animated wholesale mascot. Quote Margin Calculator: editable cost-per-line, live margin (£/%) display, Margin Overview in Quote Summary (Total Cost, Revenue, Margin £/%, Weight) — wholesaler-only, never exposed to customers.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, comprehensive image display enhancement with optimization. Performance optimizations include React Query caching, lazy loading, import tree shaking, debounced search, and optimized images. Comprehensive payment duplication prevention. Customer registration request system. Registration-aware seller switching. Centralized currency formatting. Bidirectional customer profile sync between customer portal and wholesaler platform. Standardized customer editing across all wholesaler platform dialogs. Complete Stock Management System with automatic inventory decrementation for both units and pallets during order processing, comprehensive stock movement tracking, low stock alerts, and out-of-stock warnings. Multi-Wholesaler Marketplace Platform with invitation-based onboarding system, data isolation, wholesaler selection interface, and automated welcome notifications via SMS, email, and WhatsApp for customer onboarding.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation. Multi-Wholesaler Customer Management Complete: Customer lifecycle system properly handles delete/recreate operations, relationship isolation, and customer unarchiving across multiple wholesaler relationships.
- **Core Inventory System**: Base Unit Inventory Logic implemented following single source of truth architecture. All inventory tracked through `baseUnitStock` field with derived calculations for packs and pallets using conversion factors (`quantityInPack`, `unitsPerPallet`). Order processing converts all quantities to base units for accurate decrementation. Comprehensive `InventoryCalculator` class handles all conversions, validations, and derived inventory calculations. Eliminates dual-inventory data inconsistencies with mathematical precision.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management (tiered plans, permissions, usage tracking), business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system. Critical fixes for Stripe API version and authentication flow simplification. Implementation of comprehensive customer onboarding and access management system with SMS, email, WhatsApp notifications, customer analytics, dynamic pricing optimization, and a customer registration request review system. Wholesaler preview store access implemented. Advanced business intelligence capabilities including comprehensive customer insights service with behavioral analytics, dynamic pricing optimization based on demand patterns, and marketplace expansion opportunities identification. Immediate business impact features including comprehensive order tracking notifications via SMS/WhatsApp/email, intelligent quick order templates, frequently ordered products analysis, and one-click reorder functionality. Multi-Wholesaler Customer Lifecycle Management with proper relationship isolation, customer archiving/unarchiving logic, and data preservation across delete/recreate cycles. Parcel2Go integration removed — all shipping routes that called the P2G API are deleted; `server/parcel2go.ts` is gone; shipping creation falls back to local reference generation. Delivery cost (shippingCost) on the Thank You page now correctly reads from Stripe metadata instead of defaulting to £0. **Stripe Dual-Mode**: `server/stripeConfig.ts` is the single source of truth; set `STRIPE_ENVIRONMENT=live` plus `STRIPE_LIVE_SECRET_KEY`/`STRIPE_LIVE_PUBLISHABLE_KEY`/`STRIPE_LIVE_WEBHOOK_SECRET` to go live. Test accounts (`is_test_account=true`) always force test mode. Webhook handler tries all configured secrets so test and live webhooks can coexist. Frontend fetches publishable key from `/api/config/stripe-key` at checkout time.

### Admin Control Centre (`/admin`, `/super-admin`)
- Sidebar-driven layout (separate from wholesaler `AppLayout`) with 8 sections: Overview, Wholesalers, Customers, Orders, Products, Financials, System Settings, Customer Map
- **Overview**: Live KPI cards (active wholesalers, orders this month, GMV, MRR) + alert strip for stuck orders, plan breakdown, revenue breakdown
- **Wholesalers**: Table with status toggles + detail drawer showing recent 10 orders, GMV, plan, last-active date
- **Customers**: Free-text/phone search across all retailers (`GET /api/admin/customers`), results table, side panel with order history, "Flag as suspicious" toggle (`PATCH /api/admin/customers/:id/flag`)
- **Orders**: Global order list with status/wholesaler/date-range filters, Resend Invoice per row (`POST /api/admin/orders/:id/resend-invoice`)
- **Products Oversight**: Cross-wholesaler product table (`GET /api/admin/products`) with missing cost price / low margin (<10%) / zero stock visual badges, sort by margin ascending
- **Financials**: Revenue breakdown with wholesaler-level drill-down, date presets, per-order breakdown
- **System Settings**: Read-only fee config cards, subscription plan info, subscription activation utility
- **Plans**: Full subscription plan management — table of all plans with subscriber count + MRR, "New Plan" modal (creates Stripe Product+Price for paid plans, derives planId slug, stores billingInterval and version), Archive plan (non-destructive, hides from new signups), Change Plan from wholesaler drawer (proration via Stripe if sub exists, admin override if no Stripe sub)
- **Customer Map**: Preserved geocoding map with type filters and re-geocode
- **Quick Actions**: Modal for Resend Invoice (order ID input) + Contact Wholesaler (mailto)
- Responsive: sidebar collapses to hamburger on mobile, main content fills viewport
- New schema column: `users.is_suspicious` (boolean, default false)
- New endpoints: `GET /api/admin/customers`, `GET /api/admin/customers/:id/orders`, `PATCH /api/admin/customers/:id/flag`, `GET /api/admin/products`, `GET /api/admin/alerts`, `GET /api/admin/wholesalers/:id/orders`, `POST /api/admin/orders/:id/resend-invoice`

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.
- **Additional Tables**: `customerRegistrationRequests` for managing access requests. `priceLists`, `priceListItems`, `priceListAssignments` for customer price list system. `products.cost_price` (decimal, optional) for wholesaler margin calculations — never exposed to customers.
- **Storage Architecture**: Split into 7 domain files under `server/storage/` using inheritance chain: `UserStorageBase → ProductStorage → OrderStorage → CustomerStorage → BroadcastStorage → CustomerMgmtStorage → DeliveryStorage → DatabaseStorage`. `server/storage.ts` holds IStorage interface + final class (1,197 lines, down from 5,372).

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, AI-powered image generation.
- **Mapping & Location Services**: Google Maps API, Google Places.
- **Shipping Integration**: Parcel2Go API.