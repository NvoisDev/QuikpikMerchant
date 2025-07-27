# Quikpik Merchant - Wholesale B2B Platform

## PRODUCTION LAUNCH PREPARATION - COMPLETED ✅ (July 27, 2025)
**Critical Cleanup & Landing Page Enhancement for Live Deployment**

- **Development Files Removed**: Successfully cleaned 35+ test files, development documentation, and 200+ screenshot files
  - All test-*.js files (comprehensive-test.js, test-payment-flow.js, test-shipping-flow.js, etc.)
  - Development documentation (testing-guide.md, merge-demo.html, customer-portal-demo.txt)
  - Cookie files (cookies*.txt, fresh_cookies.txt, test_cookies.txt)
  - Setup guides (CUSTOM_DOMAIN_SETUP.md, FROZEN_FOOD_SHIPPING_ANALYSIS.md, whatsapp-business-api-setup-guide.md)
  - Complete attached_assets folder (200+ development screenshots)

- **Landing Page Premium Feature Highlights**: Enhanced landing page to drive subscription conversions
  - **Analytics & Advertising**: Promoted premium advertising campaigns and SEO page creation capabilities
  - **B2B Marketplace Access**: Highlighted marketplace selling platform for premium subscribers
  - **Team Management**: Emphasized collaborative features and role-based permissions
  - **Real-time Stock Alerts**: Updated inventory management to showcase premium alert system
  - **Transaction Fee Clarity**: Corrected payment description from outdated "5% platform fee" to current structure

- **Asset Import Fixes**: Replaced broken image imports with production-ready alternatives
  - Footer component updated with text-based Quikpik branding
  - ThankYouPage component uses gradient icon instead of removed shopkeeper image
  - All asset dependencies cleaned for production deployment

- **Production Status**: ✅ FULLY READY - Codebase optimized, landing page conversion-focused, premium features properly highlighted

## Overview

Quikpik is a comprehensive B2B wholesale platform that enables businesses to manage products, customers, orders, and marketing campaigns through WhatsApp integration. The application follows a full-stack architecture with React frontend, Express backend, PostgreSQL database, and multiple third-party integrations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: CSS variables for theming with custom green brand colors

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful endpoints with structured error handling
- **Authentication**: Dual authentication system (Google OAuth + Replit Auth)

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless
- **Schema Management**: Drizzle migrations with centralized schema definitions
- **Connection Pooling**: Neon serverless connection pooling for scalability
- **Session Storage**: PostgreSQL-based session store for authentication

## Key Components

### Product Management System
- Comprehensive product catalog with images, pricing, and inventory
- Stock tracking with automated movement logging
- Promotional pricing engine supporting multiple offer types (BOGO, bulk discounts, percentage off)
- AI-powered product description and image generation via OpenAI

### Customer & Order Management
- Customer grouping system for targeted marketing
- Order processing with multiple fulfillment types (collection, delivery, shipping)
- Stripe integration for secure payment processing
- Email notifications for order confirmations and updates

### WhatsApp Marketing Platform
- Dual provider support (Twilio and Direct WhatsApp Business API)
- Broadcast messaging system with customer group targeting
- AI-powered message personalization and campaign optimization
- Message template management with product integration

### Subscription & Team Management
- Tiered subscription plans (Standard £10.99, Premium £19.99)
- Team member invitation system with granular tab permissions
- Usage tracking and upgrade prompts for plan limits

### Business Intelligence
- Campaign performance analytics with conversion tracking
- Financial reporting and business performance metrics
- Stock movement analysis and automated alerts
- Advertising campaign management with ROI tracking

## Data Flow

### User Authentication Flow
1. User accesses platform via Google OAuth or Replit authentication
2. Session created in PostgreSQL with user permissions
3. Frontend receives authentication state via React Query
4. Protected routes validate permissions server-side

### Order Processing Flow
1. Customer places order through customer portal or WhatsApp
2. Order validation against stock levels and business rules
3. Payment processing via Stripe with automatic invoicing
4. Order confirmation emails sent via SendGrid
5. Stock levels automatically adjusted with audit trail

### Marketing Campaign Flow
1. User creates broadcast or campaign with customer group targeting
2. AI optimization suggests best timing and personalization
3. Messages sent via configured WhatsApp provider (Twilio/Direct)
4. Delivery and engagement metrics tracked and analyzed
5. Performance data feeds back into optimization algorithms

## External Dependencies

### Payment Processing
- **Stripe**: Full payment processing, subscription management, and invoicing
- **Integration**: Webhooks for payment confirmations and subscription updates

### Communication Services
- **WhatsApp Business API**: Direct integration for messaging
- **Twilio**: Alternative WhatsApp provider with sandbox testing
- **SendGrid**: Transactional email delivery for notifications
- **SMS Services**: Multi-provider SMS verification system

### AI & Enhancement Services
- **OpenAI GPT-4**: Product descriptions, marketing copy, and campaign optimization
- **Google Maps API**: Address autocomplete and location services
- **Image Generation**: AI-powered product image creation

### Shipping Integration
- **Parcel2Go API**: Shipping quotes and label generation
- **Google Places**: Address validation and standardization

## Deployment Strategy

### Development Environment
- Replit-based development with hot module replacement
- Environment-specific configuration management
- Integrated debugging and error overlay

### Production Deployment
- Build process combines frontend (Vite) and backend (esbuild)
- Static assets served from `/dist/public`
- API routes served from Express server
- Environment variables for service configuration

### Database Management
- Drizzle migrations for schema evolution
- Connection pooling for production scalability
- Backup and recovery via Neon platform

### Monitoring & Observability
- Request/response logging with performance metrics
- Error boundary implementation for graceful failure handling
- Session-based error tracking and user experience monitoring

The architecture prioritizes type safety, developer experience, and scalability while maintaining simplicity in the codebase. The modular design allows for easy feature additions and third-party service integrations.