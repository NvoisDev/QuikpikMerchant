# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an e-commerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
**CRITICAL REQUIREMENT**: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, built using Vite.
- **UI Framework**: Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors.
- **UI/UX Decisions**: Default table layout for orders with smart search and filtering, dynamic delivery method display, simplified interfaces, and consistent brand-integrated clean design with green theme colors. Comprehensive Order Management System with professional table layout, advanced search/filtering, order detail modals, and full customer information display. Unified Business Performance tab system consolidates all analytics functionality (revenue tracking, customer segmentation, inventory insights).
### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal) with role-based access control for data isolation.
- **Key Features**: Product Management (catalog, stock, pricing, AI generation), Customer & Order Management (grouping, multi-fulfillment, Stripe integration, notifications), WhatsApp Marketing (broadcast, AI personalization, templates), Subscription & Team Management (tiered plans, permissions, usage tracking), Business Intelligence (campaign analytics, financial reporting, stock analysis).
- **Order Processing Logic**: Critical webhook system for converting Stripe payments into database orders with multi-wholesaler references, atomic database transactions for sequential order numbering, and duplicate order detection.
- **Subscription System**: Full management for upgrades/downgrades, automatic processing via webhooks, and manual override capabilities with an audit system.
- **Security**: Bcryptjs for password hashing, comprehensive role-based access control, and data isolation between wholesalers.
- **Payment Processing Logic**: Completely restructured payment system for Stripe Connect marketplace where the platform collects all funds first (products + delivery + transaction fees), then automatically transfers the wholesaler portion after deducting platform fees. This involves managing platform fees, wholesaler platform fees, and all delivery costs, ensuring proper fund collection and distribution.
### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts for wholesalers, application fees, and direct transfers).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS verification.
- **AI & Enhancement Services**: OpenAI GPT-4, Google Maps API, AI-powered image generation.
- **Shipping Integration**: Parcel2Go API, Google Places.

## Recent Progress (August 16, 2025)
- **RESOLVED**: Complete payment system rebuild using clean Stripe Connect marketplace implementation
- **RESOLVED**: Payment processing now working - successful orders SF-194 through SF-198 created
- **RESOLVED**: Fixed automatic order creation by enhancing payment intent metadata to include all required fields
- **RESOLVED**: Resolved phone number parsing issue in storage layer (space prefix vs "+" prefix)
- **RESOLVED**: Fixed JSON parsing errors in shipping info metadata by simplifying complex delivery service data
- **RESOLVED**: Customer portal redesigned with modern tabbed interface (Home/Products/Orders/Account)
- **RESOLVED**: Implemented grocery-style homepage with welcome banner, quick stats, search, and featured products
- **RESOLVED**: Order recovery system successfully restored multiple orders (SF-195, SF-196, SF-197, SF-198)
- **CURRENT ISSUE**: Customer portal authentication preventing new orders from displaying in frontend interface
- **STATUS**: Backend successfully creates orders SF-198 (£1,131.46) and SF-199 (£611.24), but frontend authentication blocks order visibility