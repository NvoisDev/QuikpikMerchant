# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
**CRITICAL REQUIREMENT**: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## Primary Business Account
**Wholesaler Account**: Michael Ogunjemilua (hello@quikpik.co)
- **Google ID**: 104871691614680693123
- **Business**: Surulere Foods Wholesale
- **Products**: 14 items
- **Subscription**: Premium tier, active

**Primary Customer Account**: Michael Ogunjemilua (mogunjemilua@gmail.com)
- **Customer ID**: customer_michael_ogunjemilua_main
- **Phone**: +447507659550 (authentication verified)
- **Orders**: 134 orders properly attributed to customer account
- **Customer Portal**: /customer/104871691614680693123/+447507659550
- **Total Spending**: £33,281.69 (corrected attribution)
- **Group Assignment**: London Retail Group (required for portal access)

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript.
- **Build Tool**: Vite.
- **UI Framework**: Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors.
- **UI/UX Decisions**: Default table layout for orders with smart search and filtering, dynamic delivery method display, simplified interfaces, and consistent brand-integrated clean design with green theme colors.
- **Recent Enhancement**: Comprehensive Order Management System with professional table layout, advanced search/filtering, order detail modals, and full customer information display. Resolved critical 39MB response size issue through data optimization. Fixed production deployment issue where customer products API returned HTTP 500 due to missing SQL import - development environment now returns 11 products successfully.
- **Product Edit Function Fixed (Aug 2025)**: Resolved critical stack overflow errors in product edit functionality. Root cause was circular references in form validation watchers calling form.setValue(). Disabled problematic auto-calculation useEffect hooks and implemented safe form population. Edit dialog now opens successfully with product data pre-populated for editing.
- **Code Cleanup & Bug Analysis (Aug 2025)**: Conducted comprehensive cleanup removing 8 unused order page files, unused imports, dead code, and debug statements. Fixed button state isolation issue where "Mark Fulfilled" clicks affected all buttons. Updated Total column to show wholesaler earnings (subtotal × 96.7%) instead of customer payment amount. Removed unused getOrderTimeline function and consolidated Logo component. All LSP diagnostics resolved.
- **Platform Analytics Separation (Aug 2025)**: Removed Platform Insights section from individual wholesaler dashboards as it contained platform-wide data (total revenue £387,741.30, 15 active wholesalers, 166 total orders) that should only be visible to the business owner. Individual wholesalers now see only their own business metrics. Super admin functionality needed for business owner access to platform-wide analytics.
- **Business Performance Analytics Consolidation (Aug 2025)**: Successfully consolidated three separate analytics sections (Analytics Dashboard, Customer Insights, Inventory Insights) into a unified Business Performance tab system. Implemented comprehensive tabbed interface integrating all analytics functionality including real-time revenue tracking, customer segmentation analysis, inventory optimization insights, and performance metrics. Removed redundant navigation items for cleaner user experience while maintaining full analytics capabilities through complete backend API endpoints.
- **Premium Subscription Enforcement for Business Performance (Aug 2025)**: Enhanced Business Performance analytics with robust premium subscription restrictions. Added server-side validation to all analytics endpoints (/api/analytics/dashboard, /api/analytics/customers, /api/analytics/inventory, /api/financial-health) requiring premium tier access. Implemented canAccessBusinessPerformance function in subscription hooks with proper error handling. All Business Performance features now properly restricted to premium subscription users with clear upgrade prompts for non-premium users.
- **Customer Portal Authentication Fix (Aug 2025)**: Resolved critical customer portal authentication issue where customers showed "0 orders" due to missing customer group assignments. Fixed authentication system requiring customers to be in customer groups for portal access. Added Michael Ogunjemilua to London Retail Group, enabling proper authentication and order history display (134 orders). Updated customer portal URL from incorrect phone number to verified +447507659550.
- **Order Balance Display Correction (Aug 2025)**: Fixed order history displays to show correct wholesaler earnings instead of customer payment amounts. Previously showed customer totals (e.g., £1563.49 including platform fees), now shows actual wholesaler earnings (subtotal × 96.7% after 3.3% platform fee). Updated both order list and detail modal to highlight "Your Earnings" in green, maintaining customer payment as reference. Aligns with Stripe Connect marketplace fee structure where wholesalers receive 96.7% of subtotal.
- **Delivery Cost Capture Fix (Aug 2025)**: Resolved critical issue where delivery costs weren't being captured in order totals. Fixed payment intent creation to include shipping costs in customer charges and updated order processor to properly calculate total including subtotal + shipping + transaction fee. Corrected multiple orders: SF-155 (£1,277.05 → £1,367.05), SF-156 (£2,289.85 → £2,409.85), SF-158 (£770.65 → £860.65). Added default £90.00 delivery cost for "Custom Quote Required" orders to ensure all delivery orders include shipping costs. Frontend and backend now consistently handle delivery cost calculation.
- **Stripe Connect Integration Status Fixed (Aug 2025)**: Clarified and corrected payment processing architecture. Platform uses proper Stripe Connect marketplace integration with Express accounts for wholesalers, application fees (3.3% platform fee), and transfer_data for marketplace payments. Fixed integration status page to correctly show "Setup Required" when wholesaler hasn't completed Connect onboarding, rather than showing false "Connected" status. Current user (Michael) needs to complete Stripe Connect onboarding to enable proper B2B marketplace payment flow with direct bank transfers.
- **Platform-Managed Delivery Payment System (Aug 2025)**: Implemented Parcel2Go integration where platform collects all delivery costs and manages delivery payments. Customer transaction fees (5.5% + £0.50) calculated on total amount including delivery costs. Wholesaler receives only product earnings minus platform fee (3.3% of product subtotal). Platform receives platform fees, transaction fees, and delivery costs for centralized delivery payment management. This provides platform control over delivery operations while wholesalers focus on product fulfillment.
- **Enhanced Stripe Connect with Separate Delivery Fee Routing (Aug 2025)**: Implemented comprehensive Stripe Connect destination charges with automatic payment splitting. Stripe Connect is required for all wholesalers - orders blocked until Connect onboarding completed. Customer payment automatically splits into wholesaler product earnings (via transfer_data) and platform fees (via application_fee_amount). Separate transfer logic routes delivery fees + transaction fees directly to platform account for immediate Parcel2Go prepaid funding. Corrected transaction fee calculation to 5.5% of (products + delivery) + £0.50 for comprehensive fee coverage. System ensures all marketplace payments flow through proper Connect architecture.
- **Stripe Connect Payment Flow Verified (Aug 2025)**: Successfully tested complete marketplace payment flow with order SF-182. Customer paid £1,128.19, wholesaler automatically received £799.13 via Stripe Connect transfer, platform retained £329.06 for fees and delivery costs. Fixed delivery order detection logic to properly show "Delivery" when shipping cost > £0. All payment splitting, automatic transfers, and fee routing working perfectly in production-ready state.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation.
- **Key Features**:
    - **Product Management**: Comprehensive catalog, stock tracking, promotional pricing, AI-powered description/image generation.
    - **Customer & Order Management**: Customer grouping, multi-fulfillment order processing, Stripe integration, email notifications.
    - **WhatsApp Marketing**: Dual provider support (Twilio, WhatsApp Business API), broadcast messaging, AI personalization, template management.
    - **Subscription & Team Management**: Tiered plans, team invitation with granular permissions, usage tracking.
    - **Business Intelligence**: Campaign performance analytics, financial reporting, stock movement analysis, advertising campaign management.
    - **Order Processing Logic**: Critical webhook system for converting Stripe payments into database orders with multi-wholesaler references. **FIXED**: Resolved race condition causing duplicate order numbers (SF-114) by implementing atomic database transactions with exclusive locks for sequential order numbering (SF-132 onwards). **CRITICAL FIX (Aug 2025)**: Eliminated order duplication issue caused by multiple webhook handlers processing same Stripe payment intents. Cleaned up 36 duplicate order items and 20 duplicate orders, added unique constraint on stripe_payment_intent_id, and implemented duplicate detection logic. Now using single standalone webhook server (port 5001) to prevent race conditions.
    - **Subscription System**: Full management for upgrades/downgrades, automatic processing via webhooks, and manual override capabilities. Includes a comprehensive audit system for all subscription activity.
    - **Security**: Bcryptjs for password hashing, comprehensive role-based access control, and data isolation between wholesalers.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts for wholesalers, application fees, and direct transfers).
- **Communication Services**:
    - WhatsApp Business API (direct messaging).
    - Twilio (alternative WhatsApp provider).
    - SendGrid (transactional emails).
    - SMS Services (multi-provider SMS verification).
- **AI & Enhancement Services**:
    - OpenAI GPT-4 (for product descriptions, marketing copy, and campaign optimization).
    - Google Maps API (address autocomplete and location services).
    - AI-powered image generation.
- **Shipping Integration**:
    - Parcel2Go API (shipping quotes and label generation).
    - Google Places (address validation).
```