import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search,
  Package,
  Users,
  MessageSquare,
  BarChart3,
  CreditCard,
  Settings,
  ShoppingCart,
  Star,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Book,
  Video,
  FileText,
  Mail,
  Play
} from "lucide-react";
import OnboardingRestartButton from "@/components/OnboardingRestartButton";

const helpSections = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Book,
    description: "Essential setup steps to begin using Quikpik Merchant",
    articles: [
      {
        title: "Welcome to Quikpik Merchant",
        content: `
### What is Quikpik Merchant?

Quikpik Merchant is a comprehensive B2B platform designed for small-scale wholesalers to:
- Manage inventory and products with AI-powered descriptions
- Connect with retail customers through customer portal
- Process orders and payments with automatic invoicing
- Send WhatsApp broadcasts to customer groups
- Track business analytics and financial health
- Accept online payments with automatic platform fee collection
- Generate professional Stripe invoices for customers
- Handle refunds and order management efficiently

### Getting Started Checklist

1. **Complete Your Profile** - Add business information in Settings → Business Settings
2. **Set Up Payment Processing** - Configure Stripe Connect in Settings → Payments for direct customer payments
3. **Add Your Products** - Create your product catalog with images and AI descriptions in Product Management
4. **Create Customer Groups** - Organize your customers for targeted WhatsApp broadcasts
5. **Configure WhatsApp** - Set up Twilio integration for customer notifications in Settings → WhatsApp
6. **Preview Your Store** - Use "Preview Store" to see how customers view your products
7. **Start Selling** - Share customer portal links and begin receiving orders with automatic invoicing

### Key Features

- **Customer Portal**: Customers can browse products, place orders, and make payments without registration
- **Automatic Invoicing**: Stripe invoices automatically generated and emailed to customers
- **WhatsApp Integration**: Broadcast product updates and receive order notifications
- **Order Management**: Complete order lifecycle with status tracking and refund processing
- **Product Negotiation**: Enable custom pricing requests with minimum bid price controls
- **Real-time Analytics**: Track sales, revenue, and business performance
- **Mobile Responsive**: Works perfectly on all devices for you and your customers

### Subscription Plans

- **Free Plan**: Up to 3 products, limited editing (3 edits per product)
- **Standard Plan**: Up to 10 products, unlimited editing ($10.99/month)
- **Premium Plan**: Unlimited products, unlimited editing ($19.99/month)

All plans include 5% platform fee on successful orders with automatic revenue collection.
        `
      },
      {
        title: "Account Setup",
        content: `
### Setting Up Your Account

#### Personal Information
1. Go to **Settings → Account**
2. Fill in your first name, last name, and email
3. Add your phone number for customer communication

#### Business Information
1. Enter your business name (this appears to customers)
2. Add your business address
3. Set your business phone number
4. Choose your preferred currency (GBP, USD, EUR, etc.)

#### Logo & Branding
You can customize your business logo in three ways:
- **Initials**: Automatically generated from your business name
- **Business Name**: Display your full business name
- **Custom Upload**: Upload your own logo image

Click "Save Changes" to update your profile.
        `
      }
    ]
  },
  {
    id: "product-management",
    title: "Product Management",
    icon: Package,
    description: "How to add, edit, and manage your product inventory",
    articles: [
      {
        title: "Adding Products",
        content: `
### Creating New Products

1. **Navigate to Product Management** from the sidebar
2. **Click "Add Product"** to open the creation form
3. **Fill in Product Details**:
   - **Name**: Clear, descriptive product name
   - **Description**: Detailed product information (use AI generation if needed)
   - **Price**: Set your wholesale price
   - **Currency**: Choose from your preferred currency
   - **MOQ (Minimum Order Quantity)**: Minimum units customers must order
   - **Stock**: Current inventory count
   - **Category**: Select appropriate product category

4. **Add Product Image**:
   - Upload image file (max 800x600px, under 500KB)
   - Paste image URL
   - Images are automatically optimized

5. **Set Visibility Options**:
   - **Price Visible**: Show/hide price to customers
   - **Negotiation Enabled**: Allow customers to request price negotiations

6. **Click "Create Product"** to save

### Product Status Management

Products have three status options:
- **Active** (Green): Available for purchase
- **Inactive** (Gray): Hidden from marketplace
- **Out of Stock** (Red): Visible but not purchasable

Click the status badge on any product card to quickly change status.
        `
      },
      {
        title: "Managing Inventory",
        content: `
### Inventory Management Best Practices

#### Stock Tracking
- Update stock levels regularly after sales
- Set realistic MOQ based on your packaging/shipping constraints
- Use "Out of Stock" status when inventory is depleted

#### Pricing Strategy
- Research competitor pricing in your category
- Consider your margins and platform fee (5% on sales)
- Use price visibility settings strategically

#### Product Organization
- Use clear, searchable product names
- Write detailed descriptions with key specifications
- Choose accurate categories for better discoverability
- Upload high-quality product images

#### Bulk Operations
- Use the "Duplicate" feature to quickly create similar products
- Edit multiple products by status to manage seasonal inventory
- Export product data for offline analysis (coming soon)
        `
      }
    ]
  },
  {
    id: "customer-groups",
    title: "Customer Groups",
    icon: Users,
    description: "Organize customers and manage group communications",
    articles: [
      {
        title: "Creating Customer Groups",
        content: `
### Setting Up Customer Groups

Customer groups help you organize customers for targeted marketing and communications.

#### Creating a New Group
1. **Go to Customer Groups** in the sidebar
2. **Click "Create Group"**
3. **Enter Group Details**:
   - **Group Name**: Descriptive name (e.g., "Premium Retailers", "Local Shops")
   - **Description**: Purpose and criteria for the group
   - **WhatsApp Group ID** (optional): Link to existing WhatsApp group

4. **Click "Create Group"**

#### Adding Customers to Groups
1. **Click on a customer group** to view details
2. **Click "Add Customer"**
3. **Fill in Customer Information**:
   - Phone number (required for WhatsApp)
   - First name
   - Email address
   - Business address details
4. **Click "Add to Group"**

The system prevents duplicate phone numbers across groups.
        `
      },
      {
        title: "WhatsApp Group Connection",
        content: `
### Understanding WhatsApp Group Connectivity

When you see "WhatsApp group connected" on a customer group, it means the group is ready for WhatsApp marketing and communication.

#### What WhatsApp Group Connection Enables
- **Broadcast Campaigns**: Send product announcements to all group members at once
- **Stock Updates**: Automatically notify customers when products are back in stock
- **Promotional Messages**: Share special offers, discounts, or new arrivals
- **Order Notifications**: Members receive updates about their orders via WhatsApp
- **Two-way Communication**: Customers can reply directly to ask questions or place orders

#### How WhatsApp Groups Work
- **Business Integration**: Uses your configured WhatsApp Business integration (Twilio or Direct API)
- **Professional Messaging**: Sends messages from your business WhatsApp number
- **Customer Experience**: Customers receive messages on their personal WhatsApp
- **Direct Portal Access**: Messages include links to your customer portal for easy ordering

#### Creating WhatsApp Group Connection
1. **Configure WhatsApp Integration** in Settings → WhatsApp Integration
2. **Go to Customer Groups** and select a group
3. **Click "Create WhatsApp Group"** button
4. **System validates** your WhatsApp configuration
5. **Group becomes connected** for messaging campaigns

#### Benefits for Your Business
- **Instant Communication**: Reach customers immediately on their most-used platform
- **Higher Engagement**: WhatsApp messages have much higher open rates than email
- **Direct Ordering**: Customers can order products directly through message links
- **Professional Image**: Branded business messages build customer trust
- **Automated Workflows**: System handles welcome messages for new customers

#### Customer Benefits
- **Real-time Updates**: Get instant notifications about products they're interested in
- **Easy Ordering**: Direct links to place orders without navigating websites
- **Personal Service**: Can reply directly to ask questions or request support
- **Exclusive Access**: First to know about new products, discounts, and special offers

The "connected" status confirms your customer group is ready for WhatsApp marketing, making it easier to engage with wholesale customers and drive sales through direct messaging.
        `
      },
      {
        title: "Managing Group Members",
        content: `
### Group Member Management

#### Viewing Group Members
- Click on any customer group to see member list
- View member count on the group card
- Search members by name, phone, or email

#### Member Information
Each member profile includes:
- Contact details (phone, email)
- Business information
- Address details
- Join date

#### Removing Members
- Click the red trash icon next to any member
- Confirm removal (they can be re-added later)
- Members are only removed from the group, not deleted entirely

#### Best Practices
- Segment customers by purchase volume, location, or product interest
- Keep groups reasonably sized for effective communication
- Regularly review and update member lists
- Use descriptive group names and descriptions
        `
      },
      {
        title: "Merging Duplicate Customers",
        content: `
### Customer Merge Functionality

Fix duplicate customer accounts that can cause authentication conflicts and data confusion.

#### Why Merge Customers?
Duplicate customer accounts occur when:
- Same customer has multiple entries with different emails
- Similar phone numbers (e.g., +44 vs 07 format) create separate accounts
- Manual data entry creates variations in names or contact info
- Import processes create multiple records for same person

Problems caused by duplicates:
- Authentication conflicts with shared phone digits
- Fragmented order history across multiple accounts
- Inaccurate customer analytics and reporting
- Confusion during order management

#### How to Merge Customers

**Step 1: Access Merge Tool**
1. Go to **Customer Groups** in the sidebar
2. Click the **"Merge Duplicates"** button in the toolbar
3. System automatically scans for potential duplicates

**Step 2: Review Duplicate Detection**
The system finds duplicates by:
- Matching phone numbers (different formats)
- Similar names with same phone number
- Email variations for same contact

**Step 3: Select Primary Account**
- Review suggested primary account (usually most orders)
- Verify customer details are correct
- Choose which account should remain active

**Step 4: Confirm Data Transfer**
Before merging, review what will be transferred:
- All order history and purchase data
- Customer group memberships
- Product interactions and preferences
- Campaign history and responses
- Contact information (best version retained)

**Step 5: Execute Merge**
- Click **"Merge Accounts"** to combine records
- System transfers all data to primary account
- Duplicate accounts are permanently deleted
- Process typically completes in 5-10 seconds

#### What Gets Merged
The merge process handles all database relationships:
- **Orders**: All purchase history consolidated
- **Customer Groups**: Memberships combined
- **Campaigns**: All broadcast history preserved
- **Products**: Viewing and interaction history
- **Contact Info**: Best available data retained
- **Analytics**: Accurate customer metrics restored

#### Merge Results
After merging:
- Single customer account with complete history
- All orders appear under primary account
- Customer authentication works correctly
- Analytics reflect accurate customer value
- Clean database without duplicates

#### Manual vs Automatic Detection
**Automatic Detection** (Recommended):
- Click "Merge Duplicates" for system detection
- Finds customers with matching phone numbers
- Suggests best primary account automatically

**Manual Selection**:
- Select specific customers to merge
- Useful for complex duplicate scenarios
- Choose your own primary account

#### Best Practices
- **Regular Cleanup**: Run merge detection monthly
- **Verify First**: Always review suggested merges before executing
- **Backup Approach**: Export customer data before major merge operations
- **Team Coordination**: Inform team members about merge activities
- **Customer Communication**: Notify customers if their login details change

#### Troubleshooting
**Problem**: Can't find duplicate customers
- **Solution**: Check for variations in phone number format (+44 vs 07)

**Problem**: Merge button is disabled
- **Solution**: Select at least 2 customers with same phone number

**Problem**: Wrong primary account selected
- **Solution**: You can manually choose different primary account before merging

**Problem**: Order history missing after merge
- **Solution**: Contact support - all order data should transfer automatically

#### Safety Features
- **Confirmation Dialog**: Always confirms before permanent deletion
- **Data Validation**: Verifies all relationships before transfer
- **Error Handling**: Rolls back if any issues occur during merge
- **Audit Trail**: Logs all merge activities for reference

The merge system handles all foreign key constraints automatically, ensuring your data remains intact throughout the process.
        `
      }
    ]
  },
  {
    id: "whatsapp-broadcasts",
    title: "WhatsApp Broadcasts",
    icon: MessageSquare,
    description: "Send product updates and notifications via WhatsApp",
    articles: [
      {
        title: "WhatsApp Business API Setup",
        content: `
### Setting Up WhatsApp Business API

#### Prerequisites
You need a WhatsApp Business API account from Meta.

#### Step-by-Step Setup
1. **Create Meta Developer Account**
   - Visit [developers.facebook.com](https://developers.facebook.com)
   - Sign up or log in with your Facebook account
   - Verify your identity and business

2. **Set Up WhatsApp Business API**
   - Create a new app in Meta for Developers
   - Add WhatsApp Business API product
   - Complete business verification process
   - Get your phone number verified

3. **Get API Credentials**
   - **Business Phone Number**: Your verified WhatsApp Business number
   - **Access Token**: Permanent access token from Meta
   - **Business Display Name**: How your business appears in messages

4. **Configure in Quikpik**
   - Go to **Settings → WhatsApp Integration**
   - Enter your credentials
   - Click "Save Configuration"
   - Click "Verify Connection" to test

#### Important Notes
- Use your actual business phone number
- Keep your access token secure
- Test with a small group first
        `
      },
      {
        title: "Sending Broadcasts",
        content: `
### Creating and Sending Broadcasts

#### To Send a Product Broadcast
1. **Go to Broadcasts** in the sidebar
2. **Click "Create New Broadcast"**
3. **Select Product**: Choose which product to promote
4. **Select Customer Group**: Pick your target audience
5. **Add Custom Message** (optional): Personalize the message
6. **Click "Send Broadcast"**

#### Broadcast Message Format
The system automatically generates messages including:
- Product name and description
- Price and MOQ information
- Your business contact details
- Custom message (if added)

#### Tracking Results
After sending, you can monitor:
- **Delivery Status**: Sent, delivered, or failed
- **Recipient Count**: Total customers reached
- **Response Rates**: Customer engagement metrics

#### Best Practices
- Send broadcasts during business hours
- Keep custom messages concise and relevant
- Don't over-broadcast to the same group
- Monitor response rates and adjust strategy
- Ensure compliance with WhatsApp Business policies
        `
      }
    ]
  },
  {
    id: "orders-payments",
    title: "Orders & Payments",
    icon: ShoppingCart,
    description: "Process orders and manage payment workflows",
    articles: [
      {
        title: "Order Management",
        content: `
### Managing Customer Orders

#### Order Workflow
Orders go through these status stages:
1. **Pending**: New order awaiting your confirmation
2. **Confirmed**: You've accepted the order
3. **Processing**: Order is being prepared
4. **Shipped**: Order has been dispatched
5. **Delivered**: Order received by customer

#### Processing Orders
1. **View Orders** in the sidebar
2. **Click on an order** to see details
3. **Review Order Items**:
   - Products ordered
   - Quantities and prices
   - Customer delivery address
   - Special notes

4. **Update Order Status**:
   - Click the status dropdown
   - Select new status
   - Order automatically updates

#### Order Information
Each order shows:
- Customer details and delivery address
- Order items with quantities and prices
- Subtotal, platform fee (5%), and total
- Payment status
- Order date and tracking

#### Communication
- Contact customers directly via phone/email
- Send updates about order progress
- Resolve any issues promptly
        `
      },
      {
        title: "Payment Processing Setup",
        content: `
### Stripe Connect Payment Setup

To receive payments from customers, you must set up Stripe Connect.

#### Initial Setup
1. **Go to Settings → Payments**
2. **Click "Set up Payment Processing"**
3. **Complete Stripe Onboarding**:
   - Provide business information
   - Add bank account details
   - Verify your identity
   - Complete tax information

#### Payment Flow
When customers pay:
1. Customer pays full order amount (including 5% platform fee)
2. Quikpik automatically collects 5% platform fee
3. You receive 95% directly to your bank account
4. Order status updates to "Processing"

#### Account Status
Your payment account has two key states:
- **Account Status**: Verified or Pending
- **Payment Processing**: Enabled or Disabled

#### Revenue Breakdown
- **You Keep**: 95% of order value
- **Platform Fee**: 5% to Quikpik for platform services

#### Bank Transfers
- Funds are transferred to your bank account automatically
- Transfer timing depends on your country (usually 2-7 business days)
- View transfer history in your Stripe dashboard
        `
      }
    ]
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: Star,
    description: "How customers discover and purchase your products",
    articles: [
      {
        title: "Marketplace Overview",
        content: `
### Understanding the Marketplace

The Quikpik Marketplace is where customers discover and purchase products from all wholesalers.

#### How It Works
- **Product Discovery**: Customers browse all active products
- **Wholesaler Profiles**: Your business appears with products
- **Search & Filters**: Customers can search by product, category, or location
- **Order Placement**: Customers add items to cart and checkout

#### Your Marketplace Presence
Your products appear in the marketplace when they're set to "Active" status.

#### Product Display
Each product card shows:
- Product image and name
- Price (if visible)
- MOQ requirement
- Your business name and logo (top right corner)
- "View Details" button

#### Customer Journey
1. Customer browses marketplace
2. Finds your products
3. Views product details
4. Adds to cart (respecting MOQ)
5. Proceeds to checkout
6. Completes payment via Stripe
7. You receive order notification

#### Improving Visibility
- Use high-quality product images
- Write detailed, keyword-rich descriptions
- Price competitively
- Maintain good stock levels
- Respond quickly to orders
        `
      },
      {
        title: "Customer Experience",
        content: `
### What Customers See

#### Product Discovery
Customers can find your products through:
- **Browse All Products**: Main marketplace view
- **Search**: By product name or description
- **Categories**: Filter by product type
- **Wholesaler Profiles**: View all products from specific sellers

#### Product Information
Customers see:
- Product name and description
- Price (if you've made it visible)
- Minimum order quantity (MOQ)
- Stock availability
- Your business information
- Product images

#### Shopping Cart
- Customers add products respecting MOQ requirements
- Cart shows total cost including platform fee
- Order summary with delivery address

#### Checkout Process
- Secure payment via Stripe
- Order confirmation email
- Tracking information
- Direct contact with you for updates

#### After Purchase
- Order status updates
- Delivery tracking
- Ability to contact you directly
- Order history and receipts
        `
      }
    ]
  },
  {
    id: "analytics",
    title: "Analytics & Reports",
    icon: BarChart3,
    description: "Track performance and business insights",
    articles: [
      {
        title: "Dashboard Overview",
        content: `
### Understanding Your Analytics

The Analytics dashboard provides insights into your business performance.

#### Key Metrics
- **Total Revenue**: All-time earnings from orders
- **Orders Count**: Total number of orders processed
- **Active Products**: Currently available products
- **Low Stock**: Products with low inventory

#### Revenue Analytics
- **Revenue Trends**: Daily/weekly/monthly revenue charts
- **Growth Rates**: Percentage change over time
- **Revenue Sources**: Breakdown by product categories

#### Product Performance
- **Top Products**: Best-selling items by revenue and quantity
- **Product Analytics**: Individual product performance
- **Stock Levels**: Inventory management insights

#### Customer Analytics
- **New vs Returning**: Customer acquisition metrics
- **Order Patterns**: Purchase frequency and timing
- **Geographic Distribution**: Where your customers are located

#### Broadcast Analytics
- **Total Broadcasts**: Number of campaigns sent
- **Recipients Reached**: Total customers contacted
- **Engagement Rates**: Response and conversion rates
        `
      },
      {
        title: "Using Data for Growth",
        content: `
### Making Data-Driven Decisions

#### Revenue Optimization
- Identify your best-selling products
- Focus inventory investment on high-performers
- Adjust pricing based on demand patterns
- Track seasonal trends

#### Product Strategy
- Monitor stock levels to prevent stockouts
- Identify slow-moving inventory
- Plan new product additions based on gaps
- Optimize product descriptions and images

#### Customer Insights
- Understand customer purchase patterns
- Identify your most valuable customer segments
- Tailor broadcasts to customer preferences
- Improve customer retention strategies

#### Marketing Effectiveness
- Track broadcast performance
- Measure customer acquisition costs
- Optimize communication timing
- A/B test different message formats

#### Operational Efficiency
- Monitor order fulfillment times
- Track customer satisfaction
- Identify bottlenecks in your process
- Plan capacity for peak periods
        `
      }
    ]
  },
  {
    id: "subscription",
    title: "Subscription & Billing",
    icon: CreditCard,
    description: "Manage your subscription plan and billing",
    articles: [
      {
        title: "Subscription Plans",
        content: `
### Choosing the Right Plan

#### Free Plan
- **Cost**: $0/month
- **Products**: Up to 3 products
- **Features**: 
  - Basic WhatsApp broadcasts
  - Order management
  - Basic analytics
  - Email support

#### Standard Plan
- **Cost**: $10.99/month
- **Products**: Up to 10 products
- **Features**:
  - Advanced WhatsApp broadcasts
  - Customer groups
  - Priority order processing
  - Advanced analytics
  - Phone support

#### Premium Plan
- **Cost**: $19.99/month
- **Products**: Unlimited products
- **Features**:
  - Custom broadcast templates
  - Advanced customer segmentation
  - Real-time inventory alerts
  - Premium analytics dashboard
  - Dedicated account manager

#### Upgrading Your Plan
1. Go to **Subscription** in the sidebar
2. Review available plans
3. Click "Upgrade" on your desired plan
4. Complete secure payment via Stripe
5. New limits take effect immediately
        `
      },
      {
        title: "Billing & Payments",
        content: `
### Managing Your Subscription

#### Payment Methods
- Subscriptions are processed via Stripe
- Secure credit/debit card payments
- Automatic monthly billing
- Pro-rated upgrades/downgrades

#### Billing Cycle
- Monthly subscriptions bill on the same date each month
- Upgrades are pro-rated for the current period
- Downgrades take effect at the next billing cycle

#### Managing Subscription
- **View Current Plan**: Check your active subscription
- **Usage Monitoring**: Track product limits
- **Payment History**: View past invoices
- **Cancel Anytime**: No long-term contracts

#### Plan Changes
- **Upgrading**: Immediate access to new features
- **Downgrading**: Changes at next billing cycle
- **Cancellation**: Account remains active until period end

#### Transaction Fees
Regardless of subscription plan:
- **Platform Fee**: 5% on all successful orders
- **Payment Processing**: Handled by Stripe
- **Your Revenue**: 95% of order value goes to you
        `
      }
    ]
  },
  {
    id: "customer-portal",
    title: "Customer Portal & Orders",
    icon: ShoppingCart,
    description: "Managing customer orders, payments, and the shopping experience",
    articles: [
      {
        title: "Customer Portal Overview",
        content: `
### Understanding the Customer Portal

The Customer Portal is a dedicated shopping interface where your customers can browse products, place orders, and make payments without needing to register or create accounts.

#### Key Features
- **No Registration Required**: Customers can shop immediately without signup
- **Mobile Responsive**: Perfect experience on phones, tablets, and desktop
- **Secure Payments**: Stripe-powered checkout with card processing
- **Automatic Invoicing**: Professional invoices emailed after purchase
- **Real-time Stock**: Live inventory updates prevent overselling
- **Negotiation System**: Customers can request custom pricing on eligible products

#### How Customers Access Your Portal
1. **Direct Links**: Share your customer portal URL (found in "Preview Store")
2. **WhatsApp Broadcasts**: Product links automatically include portal access
3. **Email Campaigns**: Include portal links in email marketing

#### Portal Features for Customers
- Browse all your active products
- View detailed product information and images
- Add multiple items to shopping cart
- Adjust quantities within stock limits
- Request custom pricing for negotiable products
- Complete secure checkout with Stripe
- Receive automatic confirmation emails and invoices
        `
      },
      {
        title: "Order Management",
        content: `
### Managing Customer Orders

#### Order Lifecycle
1. **Order Placed**: Customer completes payment through portal
2. **Order Confirmed**: Automatic confirmation email sent to customer
3. **Payment Received**: Funds processed through Stripe Connect
4. **Fulfilled**: You manually mark orders as fulfilled when shipped
5. **Archived**: Orders automatically archive 24 hours after fulfillment

#### Order Status Management
- **Active Orders**: Show in main order list for processing
- **Status Updates**: Click dropdown to change order status
- **Manual Actions**: Only "Fulfilled" requires your action - everything else is automatic
- **Email Confirmations**: Resend confirmation emails anytime

#### Order Details
Each order includes:
- Customer contact information and delivery address
- Product details with quantities and pricing
- Payment information and Stripe transaction ID
- Platform fee calculation (5% automatically collected)
- Order timeline with status changes and emails sent

#### Processing Orders
1. Review order details in the Orders page
2. Prepare products for shipment
3. Update order status to "Fulfilled" when shipped
4. Customer receives automatic notification
5. Order archives automatically after 24 hours
        `
      },
      {
        title: "Payment Processing & Invoicing",
        content: `
### Stripe Integration & Automatic Invoicing

#### Payment Flow
1. **Customer Checkout**: Secure payment through Stripe Elements
2. **Platform Fee**: 5% automatically deducted for Quikpik
3. **Wholesaler Payment**: 95% of order value transferred to your Stripe account
4. **Invoice Generation**: Professional Stripe invoice automatically created and emailed

#### Invoice Features
- **Detailed Line Items**: Shows each product, quantity, and unit price
- **Platform Fee Disclosure**: Transparent fee breakdown
- **Professional Format**: Branded with your business information
- **Email Delivery**: Automatically sent to customer's email
- **Payment Status**: Marked as paid since payment was already processed

#### Setting Up Payments
1. **Stripe Connect**: Complete onboarding in Settings → Payments
2. **Account Verification**: Ensure Stripe account can accept payments
3. **Business Information**: Keep business details current for proper invoicing
4. **Currency Settings**: Set preferred currency in Business Settings

#### Payment Troubleshooting
- **Payment Failures**: Usually due to incomplete Stripe Connect setup
- **Missing Invoices**: Check customer email addresses and spam folders
- **Currency Issues**: Verify currency settings match your Stripe account
- **Platform Fees**: Automatically calculated and collected - no manual action needed
        `
      },
      {
        title: "Refunds & Cancellations",
        content: `
### Processing Refunds

#### When to Issue Refunds
- Customer requests cancellation
- Product unavailable after order placed
- Quality issues or customer dissatisfaction
- Duplicate orders or payment errors

#### How to Process Refunds
1. **Go to Orders**: Find the order to refund
2. **Click Order Details**: Open the order detail modal
3. **Click "Refund"**: Red refund button at bottom
4. **Choose Refund Type**:
   - **Full Refund**: Cancels entire order, restores stock
   - **Partial Refund**: Specify amount, keeps order active
5. **Add Reason**: Explain why refund was issued
6. **Confirm**: Refund processes through Stripe immediately

#### Refund Processing
- **Stripe Integration**: Refunds processed automatically through Stripe
- **Stock Restoration**: Full refunds automatically restore product stock
- **Customer Notification**: Customers receive refund confirmation emails
- **Order Status**: Full refunds change order status to "Refunded"
- **Platform Fees**: Platform fees are also refunded for full refunds

#### Refund Timeline
- **Processing**: Refunds process immediately through Stripe
- **Customer Receipt**: Funds typically appear in 5-10 business days
- **Notification**: Customer receives immediate refund confirmation
- **Records**: All refunds tracked in order history and Stripe dashboard
        `
      }
    ]
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: Settings,
    description: "Common issues and solutions",
    articles: [
      {
        title: "Common Issues & Solutions",
        content: `
### Frequently Asked Questions

#### Product Management Issues

**Q: Why can't I add more products?**
A: Check your subscription plan's product limit. Free plan allows 3 products, Standard allows 10, Premium is unlimited.

**Q: My product images won't upload**
A: Ensure images are under 500KB and max 800x600px. Supported formats: JPG, PNG, GIF.

**Q: Products not appearing in marketplace**
A: Make sure product status is set to "Active" and you have stock available.

#### WhatsApp Broadcast Issues

**Q: WhatsApp broadcasts not sending**
A: Verify your WhatsApp Business API credentials in Settings → WhatsApp Integration. Ensure your access token is valid.

**Q: Messages showing as failed**
A: Check recipient phone numbers are valid and have WhatsApp. Verify your business phone number is active.

#### Payment Processing Issues

**Q: Can't receive payments**
A: Complete Stripe Connect onboarding in Settings → Payments. Ensure your account is verified and payment processing is enabled.

**Q: Customer payments failing**
A: Check that your Stripe account can accept payments. Contact Stripe support if account verification is needed.

**Q: Customers not receiving invoices**
A: Stripe invoices are automatically sent after successful payments. Check customer email addresses are correct and check their spam folder.

**Q: Platform fee not being collected**
A: Platform fees are automatically calculated (5%) and collected when using Stripe Connect accounts. Verify your Stripe Connect setup is complete.

#### Order Management Issues

**Q: Orders not updating**
A: Refresh the page or check your internet connection. Order status changes are saved automatically.

**Q: Customer contact information missing**
A: Ensure customers provide complete information during checkout. You can request updates directly.

**Q: Refund showing "No payment information found"**
A: This was a previous issue that has been fixed. Ensure you're using the latest version. If the problem persists, contact support.

**Q: Customer not receiving Stripe invoices**
A: Stripe invoices are automatically sent after successful payments. Check the customer's email address is correct and ask them to check spam folders.

**Q: Multiple payment attempts creating duplicate orders**
A: This issue has been resolved with loading state protection. Customers should only be able to create one payment intent per checkout session.

**Q: Email confirmations showing "Product" instead of actual names**
A: This display issue has been fixed. All email confirmations now show actual product names and proper pricing information.
        `
      },
      {
        title: "Getting Support",
        content: `
### How to Get Help

#### Self-Service Resources
1. **Help Hub**: This comprehensive guide (you're reading it!)
2. **Settings Pages**: Built-in tooltips and guidance
3. **Status Indicators**: Green checkmarks show properly configured features

#### Contacting Support

#### Free Plan Users
- **Email Support**: Send detailed questions to support@quikpik.co
- **Response Time**: Within 48 hours
- **Documentation**: Extensive help articles and guides

#### Standard Plan Users
- **Email Support**: Priority email support
- **Phone Support**: Direct phone consultation
- **Response Time**: Within 24 hours
- **Setup Assistance**: Help with integrations

#### Premium Plan Users
- **Dedicated Account Manager**: Personal support contact
- **Priority Support**: Immediate assistance
- **Phone Support**: Direct line for urgent issues
- **Custom Onboarding**: Personalized setup assistance

#### When Contacting Support
Please include:
- Your account email
- Detailed description of the issue
- Screenshots if relevant
- Steps you've already tried
- Browser and device information

#### Technical Issues
For technical problems:
1. Try refreshing the page
2. Clear browser cache and cookies
3. Check internet connection
4. Try a different browser
5. Contact support if issue persists
        `
      }
    ]
  }
];

export default function Help() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState(helpSections[0].id);
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});

  const toggleArticle = (articleTitle: string) => {
    setExpandedArticles(prev => ({
      ...prev,
      [articleTitle]: !prev[articleTitle]
    }));
  };

  const filteredSections = helpSections.map(section => ({
    ...section,
    articles: section.articles.filter(article =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(section => section.articles.length > 0 || section.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const currentSection = helpSections.find(section => section.id === selectedSection);

  const renderContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">{line.replace('### ', '')}</h3>;
      } else if (line.startsWith('#### ')) {
        return <h4 key={index} className="text-base font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2">{line.replace('#### ', '')}</h4>;
      } else if (line.startsWith('- ')) {
        return <li key={index} className="ml-4 text-gray-700 dark:text-gray-300">{line.replace('- ', '')}</li>;
      } else if (line.trim().match(/^\d+\./)) {
        return <li key={index} className="ml-4 text-gray-700 dark:text-gray-300 list-decimal">{line.trim()}</li>;
      } else if (line.includes('[developers.facebook.com]')) {
        return (
          <p key={index} className="text-gray-700 dark:text-gray-300 mb-2">
            {line.replace('[developers.facebook.com](https://developers.facebook.com)', '')}
            <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline">
              developers.facebook.com
            </a>
          </p>
        );
      } else if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={index} className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{line.replace(/\*\*/g, '')}</p>;
      } else if (line.trim() === '') {
        return <br key={index} />;
      } else {
        return <p key={index} className="text-gray-700 dark:text-gray-300 mb-2">{line}</p>;
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Help Hub</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Comprehensive guides and documentation for all Quikpik Merchant features</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Book className="mr-2 h-5 w-5" />
                Topics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1">
                {filteredSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.id}
                      className={`flex items-center p-3 cursor-pointer border-l-4 transition-colors ${
                        selectedSection === section.id
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-500"
                          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-transparent"
                      }`}
                      onClick={() => setSelectedSection(section.id)}
                    >
                      <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{section.title}</div>
                        {section.articles.length > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {section.articles.length} articles
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <OnboardingRestartButton 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
              />
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Mail className="mr-2 h-4 w-4" />
                Contact Support
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Video className="mr-2 h-4 w-4" />
                Video Tutorials
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <FileText className="mr-2 h-4 w-4" />
                Download Guides
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {currentSection && (
            <Card>
              <CardHeader>
                <div className="flex items-center">
                  <currentSection.icon className="mr-3 h-6 w-6 text-blue-600" />
                  <div>
                    <CardTitle>{currentSection.title}</CardTitle>
                    <p className="text-gray-600 mt-1">{currentSection.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentSection.articles.map((article, index) => (
                  <div key={index} className="border rounded-lg">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleArticle(article.title)}
                    >
                      <h3 className="font-medium text-gray-900">{article.title}</h3>
                      {expandedArticles[article.title] ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    {expandedArticles[article.title] && (
                      <div className="px-4 pb-4 border-t bg-gray-50">
                        <div className="pt-4 prose prose-sm max-w-none">
                          {renderContent(article.content)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {searchTerm && filteredSections.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-600">
                  Try different keywords or browse the topics in the sidebar.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}