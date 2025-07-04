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
- July 02, 2025. Added subscription system with tiered pricing (Free: 3 products, Standard: 10 products @ $10.99/month, Premium: unlimited @ $19.99/month)
- July 02, 2025. Implemented WhatsApp broadcasting functionality with product notifications to customer groups
- July 03, 2025. Created complete customer order flow with bi-directional communication between customers and wholesalers including:
  - Customer marketplace interface for browsing products from all wholesalers
  - Shopping cart functionality with order placement
  - Order management system for both customers and wholesalers
  - Order status tracking (pending → confirmed → processing → shipped → delivered)
  - Customer group member management with detailed member lists
- July 03, 2025. Fixed navigation and layout issues:
  - Created AppLayout component for consistent sidebar navigation across all pages
  - Made product creation modal scrollable with proper button visibility
  - Fixed data type validation errors in product creation/update routes
  - Integrated OpenAI API for AI-powered product description generation
- July 03, 2025. Resolved product creation validation errors by implementing proper data type conversion for numeric fields (price, MOQ, stock)
- July 03, 2025. Enhanced Customer Groups page with improved layout, clickable member counts, duplicate phone number detection, and detailed member view dialog
- July 03, 2025. Added complete customer management system:
  - Search functionality for members by name, phone number, or email
  - Delete functionality with red trash icon buttons to remove customers from groups
  - Enhanced customer data fields including email and address (street, city, state, postal code, country)
  - Fixed customer card layout with proper text truncation to prevent overflow
  - Improved member dialog with better spacing and responsive design
- July 03, 2025. Integrated Quikpik brand identity across the platform:
  - Updated color scheme to use brand green (hsl(151, 77%, 36%)) as primary color
  - Created Logo component with support for different sizes and variants
  - Integrated brand logo in sidebar navigation and landing page header
  - Updated all feature icons and accents to use consistent green theme
  - Added custom CSS gradients and shadows using brand colors
  - Fixed Analytics navigation tab visibility with proper text contrast
- July 03, 2025. Implemented customizable logo system and AI-powered product features:
  - Added logo management to settings with three options: initials, business name, or custom uploaded image
  - Created file upload functionality with base64 conversion for logo storage
  - Added "Powered by Quikpik" footer component across all pages
  - Integrated OpenAI API for AI-powered product image generation using DALL-E 3
  - Enhanced product management with AI image generation, file upload, and URL input options
  - Added comprehensive error handling and user feedback for all upload/generation operations
- July 03, 2025. Enhanced product image handling and currency management:
  - Removed AI image generation due to OpenAI API limitations and policy restrictions
  - Implemented automatic image resizing and compression (max 800x600px, under 500KB)
  - Added smart image optimization that maintains quality while reducing file size
  - Fixed currency defaulting to properly use user's preferred currency setting
  - Enhanced product form to respect user currency preferences in all scenarios (new, edit, duplicate)
  - Increased server payload limits to handle optimized image uploads
- July 03, 2025. Implemented interactive product status management and updated branding:
  - Added clickable status dropdown badges on product cards with color-coded indicators
  - Users can now quickly change product status between Active (green), Inactive (gray), and Out of Stock (red)
  - Status changes save automatically to database with real-time updates
  - Updated footer branding with latest Quikpik logo design
  - Enhanced user experience with intuitive status management workflow
- July 03, 2025. Upgraded WhatsApp integration to direct WhatsApp Business API:
  - Removed Twilio dependency in favor of direct Meta WhatsApp Business API integration
  - Each user now configures their own WhatsApp Business account credentials (phone number + access token)
  - Added comprehensive WhatsApp configuration UI in Settings with setup guide
  - Implemented API verification system using Meta's Graph API endpoints
  - Enhanced error handling with fallback to test mode for network issues
  - Users can now send broadcasts from their own verified WhatsApp Business numbers
- July 03, 2025. Implemented comprehensive Stripe Connect integration for platform revenue:
  - Added Stripe Connect onboarding for wholesalers to receive direct payments
  - Implemented 5% platform fee collection on all transactions (automatic revenue split)
  - Created payment setup UI in Settings with onboarding flow and status tracking
  - Added Connect account verification and payment processing status monitoring
  - Enhanced order payment flow to use Connect accounts with application fees
  - Wholesalers receive 95% of order value, Quikpik retains 5% platform fee
  - Added comprehensive webhook handling for payment events and account updates
- July 03, 2025. Consolidated broadcast and message template systems into unified "Broadcast" interface:
  - Merged separate Broadcasts and Message Templates pages into single unified Broadcast system
  - Updated navigation to use simple "Broadcast" tab name as requested by user
  - Created unified campaigns page handling both single product broadcasts and multi-product campaigns
  - Built consolidated backend API endpoints that combine broadcasts and templates data
  - Enhanced message preview formatting with professional WhatsApp-style layout including product details, pricing, stock levels, and contact information
  - Streamlined user experience by eliminating confusion between similar broadcast features
- July 03, 2025. Enhanced broadcast system with dashboard and automated customer onboarding:
  - Added comprehensive broadcast dashboard showing campaign metrics, messages sent, orders, and revenue
  - Implemented automatic welcome message system for new customers added to groups
  - Enhanced multi-product campaign form to default quantity to available stock levels
  - Welcome messages introduce new customers to the platform capabilities and set expectations for future communications
  - Dashboard provides real-time insights into broadcast performance and customer engagement
- July 03, 2025. Implemented comprehensive stock update refresh system for campaign management:
  - Added "Stock Update" button to previously sent campaigns with orange styling for easy identification
  - **Stock Update function**: Simple data refresh that updates stock counts and pricing without requiring customer group selection
  - **Send/Resend function**: Actually sends WhatsApp messages to customers with campaign content (requires customer group)
  - Created clear functional separation: Stock Update for data refresh only, Send/Resend for customer communication
  - Enhanced test mode for WhatsApp functionality - campaigns work even without WhatsApp API configuration
  - System supports both single-product broadcasts and multi-product template campaigns for comprehensive stock management
- July 04, 2025. Enhanced number formatting and navigation organization:
  - Implemented comprehensive comma formatting for all stock numbers in WhatsApp broadcasts (e.g., "10,000" instead of "10000")
  - Updated both single and multi-product campaign message formatting for better readability
  - Applied consistent number formatting to dashboard statistics and analytics displays
  - Reorganized sidebar navigation to position Marketplace under Analytics as requested by user
- July 04, 2025. Comprehensive platform flow optimization and user experience improvements:
  - **Route Consolidation**: Merged duplicate routes (/broadcasts, /message-templates) to single /campaigns endpoint
  - **Enhanced Dashboard UX**: Added quick action buttons in header (Add Product, Create Campaign, Add Customers)
  - **Quick Actions Section**: Created visual quick action cards on dashboard for common tasks (Add Products, Send Campaign, Manage Customers, View Orders)
  - **Improved Workflow Efficiency**: Streamlined user journeys by reducing navigation complexity and adding contextual action buttons
  - **Legacy Route Support**: Maintained backward compatibility with automatic redirects from old routes
- July 04, 2025. Implemented comprehensive Business Performance and Financial Management system:
  - **Navigation Restructure**: Changed "Analytics" to "Business Performance" with separate tiles for analytics and financials
  - **Business Performance Hub**: Created central hub with visual tiles for Analytics and Financials sections
  - **Stripe Invoice Integration**: Full Stripe invoice management with search, filtering, and download capabilities
  - **Financial Dashboard**: Real-time financial metrics including revenue tracking, paid invoices, pending payments, and platform fees
  - **Invoice Management**: Complete invoice lifecycle management with status tracking, PDF downloads, and payment processing
  - **Financial Analytics**: Comprehensive financial summary with month-over-month comparisons and revenue trend analysis
  - **API Endpoints**: Added /api/stripe/invoices, /api/stripe/financial-summary, and /api/stripe/invoices/:id/download endpoints
  - **AI-Powered Financial Health Dashboard**: Interactive dashboard with comprehensive health scoring, AI-generated insights, predictive analytics, and actionable recommendations
  - **Financial Health Analysis**: 5-component health scoring system (revenue, profitability, cash flow, growth, efficiency) with intelligent recommendations
  - **AI Insights Generation**: OpenAI-powered financial analysis providing personalized business recommendations and risk assessment
  - **Predictive Analytics**: Revenue forecasting, growth opportunity identification, and risk factor monitoring
  - **UI Updates**: Temporarily hidden "Monitor Health" option from Business Performance Quick Overview per user request
- July 04, 2025. Enhanced Business Settings with comprehensive company information and multi-currency support:
  - **Company Information Form**: Complete business profile management with name, description, contact details, and address fields
  - **Multi-Currency Support**: Added comprehensive currency selector with 50+ international currencies and symbols
  - **Default Currency Integration**: Business default currency automatically applies to new product creation forms
  - **Business Name Integration**: Business name now displays prominently on dashboard header and sidebar
  - **Address Management**: Full address capture including street, city, state, postal code, and country fields
  - **Currency Localization**: Professional currency display with symbols, codes, and full names for easy identification
  - **Form Validation**: Robust validation for required business information and currency selection
  - **Default Values**: Business name defaults to "Lanre Foods" as requested by user
- July 04, 2025. Implemented Product Edit Limit System:
  - **Edit Tracking**: Added editCount field to products table to track number of edits made
  - **3-Edit Limit**: Products can only be edited 3 times before requiring plan upgrade
  - **Backend Validation**: Server-side enforcement returns 403 error when edit limit reached
  - **Visual Indicators**: Product cards display edit count badges (0/3, 1/3, 2/3, 3/3 edits)
  - **UI Restrictions**: Edit button becomes disabled and grayed out when limit reached
  - **Error Handling**: Clear error messages prompt users to upgrade their plan
  - **Database Migration**: Successfully pushed schema changes with editCount field
- July 04, 2025. Enhanced WhatsApp Message Preview with Editing Capabilities:
  - **Editable Preview**: Added edit toggle button in message preview dialog for real-time message customization
  - **Interactive Editor**: Full-featured textarea editor with character count and reset functionality
  - **Custom Message Support**: Backend integration to handle and send custom edited messages
  - **Visual Indicators**: Clear indicators when custom messages are ready to be sent
  - **Template Integration**: Extended editing support to both single and multi-product campaigns
  - **Seamless Workflow**: Direct preview-to-send flow with custom message preservation
  
**Status Systems:**
- **Campaign Status**: Only "sent" or "draft" (campaigns that have been sent vs those still being prepared)
- **Order Status**: Active status refers to orders in progress (pending, processing, shipped)
- Order lifecycle: pending → processing → shipped → completed/cancelled
- Orders with "active status" are those not yet completed or cancelled

## User Preferences

Preferred communication style: Simple, everyday language.