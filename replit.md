# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
**CRITICAL REQUIREMENT**: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## Primary Business Account
**Consolidated Account**: Michael Ogunjemilua (hello@quikpik.co)
- **Google ID**: 104871691614680693123
- **Business**: Surulere Foods Wholesale
- **Products**: 14 items
- **Orders**: 136+ orders (SF-001 through SF-131, with SF-132 next in sequence)
- **Subscription**: Premium tier, active
- **Customer Portal**: /customer/104871691614680693123

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
- **Business Performance Analytics Consolidation (Aug 2025)**: Successfully consolidated three separate analytics sections (Analytics Dashboard, Customer Insights, Inventory Insights) into a unified Business Performance tab system. Implemented comprehensive tabbed interface integrating all analytics functionality including real-time revenue tracking, customer segmentation analysis, inventory optimization insights, and performance metrics. Removed redundant navigation items for cleaner user experience while maintaining full analytics capabilities through complete backend API endpoints.

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
- **Payment Processing**: Stripe (for payments, subscriptions, invoicing, and webhooks).
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