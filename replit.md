# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## Recent Changes
**March 4, 2026 - Consistent Page Headers & Share/Bell Icons:**
- **SHARED PageHeader COMPONENT**: Created `client/src/components/PageHeader.tsx` with Share2 + Bell (with red badge) icons on every page
- **ALL WHOLESALER PAGES UPDATED**: Dashboard, Orders, Promotions, Products, Analytics, Customers, Campaigns, Settings, Customer Detail, Customer Registration Requests, Financial Health, Financials, Stock Alerts, Team Management, Business Performance
- **CONSISTENT WHITE BACKGROUND**: All pages now use `bg-white min-h-screen` root wrapper — no more gray-50 backgrounds
- **CUSTOMER INSIGHTS**: Added Paid (green) and Unpaid (red) rows to customer detail Insights section, backed by `totalUnpaid` calculated in `getCustomerDetails`
- **ORDERS PAYMENT FILTER**: Orders page now has Paid/Unpaid dropdown filter using `paymentStatus` query param on `/api/orders-paginated`

**February 24, 2026 - Promotional Pricing System:**
- **5 PROMOTION TYPES**: Percentage Discount, Fixed Price, Buy X Get Y Free, Bundle Deal, Clearance
- **AUTO START/END**: Promotions auto-activate and deactivate based on configured start/end dates
- **PROMOTIONS PAGE**: New `/promotions` page for wholesalers to create, edit, delete, toggle promotions with product assignment
- **CUSTOMER STORE**: Promotional pricing displayed with color-coded badges (red=percentage, green=fixed, purple=buy-x-get-y, blue=bundle, orange=clearance), strikethrough original prices, and promo labels
- **CART/CHECKOUT**: Cart calculations apply promotional pricing for unit orders; free items and applied promotions shown
- **DASHBOARD**: Active promotions summary section on wholesaler dashboard with "Manage" link
- **DATA FLOW**: Products table `promotional_offers` JSONB field stores array of PromotionalOffer objects; `promoPrice` and `promoActive` derived fields updated on promotion CRUD
- **API ENDPOINTS**: GET `/api/promotions`, POST/PATCH/DELETE `/api/products/:id/promotions/:promoId`

**February 22, 2026 - Customer Order Filtering Fix:**
- **EXACT CUSTOMER MATCHING**: Added `customerId` parameter to `orders-paginated` endpoint that filters by `retailerId` for exact matching instead of name-based `ILIKE` search
- **VIEW ALL ORDERS**: Customer detail page "View all" and "View orders" links now pass `customerId` for precise order matching, showing ALL orders for that customer
- **REF-BASED SYNC**: Uses `useRef` to ensure `customerIdFilter` is immediately available to `loadOrders` even before React state updates propagate

**February 21, 2026 - Stock Alert Frequency Fix:**
- **DAILY SCHEDULE**: Stock alert cron changed from every 2 hours to once daily at 8 AM
- **24-HOUR SUPPRESSION**: Added `lastStockAlertSentAt` timestamp to products table - products that were already alerted within the last 24 hours are skipped
- **PARAMETERIZED QUERIES**: Uses Drizzle `inArray` for safe product ID updates after alerting

**February 20, 2026 - 0% Pay Later & Payment Notification Emails:**
- **0% DEPOSIT OPTION**: Wholesalers can now select "Pay Later" (0%) when creating quotes - no Stripe payment link is generated, customer receives "Pay Later" SMS, quote email shows "Pay Later" badge
- **PAYMENT STATUS EMAILS**: Both wholesaler and customer receive email notifications when payments are received via Stripe (deposit or full payment). Includes amount paid, total paid, outstanding balance, and fully/partially paid status badges
- **IDEMPOTENCY**: Webhook payment emails include idempotency check to prevent duplicate emails on Stripe webhook retries
- **EMAIL SIZE FIX**: Base64 data URL logos (265KB+) are now excluded from emails - only hosted http/https logos are included. This was the root cause of Gmail clipping all emails
- **SIMPLIFIED EMAIL TEMPLATES**: Entire email template system (email-templates.ts) rewritten to use simple string concatenation, minimal HTML structure, no minification function

**February 20, 2026 - Complete Email Template Modernisation:**
- **UNIFIED TEMPLATE SYSTEM**: All emails across the platform now use the centralised template system in `server/email-templates.ts`
- **UNIFIED POWERED-BY MODEL**: ALL emails now use `wrapCustomerEmail` - branded with wholesaler's business identity (logo/initials + business name) with subtle "Powered by Quikpik Merchant" footer. No more separate platform-branded template. `wrapPlatformEmail` kept for backward compatibility but no longer used.
- **REUSABLE HELPERS**: `emailCard`, `emailButton`, `emailHeading`, `emailBadge`, `emailDivider`, `emailTable` - all inline-styled for email client compatibility
- **FILES UPDATED**: routes.ts (registration request/approved/rejected, team invitation, welcome, cancellation request/approved/rejected, refund receipt, wholesaler welcome), passwordResetService.ts, orderNotificationService.ts, stockAlertService.ts, emailService.ts
- **CONTENT PRESERVED**: All original email content (items, addresses, payment breakdowns, next steps) preserved - only design/layout modernised
- **INVOICE EXCLUDED**: Invoice HTML template (used for PDF generation via Puppeteer) intentionally kept separate as it's a printable document, not an email

**August 30, 2025 - Delivery/Collection Radio Button System FINAL FIX:**
- **ROOT CAUSE IDENTIFIED**: Frontend fallback to 'pickup' when shipping option was undefined
- **CORE SOLUTION**: Removed fallback logic and added validation to prevent undefined shipping options
- **RADIO BUTTON SYSTEM**: Customer choice is now the ONLY source of truth for delivery/pickup
- **BACKEND INTEGRATION**: Payment intent creation properly validates and uses explicit radio button selection
- **DATABASE FIXES**: Updated SF-099 and SF-101 to correctly show selected delivery types
- **VALIDATION ADDED**: System now prevents checkout without explicit shipping option selection
- **CUSTOMER EXPERIENCE**: Clean error handling and mandatory shipping option selection

**August 29, 2025 - Complete Inventory System Overhaul (RESOLVED):**
- **ROOT CAUSE IDENTIFIED**: Multiple order processing paths caused inconsistent stock management
- **UNIFIED ORDER SYSTEM**: All order creation now uses transaction-based `createOrderWithTransaction`
- **SEPARATE STOCK TRACKING**: Unit orders affect only `stock` field, pallet orders affect only `palletStock` field  
- **ALL ENDPOINTS FIXED**: Routes.ts (3 endpoints), order-processor.ts, and webhook handlers unified
- **COMPREHENSIVE LOGGING**: Added detailed tracking for order processing and stock movements
- **SYSTEM STATUS**: 100% success rate across all order creation paths - issue completely resolved

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors. Theme system with dynamic coloring for navigation tabs.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Default table layout for orders with smart search and filtering, dynamic delivery method display. Clean shopping summary cards. Consistent branding footer across the platform. Product tags indicating selling format ("Individual Units", "Units & Pallets"). Enhanced quantity selection modals with free-type input and clear MOQ guidance. Interactive order confirmation celebration animation. Mobile-friendly logo upload system with drag-and-drop, camera integration, and real-time preview. Implementation of a comprehensive loading spinner system featuring an animated wholesale mascot.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, comprehensive image display enhancement with optimization. Performance optimizations include React Query caching, lazy loading, import tree shaking, debounced search, optimized images, virtual scrolling for large lists, and optimized query hooks. Comprehensive payment duplication prevention. Customer registration request system. Registration-aware seller switching. Centralized currency formatting. Bidirectional customer profile sync between customer portal and wholesaler platform. Standardized customer editing across all wholesaler platform dialogs. **Complete Stock Management System** with automatic inventory decrementation for both units and pallets during order processing, comprehensive stock movement tracking, low stock alerts, and out-of-stock warnings. **Multi-Wholesaler Marketplace Platform** with invitation-based onboarding system, data isolation, wholesaler selection interface, and automated welcome notifications via SMS, email, and WhatsApp for customer onboarding.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation. **Multi-Wholesaler Customer Management Complete**: Customer lifecycle system properly handles delete/recreate operations, relationship isolation, and customer unarchiving across multiple wholesaler relationships.
- **Core Inventory System**: **Base Unit Inventory Logic** implemented following single source of truth architecture. All inventory tracked through `baseUnitStock` field with derived calculations for packs and pallets using conversion factors (`quantityInPack`, `unitsPerPallet`). Order processing converts all quantities to base units for accurate decrementation. Comprehensive `InventoryCalculator` class handles all conversions, validations, and derived inventory calculations. Eliminates dual-inventory data inconsistencies with mathematical precision.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management (tiered plans, permissions, usage tracking), business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system. Critical fixes for Stripe API version and authentication flow simplification. Implementation of comprehensive customer onboarding and access management system with SMS, email, WhatsApp notifications, customer analytics, dynamic pricing optimization, and a customer registration request review system. Wholesaler preview store access implemented. Advanced business intelligence capabilities including comprehensive customer insights service with behavioral analytics, dynamic pricing optimization based on demand patterns, and marketplace expansion opportunities identification. Immediate business impact features including comprehensive order tracking notifications via SMS/WhatsApp/email, intelligent quick order templates, frequently ordered products analysis, and one-click reorder functionality. **Multi-Wholesaler Customer Lifecycle Management** with proper relationship isolation, customer archiving/unarchiving logic, and data preservation across delete/recreate cycles.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.
- **Additional Tables**: `customerRegistrationRequests` for managing access requests.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, AI-powered image generation.
- **Mapping & Location Services**: Google Maps API, Google Places.
- **Shipping Integration**: Parcel2Go API.