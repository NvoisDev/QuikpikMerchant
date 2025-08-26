# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## Recent Changes (Version Control 11 - August 26, 2025)
DIRECT WHOLESALER-CUSTOMER RELATIONSHIPS IMPLEMENTED: Successfully implemented mandatory direct relationships between wholesalers and their customers by adding wholesaler_id field to users table. This architectural improvement ensures that all customers are permanently linked to their respective wholesalers, eliminating "orphaned" customers who might become invisible when not assigned to customer groups. Updated all customer creation endpoints to automatically establish this direct relationship. Enhanced getAllCustomers and findCustomerByLastFourDigits methods to include direct wholesaler relationships alongside existing group and order history relationships. Verified that customer Anthonia Bakare is now properly visible to Surulere Foods Wholesale through both direct relationship and existing systems.

MULTI-CHANNEL CUSTOMER ONBOARDING NOTIFICATIONS ENHANCED: Expanded the existing notification system to support customer creation events across all channels (SMS, email, WhatsApp). When new customers are created, wholesalers now receive comprehensive welcome notifications through their preferred communication channels, ensuring immediate awareness of new customer additions to their platform.

## Previous Changes (Version Control 10 - August 21, 2025)
CRITICAL DATA ISOLATION SECURITY BREACH FULLY RESOLVED: Eliminated all hardcoded wholesaler IDs from API endpoints that allowed unauthorized cross-tenant data access. Fixed `/api/public-orders`, `/api/orders-light`, `/api/orders-paginated` endpoints to require proper authentication. Updated frontend components to use authenticated requests with credentials. Removed insecure fallback endpoints that bypassed authentication. Fixed auth recovery endpoint hardcoded ID. Result: Users can now only access their own data - complete data isolation achieved across all wholesaler accounts.

CRITICAL CUSTOMER ACCESS CONTROL BUG FIXED: Resolved critical security issue where customers could access any wholesaler platform regardless of their actual registration status. Fixed SQL operator precedence bug in findCustomerByLastFourDigits function that allowed customers to bypass proper access controls. Added proper parentheses to ensure wholesaler ID filtering applies correctly. Customer access is now properly restricted - customers can only access wholesaler platforms they're actually registered with.

CUSTOMER REGISTRATION REQUEST SYSTEM COMPLETE: Implemented comprehensive registration request system for unregistered customers. Features include professional dialog form with name, business name, phone, email and message fields, automatic email notifications to wholesalers, API validation with duplicate prevention, and clear user experience messaging. When customers try to access wholesaler platforms they're not registered with, they now see helpful registration request form instead of basic error messages.

BIDIRECTIONAL CUSTOMER PROFILE SYNC COMPLETE: Successfully implemented end-to-end synchronization between customer portal and wholesaler platform. Fixed critical data flow issues where business name updates in customer portal were not appearing in wholesaler edit dialogs. Updated Customer interface definitions across all files (customers.tsx, customer-address-book.tsx, customer-groups.tsx) to include businessName field. Modified database queries in getAllCustomers to fetch business_name column and map to businessName property. Authentication issues resolved for customer profile updates. Real-time sync confirmed working: customer portal changes immediately reflect in all wholesaler platform customer management screens.

COMPREHENSIVE CUSTOMER EDITING UNIFORMITY: Implemented standardized customer editing across ALL wholesaler platform dialogs. Every customer edit function now includes consistent comprehensive fields: firstName, lastName, phoneNumber, email, and businessName. Updated customer editing in Customer Directory, Customer Groups, and Customer Address Book to provide complete profile management capabilities. This ensures wholesalers have full visibility and editing control over customer information regardless of where they access it from in the platform.

BLUE BACKGROUND WIDTH FIX: Fixed MOQ helper messages (Minimum X units required) to use inline-block styling instead of full-width, ensuring the blue background only extends to the text content width rather than spanning the entire screen.

CUSTOMER PORTAL ACCOUNT SETTINGS EDIT FEATURE: Complete profile editing functionality implemented directly in the customer portal Account Settings tab. Features include edit button that transforms read-only profile display into editable form with Name, Email, Phone, and Business Name fields. Includes proper save/cancel controls with real-time validation and backend API endpoint (/api/customer-profile/update) for secure profile updates. Profile changes automatically sync with existing automated wholesaler notification system.

MOBILE-FRIENDLY LOGO UPLOAD SYSTEM COMPLETE: Implemented comprehensive logo upload system with mobile-optimized modal interface. Features include drag-and-drop support, camera integration for mobile devices, gallery selection, real-time preview, upload progress tracking, and validation. Object storage configured for secure file handling. Logo upload modal provides touch-friendly interface with options to take photos or select from gallery, automatic file validation, and seamless integration with business settings.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors. Theme system with dynamic coloring for navigation tabs.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Default table layout for orders with smart search and filtering, dynamic delivery method display. Clean shopping summary cards. Consistent branding footer across the platform. Product tags indicating selling format ("Individual Units", "Units & Pallets"). Enhanced quantity selection modals with free-type input and clear MOQ guidance. Interactive order confirmation celebration animation.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, comprehensive image display enhancement with optimization. Performance optimizations include React Query caching, lazy loading, import tree shaking, debounced search, optimized images, virtual scrolling for large lists, and optimized query hooks. Comprehensive payment duplication prevention. Customer registration request system. Registration-aware seller switching. Centralized currency formatting.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management (tiered plans, permissions, usage tracking), business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system. Critical fixes for Stripe API version and authentication flow simplification.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.
- **Additional Tables**: `customerRegistrationRequests` for managing access requests.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, Google Maps API, AI-powered image generation.
- **Shipping Integration**: Parcel2Go API, Google Places.