# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
**CRITICAL REQUIREMENT**: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript.
- **Build Tool**: Vite.
- **UI Framework**: Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors.
- **UI/UX Decisions**: Default table layout for orders with smart search and filtering, dynamic delivery method display, simplified interfaces, and consistent brand-integrated clean design with green theme colors. Comprehensive Order Management System with professional table layout, advanced search/filtering, and order detail modals.
- **Technical Implementations**: Consolidated analytics into a unified Business Performance tab system, incorporating real-time revenue tracking, customer segmentation, and inventory insights. Implemented robust premium subscription restrictions for analytics access. Corrected order history to display wholesaler earnings (subtotal × 96.7% after 3.3% platform fee). Enhanced cart summary with visual shipping method badges.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal) with role-based access control and data isolation.
- **Feature Specifications**:
    - **Product Management**: Catalog, stock tracking, promotional pricing, AI-powered descriptions/images.
    - **Customer & Order Management**: Customer grouping, multi-fulfillment order processing, Stripe integration, email notifications.
    - **WhatsApp Marketing**: Dual provider support (Twilio, WhatsApp Business API), broadcast messaging, AI personalization, template management.
    - **Subscription & Team Management**: Tiered plans, team invitation with granular permissions, usage tracking.
    - **Business Intelligence**: Campaign performance analytics, financial reporting, stock movement analysis, advertising campaign management.
- **System Design Choices**:
    - Critical webhook system for converting Stripe payments into database orders with multi-wholesaler references, ensuring atomic database transactions and unique constraint on `stripe_payment_intent_id` to prevent duplication.
    - Comprehensive subscription system with audit capabilities.
    - Platform-managed delivery payment system where the platform collects all delivery costs and manages payments to delivery providers (e.g., Parcel2Go).
    - Revolutionary V2 Stripe Connect architecture ("Separate Charges and Transfers") where the platform receives all funds first, then automatically distributes wholesaler share after deducting platform fees, maintaining centralized delivery payment control.
    - **CRITICAL FIX (Jan 15, 2025)**: Frontend V2 migration completed - customer portal now uses proper V2 calculation flow (Step 1: calculate payment split, Step 2: create payment intent with exact amounts). Fixed delivery/pickup display discrepancy and eliminated incorrect total charging.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.

## External Dependencies
- **Payment Processing**: Stripe Connect V2 (platform-first fund collection with automatic wholesaler distributions).
- **Communication Services**:
    - WhatsApp Business API
    - Twilio
    - SendGrid
    - SMS Services (multi-provider)
- **AI & Enhancement Services**:
    - OpenAI GPT-4
    - Google Maps API
    - AI-powered image generation
- **Shipping Integration**:
    - Parcel2Go API
    - Google Places