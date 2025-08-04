# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript.
- **Build Tool**: Vite.
- **UI Framework**: Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors.
- **UI/UX Decisions**: Default table layout for orders with pagination, dynamic delivery method display, simplified interfaces, and consistent brand-integrated clean design with green theme colors.

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
    - **Subscription & Team Management**: Tiered plans (£10.99 Standard, £19.99 Premium), team invitation with granular permissions, usage tracking.
    - **Business Intelligence**: Campaign performance analytics, financial reporting, stock movement analysis, advertising campaign management.
    - **Order Processing Logic**: Critical webhook system for converting Stripe payments into database orders with multi-wholesaler references. Includes robust error handling and recovery mechanisms.
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

## SMS VERIFICATION SYSTEM FULLY OPERATIONAL ✅ (August 2, 2025)
**Complete Customer Authentication Via SMS Working Perfectly**

- **System Status**: SMS verification system fully tested and operational
- **Test Results Confirmed**:
  - ✅ Customer lookup by last 4 digits: SUCCESS
  - ✅ SMS code generation and delivery via Twilio: SUCCESS  
  - ✅ SMS code verification and session creation: SUCCESS
  - ✅ Code expiration and security handling: SUCCESS

- **API Endpoints Verified**:
  - `POST /api/customer-auth/verify` - Customer lookup by phone digits
  - `POST /api/customer-auth/request-sms` - SMS code generation and sending
  - `POST /api/customer-auth/verify-sms` - Complete verification flow
  - `POST /api/customer-auth/get-debug-code` - Development debugging

- **SMS Integration**: Twilio successfully delivering verification codes
  - Real SMS delivery confirmed (Message ID: SM00f020a69dd79fba5f753c8c00a49112)
  - 5-minute code expiration properly enforced
  - Database storage and security measures working correctly
  - Complete authentication flow from customer lookup to session creation
  - **CRITICAL FIX**: Wholesaler ID isolation properly implemented - customers are filtered by wholesaler before phone verification

## WEBHOOK ORDER RECOVERY SYSTEM ✅ (August 2, 2025)
**Critical Order Processing Issue Resolved**

- **Issue Identified**: Order #228955 (£25.12) successfully processed by Stripe but missing from database due to webhook failure
- **Root Cause**: Webhook processing error prevented order creation despite successful payment
- **Resolution Applied**:
  - ✅ Manually recreated missing order #228955 with correct wholesaler association
  - ✅ Verified order appears in order history for Surulere Foods Wholesale
  - ✅ Webhook system restarted and monitoring for future order processing
  - ✅ Customer lookup improved to check both `phone_number` and `business_phone` fields

- **Prevention Measures**: Enhanced webhook monitoring and error recovery procedures implemented

## MARKETPLACE WHOLESALER SEARCH SYSTEM ✅ (August 2, 2025)
**Enhanced Multi-Wholesaler Discovery and Authentication**

- **Marketplace Features Implemented**:
  - ✅ "Find Seller" search button available in customer portal home page left side
  - ✅ "Find Seller" search button functional in product browsing header for easy access
  - ✅ Modal dialog displaying available wholesalers with logos, ratings, and business information
  - ✅ Direct navigation to selected wholesaler stores from search results
  - ✅ Integration with existing `/api/marketplace/wholesalers` endpoint for real-time data
  - ✅ Shared modal state across all customer portal pages for seamless user experience

- **Enhanced Customer Authentication Flow**:
  - ✅ Improved error handling for unregistered customers attempting store access
  - ✅ "Contact Wholesaler" messaging when customer not found in store's customer database
  - ✅ Proper redirection to main Quikpik site for customer registration requests
  - ✅ Maintained security isolation - customers can only access stores where they're registered

- **User Experience Improvements**: 
  - ✅ Dual button placement - home page and header for maximum accessibility
  - ✅ Simplified ecommerce-style store discovery while maintaining B2B security requirements
  - ✅ Modal state persistence allows clicking button on home page to display modal on product page
  - ✅ Clean, consistent emerald green styling throughout the search interface

## ORDER PROCESSING CONSISTENCY FIXES ✅ (August 4, 2025)
**Critical Order Numbering and Subtotal Calculation Issues COMPLETELY RESOLVED**

- **Order Numbering System Fixed**:
  - ✅ Resolved duplicate order numbering bug (multiple orders showing SF-117)
  - ✅ Fixed getLastOrderForWholesaler() to find highest numeric order number instead of most recent by date
  - ✅ Aligned order numbering logic between routes.ts and order-processor.ts for consistency
  - ✅ Corrected Order #226: Changed from SF-117 to proper SF-119 sequence
  - ✅ Fixed Order #231: Shows SF-120 instead of timestamp #144527
  - ✅ Future orders now increment properly: SF-121, SF-122, etc.

- **Subtotal Calculation Fixes**:
  - ✅ Fixed Order #226 subtotal: £0.00 → £7.96 (4×£1.00 + 12×£0.33)
  - ✅ Fixed Order #231 subtotal: £6.60 → £4.96 (12×£0.33 + 1×£1.00)
  - ✅ Enhanced subtotal calculation to use actual cart items when payment metadata missing
  - ✅ CRITICAL FIX: Customer orders API now uses database subtotal directly, not faulty calculations
  - ✅ Updated API response to include actual orderNumber field for frontend display

- **System Reliability Improvements**:
  - ✅ Eliminated timestamp-based order numbering conflicts
  - ✅ Ensured per-wholesaler sequential numbering works correctly
  - ✅ Fixed backend-frontend order number synchronization across all systems
  - ✅ Maintained data integrity across payment processing flow
  - ✅ Customer order history now shows accurate order numbers and subtotals