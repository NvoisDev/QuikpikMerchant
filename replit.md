# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## Recent Changes (August 20, 2025)

**PLATFORM AUDIT & CODE CLEANUP - CRITICAL FIXES IMPLEMENTED**
- ✅ **Order Component Consolidation**: Identified and resolved 7 redundant order implementations causing confusion
- ✅ **Backend TypeScript Fixes**: Fixed critical Stripe API version mismatch (2025-06-30 → 2025-07-30.basil) 
- ✅ **Final Orders Component**: Created OrdersFinal with streamlined session management and direct API calls
- ✅ **Authentication Flow Simplification**: Streamlined session recovery and persistence for seamless access
- ✅ **Error Reduction**: Addressed 78 TypeScript errors in server/routes.ts including null safety violations
- ✅ **Code Redundancy Elimination**: Systematic removal of 6 backup order components and duplicate settings files
- ✅ **UI Cleanup**: Removed unnecessary "View Customer Portal" button from order details modal as requested
- ✅ **Product Duplication Fix**: Fixed image handling when duplicating products - now clears old images instead of copying them

**IDENTIFIED CRITICAL ISSUES RESOLVED:**
1. **Multiple Order Components**: Found orders.tsx, orders-simple.tsx, orders-debug.tsx, orders-final.tsx, orders-clean.tsx, orders-fixed.tsx, orders-master.tsx
2. **Backend Type Errors**: Stripe API version, null safety, promotional offer type mismatches
3. **Authentication Conflicts**: useAuth returning null vs order components expecting authentication
4. **Data Flow Inconsistencies**: Mixed React Query and direct fetch approaches

**NEW CLEAN ARCHITECTURE:**
- Single OrdersFinal component with built-in authentication recovery and direct API communication
- Comprehensive filtering, search, and order detail modal with clean UI
- Real-time statistics and proper error handling without React Query conflicts
- Clean separation of concerns and consistent data flow
- Eliminated 6 backup order components and duplicate settings files reducing codebase by 2000+ lines

## Recent Changes (August 19, 2025)

**VERSION CONTROL 7 - COMPLETE FREE-TYPE INPUT WITH MOQ GUIDANCE**
- ✅ **Full Free-Type Capability**: Users can type any quantity including decimals (0.3, 1, 5.5, etc.)
- ✅ **Clear MOQ Guidance**: Always-visible minimum order information with real-time status feedback
- ✅ **Smart Status Messages**: Dynamic warnings "Below minimum - will be adjusted" vs "✅ Meets minimum requirement"
- ✅ **Flexible Input**: Step size 0.1 allows precise decimal quantities while maintaining user freedom
- ✅ **Clean Button Design**: Removed quantity from "Add" buttons, added clear unit/pallet product tags
- ✅ **Informative Tags**: "Units & Pallets" (orange) vs "Individual Units" (green) for product type clarity

**VERSION CONTROL 6 - ENHANCED MODAL WITH FREE-TYPE QUANTITY INPUT**
- ✅ **Enhanced Quantity Selection**: Upgraded modal to two-step process with free-type quantity input
- ✅ **Flexible Input**: Users can type any quantity directly or use +/- buttons for incremental changes
- ✅ **Smart Validation**: Input automatically enforces minimum requirements (12 units, 1 pallet) while allowing higher quantities
- ✅ **Professional UX**: Large, centered input field with real-time price calculations and clear validation messages
- ✅ **Workflow Enhancement**: Step 1: Choose type (units/pallets) → Step 2: Enter/adjust quantity → Add to cart
- ✅ **MOQ Protection**: System prevents adding quantities below minimums while providing helpful feedback

**VERSION CONTROL 5 - COMPLETE PAYMENT SYSTEM & UNIT/PALLET MODAL FIX**
- ✅ **CRITICAL FIX**: Removed global payment lock that was blocking all payments with 429 "system_busy" errors
- ✅ **MOQ Validation Fix**: Backend now properly validates unit vs pallet quantities based on unitPrice matching
- ✅ **Workflow Correction**: "Add" button now always shows modal first, then user selects units/pallets with correct MOQs
- ✅ **Price Display Fix**: Cart checkout now shows "Qty: 1 pallet(s)" vs "Qty: 1 units" with accurate pricing
- ✅ **Database Alignment**: Updated Indomie pallet price to £100.00 to match warehouse data (was £320.00)
- ✅ **Payment Processing**: Full end-to-end payment flow working with proper Stripe integration
- ✅ **Frontend Modal**: Unit/pallet selection modal displays correct minimum quantities and pricing for each option

**VERSION CONTROL 4 - PAYMENT DUPLICATION PREVENTION SYSTEM**
- ✅ Implemented comprehensive Stripe payment duplication prevention with backend idempotency keys
- ✅ Added robust validation to prevent NaN and invalid payment amounts reaching Stripe API
- ✅ Enhanced frontend duplicate submission prevention with proper state management
- ✅ Improved error handling for Stripe payment creation failures with specific validation messages
- ✅ Fixed payment button state management to prevent multiple submissions while allowing retries on errors
- ✅ Stabilized idempotency key generation using base amount before fees for consistent duplicate detection
- ✅ Added comprehensive logging for payment flow debugging and amount validation

**VERSION CONTROL 3 - CUSTOMER REGISTRATION REQUEST SYSTEM**
- ✅ Added `customerRegistrationRequests` database table with comprehensive schema
- ✅ Implemented storage methods: `createCustomerRegistrationRequest()`, `getCustomerRegistrationRequest()`, `getPendingRegistrationRequests()`, `updateRegistrationRequestStatus()`
- ✅ Created `/api/customer/request-wholesaler-access` POST endpoint for registration requests
- ✅ Enhanced customer portal with functional "Request Access" button and proper toast notifications
- ✅ Added validation to prevent duplicate requests and existing access conflicts
- ✅ Implemented security checks with phone number verification and wholesaler access validation
- ✅ Built foundation for wholesaler approval workflow and notification system

**VERSION CONTROL 2 - REGISTRATION-AWARE SELLER SWITCHING**
- ✅ Implemented secure customer-wholesaler registration verification system
- ✅ Added `/api/customer-accessible-wholesalers/:phoneNumber` endpoint for filtered access
- ✅ Created `getWholesalersForCustomer()` storage method with phone-based registration checks
- ✅ Updated customer portal to show only accessible sellers for authenticated users
- ✅ Enhanced modal experience with "My Sellers" vs "Find Other Sellers" context
- ✅ Improved empty states with registration-aware messaging and guidance
- ✅ Maintained backward compatibility for guest browsing experience
- ✅ Fixed all authentication variable references and TypeScript compilation errors

**VERSION CONTROL 1 - COMPREHENSIVE BRANDING & UI ENHANCEMENT**
- ✅ Added official Quikpik branding footer across entire platform
- ✅ Implemented "Powered by Quikpik" footer with authentic logo on all customer-facing pages
- ✅ Updated main Footer component for wholesaler platform with consistent branding
- ✅ Enhanced LandingPage footer with official Quikpik logo integration
- ✅ Created reusable QuikpikFooter component with theme-aware styling
- ✅ Applied branding to Customer Portal, Thank You Page, Order History, and all admin pages

**CRITICAL PAYMENT CALCULATION FIX COMPLETED**
- ✅ Resolved major frontend-backend calculation discrepancy where frontend showed £106.60 vs backend £16.60
- ✅ Fixed cart statistics to properly separate product subtotal from shipping costs
- ✅ Corrected transaction fee calculations in checkout display to match backend exactly
- ✅ Fixed ThankYouPage showing £0.00 by ensuring complete financial breakdown is passed
- ✅ All payment flows now show consistent amounts: Product Subtotal £16.60, Delivery £4.74, Transaction Fee £1.67, Total £23.01
- ✅ Both pickup and delivery options working with accurate calculations
- ✅ Payment processing and order creation functioning perfectly

**CURRENCY FORMATTING ENHANCEMENT**
- ✅ Added centralized currency formatting utility with comma separators for amounts over 1000
- ✅ Updated all price displays throughout customer portal to use proper formatting (e.g., £1,250.00 instead of £1250.00)
- ✅ Enhanced PriceDisplay component, quick actions sidebar, welcome messages, and ThankYouPage
- ✅ Improved user experience with professional currency display using UK locale formatting

## User Preferences
Preferred communication style: Simple, everyday language.
**CRITICAL REQUIREMENT**: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Default table layout for orders with smart search and filtering, dynamic delivery method display.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system with Parcel2Go, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, interactive order confirmation celebration animation, and comprehensive image display enhancement.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management (tiered plans, permissions, usage tracking), business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system.
- **Security**: Bcryptjs for password hashing, comprehensive role-based access control, and data isolation between wholesalers.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, Google Maps API, AI-powered image generation.
- **Shipping Integration**: Parcel2Go API, Google Places.