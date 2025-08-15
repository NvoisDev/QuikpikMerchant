# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite.
- **UI Framework**: Tailwind CSS with shadcn/ui, custom green brand colors.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **UI/UX Decisions**: Simplified interfaces with consistent branding, default table layouts for data, dynamic displays, and an integrated clean design.
- **Key Enhancements**: Comprehensive Order Management System with advanced search/filtering and detailed modals; unified Business Performance analytics with real-time tracking, customer segmentation, and inventory insights, accessible via a tabbed interface. Premium subscription enforcement for analytics features. Shipping method badges for visual clarity.

### Backend
- **Runtime**: Node.js with Express, TypeScript (ES modules).
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Google OAuth for wholesalers, SMS for customer portal. Role-based access control for data isolation.
- **Key Features**: Product management (catalog, stock, promotions, AI content), customer & order management (grouping, multi-fulfillment, Stripe integration, email notifications), WhatsApp marketing (broadcast, AI personalization, templates), subscription & team management, business intelligence (analytics, reporting), and a robust order processing webhook system with atomic transactions and duplicate prevention.
- **Payment Architecture**: Revolutionary payment optimization using Stripe Connect's application_fee_amount to automatically deduct all platform costs (platform fee 3.3% + transaction fee + delivery costs) from customer payment. The customer pays a single amount, the platform's portion is automatically deducted by Stripe, and the remainder is automatically transferred to the wholesaler. This streamlines the payment flow by automating fee and delivery cost deductions directly via Stripe Connect destination charges.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments, Express accounts, application fees, direct transfers).
- **Communication Services**:
    - WhatsApp Business API
    - Twilio (alternative WhatsApp provider)
    - SendGrid (transactional emails)
    - Multi-provider SMS verification
- **AI & Enhancement Services**:
    - OpenAI GPT-4 (product descriptions, marketing copy, campaign optimization)
    - Google Maps API (address autocomplete, location services)
    - AI-powered image generation
- **Shipping Integration**:
    - Parcel2Go API (shipping quotes, label generation)
    - Google Places (address validation)