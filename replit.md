# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## Recent Changes (August 19, 2025)

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