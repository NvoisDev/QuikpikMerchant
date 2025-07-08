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

## Subscription System

### Plan Tiers & Pricing
- **Free Plan (£0)**: 3 products, 3 edits per product, 2 customer groups, 5 broadcasts/month, 10 customers per group
- **Standard Plan (£10.99/month)**: 10 products, unlimited edits, 5 customer groups, 25 broadcasts/month, 50 customers per group
- **Premium Plan (£19.99/month)**: Unlimited everything + marketplace access

### Feature Limitations
- **Product Limits**: Enforced at creation with upgrade prompts when limits reached
- **Edit Limits**: Tracked per product with visual indicators (e.g., "2/3 edits used")
- **Customer Group Limits**: Restricted creation when tier limits exceeded
- **Marketplace Access**: Premium-only feature with visual lock indicators in sidebar
- **Broadcast Limits**: Monthly broadcasting restrictions based on subscription tier

### Technical Implementation
- **Stripe Integration**: Real price IDs for monthly billing (price_1RieBnBLkKweDa5PCS7fdhWO, price_1RieBnBLkKweDa5Py3yl0gTP)
- **Backend Enforcement**: Product, edit, and customer group limit checks on all creation endpoints
- **Subscription Status API**: Real-time subscription status and usage tracking
- **Upgrade Modal System**: Context-aware upgrade prompts with plan comparisons
- **Webhook Handling**: Stripe webhook integration for subscription lifecycle events

## Changelog
- July 08, 2025. Enhanced WhatsApp provider selection with recognizable brand logos:
  - **Brand Logo Integration**: Added official Twilio and WhatsApp logos using react-icons/si for better user recognition
  - **Professional Provider Cards**: Users now see familiar red Twilio logo and green WhatsApp logo instead of generic icons
  - **Improved User Experience**: Brand recognition helps users confidently select the right WhatsApp provider for their business needs
  - **Visual Consistency**: Maintained consistent styling while incorporating authentic brand elements
- July 08, 2025. Fixed WhatsApp messaging and Stripe Connect redirect issues:
  - **WhatsApp Reach Dashboard Fix**: Updated analytics endpoints to use real user authentication and calculate actual WhatsApp reach from broadcast statistics
  - **Stripe Connect Redirect Fix**: Changed return URL from settings page to business-performance/financials page after successful Stripe Connect onboarding
  - **WhatsApp Configuration Improvements**: Enhanced error messages and troubleshooting guidance for Twilio sandbox setup requirements
  - **Analytics Authentication**: Fixed analytics endpoints to require authentication and use actual user data instead of test data
  - **Enhanced Error Handling**: Improved WhatsApp configuration feedback with clearer instructions for sandbox setup and testing
  - **Comprehensive Setup Guide**: Updated WhatsApp integration guide with detailed Twilio setup instructions, sandbox vs production guidance, and credential reference section
  - **Visual Setup Assistance**: Added quick reference guide for finding Twilio credentials (Account SID, Auth Token, sandbox code) in Twilio Console
  - **Dual WhatsApp Integration Implementation**: Added flexible provider selection system supporting both Twilio and Direct WhatsApp Business API
  - **Provider Selection Interface**: Created comprehensive provider comparison and configuration system for business flexibility
  - **Direct WhatsApp API Service**: Implemented complete DirectWhatsAppService class with Meta Graph API integration for enterprise-scale messaging
  - **Backend Dual Provider Support**: Updated all WhatsApp endpoints (/configure, /verify, /status) to handle both Twilio and Direct API providers
  - **Database Schema Enhancement**: Added whatsappProvider, whatsappBusinessPhoneId, whatsappAccessToken, whatsappAppId fields for dual integration support
  - **Cost-Optimized Architecture**: Platform now scales from small businesses (Twilio ~$0.005-0.01/msg) to enterprise (Direct API ~$0.0025-0.005/msg) with 50% cost savings
  - **Contextual Help Bubbles for WhatsApp Integration**: Implemented comprehensive help system with step-by-step guides for provider selection, Twilio setup, Direct API configuration, troubleshooting, and best practices
  - **Interactive Help Components**: Created ContextualHelpBubble component with multi-step guidance, visual indicators, navigation controls, and positioning options
  - **Comprehensive Help Content**: Added detailed help content covering provider comparison, setup instructions, common issues, testing procedures, and messaging best practices
  - **Strategic Help Placement**: Positioned help bubbles at key decision points - provider selection, configuration forms, testing interface, and main settings header for maximum user assistance
  - **Platform-Wide Help Integration**: Extended contextual help system to Product Management, Customer Groups, Campaigns, Orders, and Business Settings pages
  - **Comprehensive Help Database**: Created extensive help content covering product management best practices, customer group organization, campaign optimization, order processing, and business profile setup
  - **User-Centric Help Topics**: Help content addresses real business challenges like pricing strategies, stock management, messaging compliance, customer engagement, and platform optimization
- July 02, 2025. Initial setup
- July 07, 2025. Implemented comprehensive onboarding system with interactive tooltips and guided user experience:
  - **Database Schema Enhancement**: Added onboarding_completed, onboarding_step, and onboarding_skipped fields to users table
  - **Onboarding Context System**: Created OnboardingProvider and useOnboarding hook for state management
  - **Interactive Tooltip Components**: Built OnboardingTooltip component with positioning, arrow indicators, and step progression
  - **Backend API Integration**: Added onboarding status management endpoints for tracking user progress
  - **UI Element Tagging**: Added data-onboarding attributes to key dashboard elements, sidebar navigation, and action buttons
  - **Onboarding Restart Feature**: Created OnboardingRestartButton component for users to retake the guided tour
  - **Navigation Integration**: Added onboarding identifiers to sidebar navigation items for step-by-step guidance
  - **Help Hub Integration**: Integrated onboarding restart button in help page for easy access to guided tours
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
  - **Fixed Custom Message Sending**: WhatsApp service now properly uses custom edited messages instead of default templates
  - **Customer Phone Number Isolation**: Updated test customers to use individual phone numbers separate from test number
- July 04, 2025. Comprehensive WhatsApp messaging system improvements:
  - **Fixed Currency Display**: Both single and multi-product campaigns now display correct currency (£ for GBP) instead of hardcoded dollars
  - **Unified Message Format**: Single product broadcasts now match preview format exactly with proper structure and business contact information
  - **Product Image Integration**: Added automatic product image inclusion in WhatsApp messages for both single and multi-product campaigns
  - **Sandbox Limitation Warning**: Added clear notification in settings explaining Twilio sandbox delivery limitations to test numbers only
  - **Template Configuration Fix**: Multi-product campaigns now use proper Twilio configuration instead of WhatsApp Business API fields
- July 04, 2025. Fixed WhatsApp media attachment and campaign link issues:
  - **Media Attachment Fix**: Resolved base64 image URL incompatibility with Twilio WhatsApp API by adding 📸 emoji indicators for products with images
  - **Image Availability Notifications**: Added "Product images available online" messaging to inform customers about visual content
  - **Campaign Link Repair**: Fixed broken campaign URLs from placeholder "quikpik.co" to working application URLs using Replit domains
  - **Dynamic URL Generation**: Campaign links now automatically use correct application domain (https://your-app.replit.dev/marketplace)
  - **Enhanced Multi-Product Templates**: Added image indicators and availability notifications to template campaigns
- July 05, 2025. Implemented Customer Purchase Links in WhatsApp Messages:
  - **Customer Order Integration**: Replaced preview links with actual purchase links in "🛒 Place Your Order Now" sections
  - **Product Order Page**: Created public ProductOrderPage component for customers to place orders without authentication
  - **Direct Purchase Links**: Single product campaigns now link to `/marketplace/product/{id}` for direct product ordering
  - **Individual Product Links**: Multi-product campaigns now include specific purchase links for each product instead of general marketplace browsing
  - **Order API Endpoints**: Added `/api/marketplace/products/:id` and `/api/marketplace/orders` for public order placement
  - **Automatic Notifications**: Wholesalers receive WhatsApp notifications when customers place orders through marketplace links
  - **Order Validation**: System validates minimum order quantities, stock levels, and customer information before order creation
  - **Platform Revenue**: 5% platform fee automatically calculated and collected on all marketplace orders
  - **Targeted Shopping Experience**: Customers get direct links to specific products they're interested in, eliminating need for general marketplace browsing
- July 05, 2025. Complete Customer Portal Implementation:
  - **Dedicated Customer Interface**: Created separate customer portal (/customer/:id) with no access to wholesaler features
  - **Featured Product Display**: Customers see the advertised product prominently with full details and supplier information
  - **Shopping Cart Functionality**: Full cart system allowing customers to add multiple products, adjust quantities, and manage orders
  - **Browse All Products**: "More Products Available" section shows other products below the featured item for cross-selling
  - **Complete Checkout Process**: Comprehensive checkout with customer information collection (name, email, phone, address)
  - **Automatic Invoice Generation**: Email invoices sent to customers upon order completion with full order details
  - **Multi-Wholesaler Support**: Customers can order from multiple wholesalers in single session with proper order routing
  - **WhatsApp Integration**: Wholesalers receive automatic WhatsApp notifications when customers place orders
  - **Order Validation**: System validates minimum order quantities, stock levels, and customer information
  - **Customer Management**: Automatic customer creation and management without requiring signup/authentication
  - **Clean Customer Experience**: Professional customer-focused interface separate from business management tools
- July 05, 2025. Complete Stripe Payment Integration for Customer Portal:
  - **Stripe Elements Integration**: Full Stripe payment form with secure card processing
  - **5% Platform Fee Collection**: Automatic platform fee calculation and collection for Quikpik
  - **Stripe Connect Integration**: Uses wholesaler's Stripe Connect accounts for direct payment processing
  - **Payment Intent Creation**: Backend API endpoint creates payment intents with platform fees
  - **Quantity Editor Dialog**: Interactive popup for editing cart item quantities with validation
  - **Payment Modal**: Professional payment interface with order summary and platform fee disclosure
  - **Payment Success Page**: Dedicated success page with order confirmation
  - **Webhook Integration**: Stripe webhook handling for automatic order creation on successful payments
  - **Real-time Payment Processing**: Seamless checkout flow from cart to payment completion
  - **Multi-Currency Support**: Respects wholesaler's preferred currency settings
  - **Error Handling**: Comprehensive error handling for payment failures and validation issues
- July 05, 2025. Enhanced Product Negotiation System with Minimum Bid Price:
  - **Minimum Bid Price Field**: Added minimum bid price setting to product management form with conditional visibility
  - **Automatic Bid Rejection**: System automatically declines customer offers below minimum threshold via email notification
  - **Backend Validation**: Server-side validation and proper data type handling for minimum bid price fields
  - **Customer Portal Clarity**: Added helpful currency format hints in negotiation form (e.g., "0.30 for 30p")
  - **Email Integration**: SendGrid configured for automated decline notifications to customers
  - **Database Schema**: Updated products table with minimumBidPrice decimal field for precise pricing
  - **Enhanced Quantity Editor**: Fully editable quantity field with + and - buttons, allowing users to clear field and type any number
  - **Smart Validation**: Automatic validation ensures minimum order quantities when users finish editing
  - **Fixed Negotiation Errors**: Resolved foreign key constraint violations by implementing automatic guest customer creation
  - **Default List View**: Customer portal now defaults to list view for better product browsing experience
- July 05, 2025. Implemented Customer Portal Preview System for Wholesalers:
  - **Preview Store Route**: Added `/preview-store` route accessible to authenticated wholesalers for real-time store preview
  - **Preview Mode Detection**: Automatic detection when portal is accessed in preview mode with visual indicators
  - **Preview Banner**: Orange banner at top clearly indicates preview mode with explanation text
  - **Disabled Transactions**: Cart and checkout functionality disabled in preview mode to prevent accidental orders
  - **Dashboard Integration**: Added "Preview Store" button to dashboard header for easy access
  - **Product Management Integration**: Added "Preview Store" button to product management page that opens in new tab
  - **Real-time Updates**: Changes to products, settings, and branding immediately visible in preview mode
  - **Wholesaler Business Name Integration**: Customer portal header and welcome banner now display actual wholesaler business name
  - **Simplified Customer Portal Design**: Removed complex gradients and logo elements for cleaner, more straightforward customer experience
  - **Clean Visual Design**: Replaced gradient backgrounds with simple white/gray color scheme for better readability and performance
- July 05, 2025. Enhanced Order Management System with comprehensive status tracking and email notifications:
  - **Comprehensive Order Status System**: Added unfulfilled, paid, fulfilled, and archived statuses for complete order lifecycle tracking
  - **Interactive Order Timeline**: Visual timeline showing order progression with status-specific icons and timestamps
  - **Order Detail Modal**: Complete order information in expandable modal with customer details, items, and delivery information
  - **Auto-Archiving System**: Orders automatically archive 24 hours after being marked as fulfilled
  - **Email Confirmation System**: Automatic confirmation emails sent when orders are confirmed, with manual resend capability
  - **Timeline Email Tracking**: Email notifications displayed in order timeline with "Resend Email" buttons for wholesalers
  - **Enhanced Status Management**: Dropdown status updates with all new statuses (pending → unfulfilled/confirmed → paid → processing → shipped → delivered → fulfilled → archived)
  - **Summary Card Interface**: Clean order summary cards with key information and expandable details via eye icon
  - **Status-based Filtering**: Filter orders by all available statuses including new ones
  - **Backend API Enhancements**: Added `/api/orders/:id/resend-confirmation` endpoint for email management
  - **Simplified Order Workflow**: Streamlined to 4 core statuses: Order Placed, Order Confirmed, Payment Received (all auto-populated), and Fulfilled (manual action only)
  - **Auto-populated Indicators**: Clear visual indicators showing which statuses are automatic vs require manual wholesaler action
  - **Manual Action Control**: Only "Fulfilled" status requires wholesaler intervention, all other statuses update automatically based on customer actions and payment processing
- July 05, 2025. Enhanced WhatsApp Broadcasting with Price Negotiation Integration:
  - **Negotiation-Enabled Product Messaging**: WhatsApp broadcasts now highlight products with negotiation capabilities using "💬 Price Negotiable - Request Custom Quote Available!" badges
  - **Minimum Bid Price Display**: Messages show minimum acceptable pricing when configured by wholesalers (e.g., "💡 Minimum acceptable price: £0.30")
  - **Single Product Broadcasts**: Enhanced single product campaigns to include negotiation information with clear call-to-action for custom quotes
  - **Multi-Product Campaign Integration**: Template campaigns now highlight negotiation-enabled products individually with pricing details
  - **Consistent Preview System**: Campaign preview interface matches actual WhatsApp message format for negotiation products
  - **Backend Message Generation**: Updated WhatsApp service to automatically include negotiation details in both single and multi-product campaigns
  - **Customer Portal Integration**: Negotiation information in broadcasts seamlessly connects to existing customer portal quote request system
  - **Currency-Aware Messaging**: Negotiation pricing displays respect wholesaler's default currency settings (GBP £, EUR €, USD $)
- July 05, 2025. Complete Stripe Checkout Integration for Customer Portal:
  - **Professional Checkout Modal**: Implemented comprehensive checkout interface with order summary, customer information form, and Stripe payment processing
  - **Stripe Elements Integration**: Secure payment form with PaymentElement for card processing and error handling
  - **Payment Intent API**: Created `/api/marketplace/create-payment-intent` endpoint for secure payment processing with platform fee calculation
  - **5% Platform Fee Collection**: Automatic platform fee calculation and collection through Stripe Connect integration
  - **Customer Information Validation**: Required fields validation for name, email, phone, and delivery address before payment processing
  - **Real-time Cart Management**: Interactive cart with item removal, quantity display, and total calculation
  - **Payment Success Handling**: Automatic cart clearing and user feedback on successful payment completion
  - **Fallback Payment Processing**: Graceful handling of wholesalers without Stripe Connect accounts using regular payment intents
  - **Comprehensive Error Handling**: Detailed error messages and loading states throughout the payment process
  - **Security Disclosure**: Clear platform fee disclosure and secure payment processing messaging for customer transparency
- July 07, 2025. Enhanced Order Processing with Stripe Invoicing and Refund Fixes:
- July 07, 2025. Removed Non-Functional Features:
  - **Stripe Invoice Generation**: Automatic Stripe invoice creation and email delivery to customers after successful order completion
  - **Professional Invoice Format**: Invoices include line items, platform fees, supplier information, and order details with proper currency formatting
  - **Duplicate Payment Prevention**: Fixed multiple payment intent creation issue by adding loading state protection during customer form entry
  - **Email Product Names**: Fixed email confirmation templates to display actual product names instead of generic "Product" placeholder
  - **Refund Functionality Fix**: Resolved "No payment information found" error by handling both paymentIntentId and stripePaymentIntentId field variations
  - **Customer Invoice Management**: Stripe customers automatically created/retrieved for proper invoice delivery and payment tracking
  - **Paid Invoice Marking**: Invoices automatically marked as paid since payment was processed before invoice creation
  - **Help Hub Update**: Comprehensive documentation update with new sections on Customer Portal & Orders, Payment Processing & Invoicing, Refunds & Cancellations, plus updated FAQ covering latest fixes and features
  - **Webhook Invoice Fix**: Fixed Stripe webhook to properly call `createAndSendStripeInvoice` function so customers automatically receive professional invoices after payment
  - **Refund Field Mapping Fix**: Corrected order field mapping from `paymentIntentId` to `stripePaymentIntentId` to resolve "No payment information found" refund errors
  - **Enhanced Refund Logging**: Added detailed error logging to refund route for better debugging of payment processing issues
- July 08, 2025. Complete Subscription System Implementation:
  - **Comprehensive Subscription Tiers**: Implemented Free, Standard (£10.99/month), and Premium (£19.99/month) plans with appropriate feature limitations
  - **Stripe Payment Integration**: Created real Stripe products and price IDs for monthly billing with automated subscription management
  - **Feature Limit Enforcement**: Added backend validation for product limits (3/10/unlimited), edit limits (3/unlimited/unlimited), customer group limits (2/5/unlimited), and broadcast restrictions
  - **Premium Marketplace Access**: Restricted marketplace feature to Premium subscribers only with visual lock indicators in navigation
  - **Subscription Management Interface**: Built comprehensive subscription settings page with current usage, plan comparison, and upgrade controls
  - **Usage Tracking**: Real-time subscription status monitoring with usage counters and limit enforcement
  - **Upgrade Modal System**: Context-aware upgrade prompts when users hit plan limits with direct Stripe checkout integration
  - **Enhanced Navigation**: Added subscription tier indicators and premium feature locks in sidebar navigation
  - **Webhook Integration**: Complete Stripe webhook handling for subscription lifecycle events and automatic user tier updates
- July 08, 2025. Landing page updates and onboarding system completion:
  - **Contact Information**: Added hello@quikpik.co contact link in footer with proper styling
  - **Messaging Updates**: Replaced "Free 30-day trial" text with "Easy setup" across landing page
  - **Comprehensive Animated Onboarding System**: Complete walkthrough system with framer-motion animations, backend API integration, and database progress tracking
  - **User Experience Enhancement**: Onboarding attributes added to dashboard and navigation elements for guided tours
- July 08, 2025. Enhanced landing page visual design and fixed authentication issues:
  - **Colorful Landing Page Design**: Implemented beautiful pastel color scheme with sky blue, yellow, rose pink, and emerald gradients throughout feature tiles and interface elements
  - **Professional Visual Elements**: Added meaningful icons, hover effects, and gradient backgrounds while maintaining clean, modern aesthetic
  - **Google OAuth Configuration Fix**: Resolved redirect URI mismatch by updating OAuth configuration to use Replit domain consistently
  - **User Role Authentication Fix**: Corrected user role assignment issue where users were defaulting to 'retailer' instead of 'wholesaler', ensuring proper access to full platform features
  - **Pricing Information Update**: Corrected landing page to show accurate £10.99/month pricing instead of $10.99 and removed incorrect 14-day trial reference
- July 07, 2025. Comprehensive Promotional Pricing System Implementation:
  - **Database Schema Enhancement**: Added promo_price, promo_active, and promo_end_date fields to products table with proper decimal precision
  - **Product Management Integration**: Enhanced product creation/edit forms with promotional price field, active toggle, and form validation
  - **Visual Strike-Through Pricing**: Product cards display promotional prices in green with strike-through original prices and "PROMO" badges
  - **Customer Portal Enhancement**: Featured products and product listings show promotional pricing with "SALE" badges and strike-through effects
  - **Cart Calculation Updates**: Shopping cart automatically uses promotional prices when active for accurate total calculations
  - **Bulk Upload Support**: CSV template and processing includes promoPrice and promoActive fields for bulk promotional pricing management
  - **Comprehensive UI Integration**: Promotional pricing displays consistently across all interfaces (management, customer portal, cart, checkout)
  - **Database Migration**: Successfully pushed schema changes with new promotional pricing fields to production database
- July 07, 2025. Comprehensive Invoice and Receipt System Implementation:
  - **Professional Invoice Generation**: Created dedicated invoice generation system with downloadable HTML invoices for all orders
  - **Refund Receipt System**: Automated refund receipt emails sent to customers with detailed refund information and processing timeline
  - **Invoice Download Functionality**: Added "Download Invoice" button to orders interface for instant invoice generation and download
  - **Professional Email Templates**: Redesigned invoice and refund receipt emails with business branding, detailed itemization, and professional formatting
  - **Refunded Status Support**: Fixed order status display to properly show "Refunded" status with red RefreshCw icon in orders interface
  - **Stripe Refund Fix**: Corrected refund parameter handling to prevent "invalid amount" errors when processing full refunds
  - **Real Order Count Analytics**: Fixed broadcast campaign analytics to count actual orders placed (not quantities) for accurate business metrics
  - **Multi-Currency Invoice Support**: Invoice generation respects wholesaler's preferred currency settings (GBP £, EUR €, USD $)
  - **Complete Audit Trail**: All refunds and invoices tracked with proper customer notifications and business record keeping
  - **Stripe Payment Receipt Integration**: Professional Stripe invoice creation with automatic customer email delivery through Stripe Connect accounts
  - **Stripe Credit Note System**: Automatic Stripe credit note generation for refunds with proper documentation and customer notification
  - **Manual Stripe Invoice Creation**: Added "Send Stripe Invoice" button in orders interface for creating professional Stripe invoices on demand
  - **Webhook Integration**: Payment success automatically triggers Stripe invoice creation for seamless customer receipt delivery
  - **Professional Business Documentation**: Stripe-generated invoices and credit notes provide official business records for accounting and tax purposes
  - **PDF Invoice Generation**: Removed due to technical issues with Puppeteer in Replit environment
  - **Stripe-Powered Receipt System**: Implemented intelligent receipt system that retrieves customer data directly from Stripe payment intents
  - **Real Customer Data**: Send Receipt now uses actual customer information from Stripe metadata (email, name, phone) ensuring accurate delivery
  - **Automatic Fallback**: System gracefully handles cases where Stripe data is unavailable by using stored order information
  - **Simplified Architecture**: Eliminated need for complex customer data storage by leveraging Stripe's existing payment metadata
  - **Removed Download Invoice and Send Receipt Buttons**: Removed due to technical issues with PDF generation (Puppeteer) and email delivery systems not working reliably in Replit environment
  - **Cleaned Up Order Interface**: Simplified orders page to focus on core functionality - order status tracking and management without problematic features

  
**Status Systems:**
- **Campaign Status**: Only "sent" or "draft" (campaigns that have been sent vs those still being prepared)
- **Order Status**: Active status refers to orders in progress (pending, processing, shipped)
- Order lifecycle: pending → processing → shipped → completed/cancelled
- Orders with "active status" are those not yet completed or cancelled

## User Preferences

Preferred communication style: Simple, everyday language.
Target Market: Global wholesale businesses who buy in bulk and sell to retailers.