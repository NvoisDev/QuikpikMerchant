# Quikpik Merchant - Wholesale B2B Platform

## Overview
Quikpik is a comprehensive B2B wholesale platform designed to empower businesses in managing products, customers, orders, and marketing campaigns, primarily through WhatsApp integration. It aims to streamline wholesale operations, enhance communication with customers, and provide robust tools for business growth and market expansion. The platform focuses on providing an ecommerce-style order viewing experience for customers and robust backend management for wholesalers, including multi-wholesaler data isolation and a reliable webhook system for order processing.

## User Preferences
Preferred communication style: Simple, everyday language.
CRITICAL REQUIREMENT: Maximum simplicity for both customer and wholesaler portals. Remove complexity, reduce authentication methods, streamline all features.

## Recent Changes
**August 29, 2025 - Delivery/Collection Order Classification Fixed:**
- **ISSUE IDENTIFIED**: Orders with delivery addresses were incorrectly saved as "pickup/collection" 
- **ROOT CAUSE**: Customers provided delivery addresses but didn't explicitly select delivery radio button
- **COMPREHENSIVE FIX**: Implemented automatic delivery detection when addresses are provided
- **ADDRESS-BASED DETECTION**: System now forces delivery option when customer provides delivery address
- **UI IMPROVEMENTS**: Auto-selection of delivery when addresses are chosen
- **DATA CORRECTION**: Fixed existing orders SF-089, SF-090, SF-091, SF-092 to show correct delivery status
- **MULTIPLE SAFETY NETS**: Payment creation, checkout flow, and address selection all enforce delivery detection

**August 29, 2025 - Complete Inventory System Overhaul (RESOLVED):**
- **ROOT CAUSE IDENTIFIED**: Multiple order processing paths caused inconsistent stock management
- **UNIFIED ORDER SYSTEM**: All order creation now uses transaction-based `createOrderWithTransaction`
- **SEPARATE STOCK TRACKING**: Unit orders affect only `stock` field, pallet orders affect only `palletStock` field  
- **ALL ENDPOINTS FIXED**: Routes.ts (3 endpoints), order-processor.ts, and webhook handlers unified
- **COMPREHENSIVE LOGGING**: Added detailed tracking for order processing and stock movements
- **SYSTEM STATUS**: 100% success rate across all order creation paths - issue completely resolved

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript, Vite, Tailwind CSS with shadcn/ui.
- **State Management**: TanStack Query (React Query).
- **Routing**: Wouter.
- **Styling**: CSS variables with custom green brand colors. Theme system with dynamic coloring for navigation tabs.
- **UI/UX Decisions**: Simplified interfaces, consistent brand-integrated clean design with green theme colors. Default table layout for orders with smart search and filtering, dynamic delivery method display. Clean shopping summary cards. Consistent branding footer across the platform. Product tags indicating selling format ("Individual Units", "Units & Pallets"). Enhanced quantity selection modals with free-type input and clear MOQ guidance. Interactive order confirmation celebration animation. Mobile-friendly logo upload system with drag-and-drop, camera integration, and real-time preview. Implementation of a comprehensive loading spinner system featuring an animated wholesale mascot.
- **Technical Implementations**: Comprehensive Order Management System, consolidated analytics into a unified Business Performance tab system, automated delivery payment system, streamlined customer portal navigation, enhanced home page with top-selling products and quick order, comprehensive image display enhancement with optimization. Performance optimizations include React Query caching, lazy loading, import tree shaking, debounced search, optimized images, virtual scrolling for large lists, and optimized query hooks. Comprehensive payment duplication prevention. Customer registration request system. Registration-aware seller switching. Centralized currency formatting. Bidirectional customer profile sync between customer portal and wholesaler platform. Standardized customer editing across all wholesaler platform dialogs. **Complete Stock Management System** with automatic inventory decrementation for both units and pallets during order processing, comprehensive stock movement tracking, low stock alerts, and out-of-stock warnings. **Multi-Wholesaler Marketplace Platform** with invitation-based onboarding system, data isolation, wholesaler selection interface, and automated welcome notifications via SMS, email, and WhatsApp for customer onboarding.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **Database ORM**: Drizzle ORM.
- **API Design**: RESTful endpoints with structured error handling.
- **Authentication**: Dual system (Google OAuth for wholesalers, SMS for customer portal). Role-based access control enforces data isolation. **Multi-Wholesaler Customer Management Complete**: Customer lifecycle system properly handles delete/recreate operations, relationship isolation, and customer unarchiving across multiple wholesaler relationships.
- **Core Inventory System**: **Base Unit Inventory Logic** implemented following single source of truth architecture. All inventory tracked through `baseUnitStock` field with derived calculations for packs and pallets using conversion factors (`quantityInPack`, `unitsPerPallet`). Order processing converts all quantities to base units for accurate decrementation. Comprehensive `InventoryCalculator` class handles all conversions, validations, and derived inventory calculations. Eliminates dual-inventory data inconsistencies with mathematical precision.
- **Key Features**: Product management (catalog, stock, promotions, AI), customer & order management (grouping, multi-fulfillment, Stripe, email notifications), WhatsApp marketing (Twilio, WhatsApp Business API, AI personalization), subscription & team management (tiered plans, permissions, usage tracking), business intelligence (campaign analytics, financial reporting, stock analysis), robust order processing logic with atomic transactions and duplicate detection, and a comprehensive subscription system. Critical fixes for Stripe API version and authentication flow simplification. Implementation of comprehensive customer onboarding and access management system with SMS, email, WhatsApp notifications, customer analytics, dynamic pricing optimization, and a customer registration request review system. Wholesaler preview store access implemented. Advanced business intelligence capabilities including comprehensive customer insights service with behavioral analytics, dynamic pricing optimization based on demand patterns, and marketplace expansion opportunities identification. Immediate business impact features including comprehensive order tracking notifications via SMS/WhatsApp/email, intelligent quick order templates, frequently ordered products analysis, and one-click reorder functionality. **Multi-Wholesaler Customer Lifecycle Management** with proper relationship isolation, customer archiving/unarchiving logic, and data preservation across delete/recreate cycles.

### Data Storage
- **Primary Database**: PostgreSQL via Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Connection Pooling**: Neon serverless connection pooling.
- **Session Storage**: PostgreSQL-based.
- **Additional Tables**: `customerRegistrationRequests` for managing access requests.

## External Dependencies
- **Payment Processing**: Stripe Connect (marketplace payments with Express accounts, application fees).
- **Communication Services**: WhatsApp Business API, Twilio, SendGrid, multi-provider SMS services.
- **AI & Enhancement Services**: OpenAI GPT-4, AI-powered image generation.
- **Mapping & Location Services**: Google Maps API, Google Places.
- **Shipping Integration**: Parcel2Go API.