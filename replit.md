# Quikpik Merchant Platform

## Overview

Quikpik Merchant is a comprehensive web-based B2B platform designed for small-scale wholesalers to manage inventory, connect with retail customers, and process orders. The platform enables wholesalers to list products, broadcast stock updates via WhatsApp, accept online payments, and track business analytics while collecting a 5% platform fee per sale.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Build Tool**: Vite for development and production builds
- **UI Components**: Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon Database)
- **Authentication**: Replit OAuth integration with session management
- **Payment Processing**: Stripe integration for payment handling

### Application Structure
```
├── client/          # Frontend React application
├── server/          # Backend Express server
├── shared/          # Shared TypeScript schemas and types
├── migrations/      # Database migration files
└── dist/           # Production build output
```

## Key Components

### Authentication System
- **Provider**: Replit OAuth with OpenID Connect
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple
- **User Roles**: Wholesaler and Retailer roles with role-based access control
- **Security**: HTTP-only cookies with secure session handling

### Database Schema
- **Users**: Profile information, business details, Stripe account integration
- **Products**: Inventory management with MOQ, pricing, and visibility controls
- **Orders**: Complete order lifecycle with items and payment tracking
- **Customer Groups**: Organized customer management for targeted broadcasting
- **Sessions**: Secure session storage for authentication

### Payment Integration
- **Provider**: Stripe for secure payment processing
- **Features**: 
  - Online payment acceptance
  - 5% platform fee collection
  - Invoice generation
  - Payment status tracking

### Product Management
- **Inventory Tracking**: Stock levels, minimum order quantities (MOQ)
- **Pricing Control**: Price visibility settings, negotiation capabilities
- **Category Management**: Product categorization and filtering
- **Image Support**: Product image upload and management

## Data Flow

### Wholesaler Workflow
1. **Authentication**: Login via Replit OAuth
2. **Product Management**: Add/edit products with pricing and stock
3. **Customer Groups**: Create and manage retail customer groups
4. **Broadcasting**: Send WhatsApp notifications about new stock
5. **Order Management**: Process incoming orders and payments
6. **Analytics**: View sales performance and customer insights

### Retailer Workflow
1. **Product Discovery**: Browse available products from wholesalers
2. **Order Placement**: Add products to cart with MOQ validation
3. **Checkout Process**: Complete purchase via Stripe integration
4. **Order Tracking**: Monitor order status and delivery details
5. **Communication**: Receive updates via WhatsApp, SMS, or email

### Technical Data Flow
- Frontend communicates with backend via REST API
- Database operations handled through Drizzle ORM
- Real-time updates managed through React Query caching
- Payment processing secured through Stripe webhooks

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **@stripe/stripe-js**: Frontend Stripe integration
- **@tanstack/react-query**: Server state management
- **drizzle-orm**: Type-safe database operations
- **express**: Web server framework
- **passport**: Authentication middleware

### UI Dependencies
- **@radix-ui/***: Accessible UI component primitives
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Icon library
- **react-hook-form**: Form state management

### Development Dependencies
- **vite**: Build tool and development server
- **typescript**: Type safety and development experience
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Development Environment
- **Server**: Express development server with hot reload
- **Client**: Vite development server with HMR
- **Database**: Neon PostgreSQL with connection pooling
- **Build**: Concurrent client and server development

### Production Build
- **Frontend**: Vite production build with optimizations
- **Backend**: esbuild bundling for Node.js deployment
- **Static Assets**: Served through Express static middleware
- **Database**: Production PostgreSQL with connection pooling

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string
- **SESSION_SECRET**: Session encryption key
- **STRIPE_SECRET_KEY**: Stripe API key for payments
- **REPL_ID**: Replit environment identifier

## Changelog
- July 02, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.