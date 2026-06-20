# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform provides an e-commerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors. Theme system with dynamic coloring for navigation tabs.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Enhanced quantity selection modals with free-type input and clear MOQ guidance. Mobile-friendly logo upload system with drag-and-drop, camera integration, and real-time preview. Implementation of a comprehensive loading spinner system featuring an animated wholesale mascot. Quote Margin Calculator (wholesaler-only) displaying live margin and overview.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, comprehensive image display enhancement with optimization. Performance optimizations include React Query caching, lazy loading, import tree shaking, debounced search, and optimized images. Comprehensive payment duplication prevention. Customer registration request system. Registration-aware seller switching. Centralized currency formatting. Bidirectional customer profile sync. Standardized customer editing. Complete Stock Management System with automatic inventory decrementation, movement tracking, and low/out-of-stock alerts. Multi-Wholesaler Marketplace Platform with invitation-based onboarding, data isolation, wholesaler selection, and automated welcome notifications. Frontend code structure optimized through component extraction.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal) with role-based access control and multi-wholesaler customer management.
- **Core Inventory System**: Single source of truth architecture using `baseUnitStock` with derived calculations for packs and pallets. `InventoryCalculator` handles conversions and validations.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management, business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system. Per-Wholesaler Customer Fee Override system with a 3-tier fallback. "Pay Later" functionality with wholesaler control and proper fee calculation. Comprehensive customer onboarding and access management with analytics and dynamic pricing. Wholesaler preview store access. Advanced business intelligence. Multi-Wholesaler Customer Lifecycle Management. Stripe Dual-Mode for live and test environments.

### Admin Control Centre (`/admin`, `/super-admin`)
- **Layout**: Sidebar-driven with 8 sections: Overview, Wholesalers, Customers, Orders, Products, Financials, System Settings, Customer Map.
- **Features**: Live KPI cards, wholesaler and customer management tables with detail drawers, global order list with filters, cross-wholesaler product oversight, financial breakdowns, system settings, subscription plan management, and a customer geocoding map. Quick actions for resending invoices and contacting wholesalers. Responsive design. New schema column `users.is_suspicious` and new dedicated admin API endpoints.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.
- **Custom Store URL**: `users.store_slug` for custom wholesaler store URLs, resolving via ID or slug.
- **Additional Tables**: `customerRegistrationRequests`, `priceLists`, `priceListItems`, `priceListAssignments` for customer price list system. `products.cost_price` for wholesaler margin calculations.
- **Storage Architecture**: Modular architecture split into domain files using an inheritance chain.
- **Multi-Collection Address Support**: Wholesalers manage multiple named pickup locations via `collectionAddresses` table, with a full fallback chain for addresses. CRUD API available.
- **Edit Quote Before Payment**: Wholesalers can edit pending quotes, triggering stock restoration, item recalculations, new Stripe session creation, and audit logging.
- **Quote Activity Log**: Append-only audit trail for quotes in `quoteActivityLogs` table, providing a timeline of actions with detailed changes.
- **Category Matching**: `products.category` is free text; the central `categories` table is the source of truth for the selectable list. Product counts, rename bulk-updates, and delete clearing all match category text case- and whitespace-insensitively (`LOWER(TRIM(...))`) so legacy spelling/casing variants are included. A one-time startup pass canonicalises existing product category text to the matching `categories.name`.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, AI-powered image generation.
- **Mapping & Location Services**: Google Maps API, Google Places.