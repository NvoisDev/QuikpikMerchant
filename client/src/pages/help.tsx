import { useState, type ReactNode } from "react";
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
  Play,
  Banknote
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
- Organise customer groups for price lists, communications, and targeted broadcasts when available
- Track business analytics and financial health
- Accept online card payments with automatic platform fee collection
- Generate professional Stripe invoices for customers
- Handle refunds and order management efficiently

### Getting Started Checklist

1. **Complete Your Profile** - Add business information in Settings → Business Settings
2. **Set Up Payment Processing** - Configure Stripe Connect in Settings → Payments for direct customer payments
3. **Add Your Products** - Create your product catalog with images and AI descriptions in Product Management
4. **Create Customer Groups** - Organise your customers into groups for price lists, communications, and targeted broadcasts when available
5. **Configure WhatsApp** - Set up Twilio integration for customer notifications in Settings → WhatsApp
6. **Preview Your Store** - Use "Preview Store" to see how customers view your products
7. **Start Selling** - Share customer portal links and begin receiving orders with automatic invoicing

### Key Features

- **Customer Portal**: Guests can browse your catalog where enabled, but prices and ordering require approved customer access
- **Automatic Invoicing**: Stripe invoices automatically generated and emailed to customers
- **WhatsApp Messaging**: Send supported customer notifications now and prepare groups for future broadcast campaigns
- **Price Lists**: Offer customer-specific or group-specific prices with shareable Excel exports
- **Order Management**: Complete order lifecycle with status tracking and refund processing
- **Product Negotiation**: Enable custom pricing requests with minimum bid price controls
- **Real-time Analytics**: Track sales, revenue, and business performance
- **Mobile Responsive**: Works perfectly on all devices for you and your customers

### Subscription Plans

- **Free Plan**: Up to 10 products (£0/month)
- **Standard Plan**: Up to 50 products, unlimited editing (£19.99/month)
- **Premium Plan**: Unlimited products, unlimited editing (£49.99/month)

All plans include a 4.6% platform fee on eligible online card orders. Offline, cash, and Pay Later orders have no platform fee unless an online payment is taken later.
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
      },
      {
        title: "Team Management",
        content: `
### Managing Your Team

The **Team Management** page (accessible from the sidebar) lets you invite colleagues to help run your Quikpik Merchant account with role-based access.

#### Inviting a Team Member
1. Go to **Team Management** in the sidebar
2. Click **"Invite Team Member"**
3. Enter their name and email address
4. Choose their role
5. Click **Send Invitation** — they'll receive an email with a link to set up their account

#### Team Roles & Permissions

| Role | What They Can Do |
|------|-----------------|
| **Admin** | Full access: manage products, orders, customers, future broadcast tools, settings, and team |
| **Manager** | Products, orders, customers, future broadcast tools — cannot access billing or team settings |
| **Staff** | View and update orders, view products and customers |
| **Viewer** | Read-only access across the platform |

#### Managing Existing Members
- **View status**: See whether an invitation is pending or accepted
- **Remove member**: Revoke access at any time from the team list
- Removed members lose access immediately

#### Notes
- Team members log in with their own email (via Google) — they don't use your credentials
- Each team member's activity is scoped to your wholesaler account only; they cannot see other wholesalers' data
- Invitations expire after 7 days. Resend from the team list if needed.
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
- **Inactive** (Gray): Hidden from your customer portal and future marketplace listings
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
- Click any product's stock count to open the stock update panel and view full movement history

#### Stock Movement History
Every stock change is logged automatically with a before/after count and reason. Movement types include:
- **Order** — stock reduced when a customer places an order
- **Customer Return** — stock restored when an order is cancelled or items are partially returned with "Restock inventory" ticked. Shows as a green "+X units · Return" entry linked to the order.
- **Restocked / Manual Increase** — stock added manually (new shipment, correction)
- **Removed / Manual Decrease** — stock removed manually

#### Stock Alerts
Stock alerts help you stay on top of inventory without having to check manually:
- **Automated daily check**: Every morning at **8 AM**, the system scans all your products and compares stock levels against their threshold
- **Email alert**: If any product is at or below its threshold, you'll receive an email listing those products — and they'll appear on your Stock Alerts page
- **24-hour limit per product**: A product can only trigger one alert per 24 hours, so you won't receive repeated alerts for the same item
- **Per-product thresholds**: Each product has its own threshold (default 50 units). You can adjust this from the Stock Alerts page using the settings icon on each alert
- **Global default**: Set a default threshold in Stock Alerts → Settings to apply to all new products going forward
- **Resolving alerts**: Once you've restocked, mark the alert as resolved so it clears from your list
- **Visual indicators**: Products that are low or out of stock also show a coloured badge on your Products page — amber for Low Stock, red for Out of Stock

#### Notification Centre (Bell Icon)
The bell icon in the top-right of every page shows everything that needs your attention in one place:
- **Red badge**: Total count of pending items across all notification types
- **Customer Requests**: New customers who have requested access to your wholesale store — click to approve or decline
- **Stock Alerts**: Products running low or out of stock — click to go to the full Stock Alerts page
- Clicking any item in the notification panel takes you directly to the relevant page to take action

#### Pricing Strategy
- Research competitor pricing in your category
- Consider your margins and the 4.6% platform fee on eligible online card payments
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
    id: "promotions",
    title: "Promotions",
    icon: Star,
    description: "Create and manage promotional pricing for your products",
    articles: [
      {
        title: "Setting Up Promotions",
        content: `
### Creating Promotions

Navigate to **Promotions** in the sidebar to manage all promotional pricing for your store.

#### 5 Promotion Types

1. **Percentage Discount** — Take a percentage off the regular price (e.g. 20% off). Enter the discount percentage and the system calculates the promotional price automatically. Shown with a red badge on the customer store.

2. **Fixed Price** — Set a specific promotional price regardless of the original price (e.g. £5.00). The original price appears as a strikethrough next to the promotional price. Shown with a green badge.

3. **Buy X Get Y Free** — Reward bulk purchases (e.g. buy 10, get 2 free). Enter the "buy quantity" and the "free quantity". Free items are shown in the customer's cart and reflected in totals. Shown with a purple badge.

4. **Bundle Deal** — Unlock a special bundle price when the customer orders at least a minimum quantity (e.g. order 12+ for £15.00 each). Enter the minimum quantity and bundle price. Shown with a blue badge.

5. **Clearance** — Set a fixed clearance price for end-of-line or excess stock. Works like Fixed Price but with an orange "Clearance" badge to signal urgency.

#### Creating a Promotion

1. Click **"New Promotion"** on the Promotions page
2. Enter a promotion name (e.g. "Summer Sale 20% Off")
3. Select the promotion type
4. Fill in the type-specific fields (discount %, price, quantities etc.)
5. Set a **Start Date** and **End Date** (optional — promotions auto-activate and auto-deactivate based on these dates)
6. Click **"Assign Products"** to link the promotion to one or more products
7. Save the promotion

#### Managing Promotions

- **Toggle active/inactive**: Switch any promotion on or off instantly without deleting it
- **Edit**: Update any promotion details or change assigned products
- **Delete**: Remove a promotion permanently

#### Customer Experience

- Promotional prices appear on the store with colour-coded badges matching the promotion type
- Original prices show as strikethrough next to the promotional price
- Free items (Buy X Get Y) are shown in the cart summary
- Cart and checkout always use the current promotional price

#### Dashboard Summary

Active promotions are shown in a summary section on your main dashboard so you always know what's running. Click "Manage" to go directly to the Promotions page.
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

When you see "WhatsApp group connected" on a customer group, it means the group is ready for supported WhatsApp customer messages and future broadcast tools.

#### What WhatsApp Group Connection Enables
- **Broadcast Campaigns (coming soon)**: Product announcements to group members are on the roadmap
- **Stock Updates (coming soon)**: Future broadcasts can help announce when products are back in stock
- **Promotional Messages (coming soon)**: Future broadcasts can help share special offers, discounts, or new arrivals
- **Order Notifications**: Supported transactional updates can be sent via WhatsApp
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
5. **Group becomes connected** for customer messaging and future broadcast tools

#### Benefits for Your Business
- **Prepared Customer Groups**: Keep customers organized now so future broadcasts are easier to launch
- **Higher Engagement Potential**: WhatsApp messages often have higher open rates than email
- **Direct Ordering**: Customers can order products directly through message links
- **Professional Image**: Branded business messages build customer trust
- **Automated Workflows**: System handles welcome messages for new customers

#### Customer Benefits
- **Future Product Updates**: Broadcasts will help customers hear about products they're interested in
- **Easy Ordering**: Direct links to place orders without navigating websites
- **Personal Service**: Can reply directly to ask questions or request support
- **Future Exclusive Access**: Broadcasts will support new product, discount, and special-offer updates when available

The "connected" status confirms your customer group is ready for WhatsApp messaging. Broadcast marketing is coming soon, making it easier to engage wholesale customers through direct messaging in the future.
        `
      },
      {
        title: "Customer Merge System",
        content: `
### Customer Account Merging

The customer merge functionality helps you consolidate duplicate customer accounts that may have been created with slightly different information.

#### When to Use Customer Merge
- Multiple customer records for the same person
- Customers with similar phone numbers (+44 vs 07 format)
- Different spellings of the same customer name
- Duplicate accounts affecting order history accuracy

#### Two Merge Methods Available

**1. Auto-Detect Duplicates**
- Automatically finds customers with matching phone number patterns
- Identifies customers with similar names and contact information
- Suggests likely duplicate accounts for quick merging

**2. Search & Select Customers**
- Manual search interface for finding specific customers
- Search by name, phone number, or email address
- Select exactly which customers you want to merge
- Useful when duplicates aren't automatically detected

#### How to Merge Customers

1. **Navigate to Customer Groups** in the sidebar
2. **Click "Merge Customers"** button at the top
3. **Choose your merge method**:
   - Select "Auto-Detect Duplicates" for automatic detection
   - Select "Search & Select Customers" for manual selection

**For Auto-Detect Method:**
4. Review the suggested duplicate groups
5. Click "Merge Accounts" on any group you want to consolidate

**For Manual Selection Method:**
4. **Search for customers** using the search bar
5. **Select customers** by clicking the checkboxes
6. **Click "Merge X Customers"** when ready to proceed

#### Primary Account Selection
- The customer with the **most orders** automatically becomes the primary account
- Primary account retains the best available information (name, email, etc.)
- All other customer data is consolidated into the primary account

#### What Happens During Merge
- **All orders** from duplicate accounts transferred to primary account
- **Customer group memberships** consolidated
- **Duplicate records** permanently deleted
- **Primary account** updated with best available contact information
- **Order history** becomes unified under one customer profile

#### After Merge Benefits
- **Unified customer experience**: Customer sees all their orders in one portal
- **Accurate analytics**: Complete customer spending and order history
- **Simplified management**: One customer record instead of multiple duplicates
- **Better communication**: Single contact point for each customer

#### Customer Portal Impact
After merging, when the customer authenticates with their phone number:
- They will see **all orders** from their previously separate accounts
- **Complete order history** is available in one place
- **Total spending** reflects all purchases across merged accounts
- **Authentication works** with any of the previously used phone number formats

#### Important Notes
- **Merging is permanent** - duplicate records are deleted after consolidation
- **Order data is preserved** - no order information is lost during merge
- **Customer contact information** is updated to use the best available data
- **Phone number authentication** continues to work after merge

This system ensures your customers have a seamless experience while helping you maintain clean, accurate customer records.
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
- Messaging history and responses
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
- **Messaging**: Communication history preserved
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
    id: "price-lists",
    title: "Price Lists",
    icon: FileText,
    description: "Create custom pricing for specific customers or customer groups",
    articles: [
      {
        title: "Creating and Managing Price Lists",
        content: `
### What Are Price Lists?

Price Lists let you offer different prices to selected customers or customer groups without changing your main product prices. Use them for trade accounts, loyal customers, regional pricing, contract rates, or limited-time negotiated deals.

#### How to Create a Price List
1. Go to **Customers** in the sidebar
2. Open the **Price Lists** tab
3. Click **New Price List**
4. Add a clear name, optional description, and optional start/end dates
5. Save the price list

#### Adding Products
After creating a price list:
1. Open the price list and choose **Manage**
2. Search for products to add
3. Set either:
   - **Custom price**: a fixed special price for that product
   - **Discount percentage**: a percentage reduction from the normal price
4. Save your changes

Each product can have its own price rule, so one price list can mix fixed prices and percentage discounts.

#### Assigning a Price List
Use the **Assign** tab to choose who receives the price list:
- **Individual customers**: for account-specific pricing
- **Customer groups**: for pricing that applies to every customer in that group

You can also assign a customer to a price list from the customer's detail page.

#### Customer Experience
When an assigned customer signs in to your customer portal:
- They see their special price automatically
- Special prices are shown with a **Your Price** badge
- Cart and checkout use the assigned price list price
- Customers who are not assigned to that price list continue seeing your normal pricing

#### Sharing and Exporting
Each price list includes sharing and export options:
- **Share**: send customers a direct link to their price list
- **Excel**: download the price list as an Excel file for offline sharing or record keeping

#### Best Practices
- Use clear names such as "Gold Retailers 2026" or "North London Trade Pricing"
- Add date ranges for seasonal or temporary negotiated prices
- Review assignments when customers move between groups
- Keep your main product prices as your standard baseline and use price lists only for exceptions
        `
      }
    ]
  },
  {
    id: "whatsapp-broadcasts",
    title: "WhatsApp Messaging & Broadcasts",
    icon: MessageSquare,
    description: "Set up WhatsApp messaging now; broadcasts are coming soon",
    articles: [
      {
        title: "WhatsApp Business API Complete Setup Guide",
        content: `
### WhatsApp Business API vs Twilio WhatsApp

#### Comparison Overview

| Feature | Twilio WhatsApp | WhatsApp Business API |
|---------|----------------|----------------------|
| **Cost per message** | $0.005 - $0.01 | $0.0025 - $0.005 (50% savings) |
| **Setup time** | 5 minutes | 15-30 minutes |
| **Best for volume** | Up to 1,000 messages/month | 1,000+ messages/month |
| **Template messaging** | Basic templates | Advanced templates |
| **Business verification** | Not required | Required |
| **Phone number** | Sandbox number | Your business phone number |

### Option 1: Twilio WhatsApp (Quick Start - Recommended for Testing)

#### Quick Setup Steps
1. **Create Twilio Account**
   - Visit [twilio.com](https://twilio.com) and sign up
   - Verify your email and phone number

2. **Access WhatsApp Sandbox**
   - Go to Console → Messaging → WhatsApp → Sandbox
   - Find your sandbox code (e.g., "join happy-cat")

3. **Test Your Setup**
   - Send "join [your-code]" to +14155238886
   - You'll receive a confirmation message

4. **Get Your Credentials**
   - **Account SID**: Found in Console Dashboard
   - **Auth Token**: Found in Console Dashboard  
   - **Sandbox Phone Number**: +14155238886

5. **Add to Quikpik**
   - Go to Settings → Integrations → WhatsApp
   - Enter your Twilio credentials
   - Test with a sample message

#### Sandbox Limitations
- Only numbers that join your sandbox can receive messages
- Messages must be sent within 24 hours of customer contact
- Template messages are limited

### Option 2: WhatsApp Business API (Production - Recommended for Scale)

#### Requirements
- Business verification through Facebook Business Manager
- Approved business phone number
- Valid business website and documentation
- Compliance with WhatsApp Business Policy

#### Step-by-Step Setup Process

**Step 1: Business Verification**
- Create Facebook Business Manager account
- Submit business verification documents
- Wait for approval (typically 3-5 business days)

**Step 2: WhatsApp Business Account**
- Apply for WhatsApp Business API access
- Submit business use case and messaging templates
- Provide phone number for verification

**Step 3: Phone Number Approval**
- Use your existing business phone number
- Or purchase a new dedicated number
- Complete phone number verification process

**Step 4: Template Approval**
Submit message templates for approval:

**Order Confirmation Template:**
\`\`\`
Hello {{customer_name}}, your order #{{order_number}} has been confirmed! 
Total: £{{total_amount}}
Collection: {{collection_type}}
Thank you for choosing {{business_name}}!
\`\`\`

**Delivery Notification Template:**
\`\`\`
Great news {{customer_name}}! Your order #{{order_number}} is out for delivery. 
Expected delivery: {{delivery_time}}
Track your order: {{tracking_link}}
\`\`\`

**Pickup Ready Template:**
\`\`\`
{{customer_name}}, your order #{{order_number}} is ready for collection at {{business_name}}.
Collection hours: {{business_hours}}
Address: {{business_address}}
\`\`\`

**Step 5: Integration Setup**
- Obtain your WhatsApp Business API credentials
- Configure webhook endpoints
- Set up message routing and handling

#### Production Benefits
- Use your actual business phone number
- Send messages to any WhatsApp number
- Advanced template messaging capabilities
- Better deliverability and branding
- Lower per-message costs at scale

### Environment Variables Setup

**For Twilio WhatsApp:**
\`\`\`
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+14155238886
\`\`\`

**For WhatsApp Business API:**
\`\`\`
WHATSAPP_BUSINESS_PHONE_NUMBER=your_business_number
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
\`\`\`

### Testing Your Setup

**Test Message Flow:**
1. Create a test order in your dashboard
2. Process a payment
3. Verify customer receives WhatsApp notification
4. Check message delivery status
5. Test customer reply handling

### Cost Optimization

**For High Volume (1000+ messages/month):**
- Use WhatsApp Business API for 50% cost savings
- Set up message batching for bulk notifications
- Use template messages for better delivery rates

**For Lower Volume (Under 1000 messages/month):**
- Twilio WhatsApp provides sufficient functionality
- Easier setup and maintenance
- Can upgrade to direct API later

### Compliance and Best Practices

**Message Policy Compliance:**
- Only send messages to customers who opted in
- Respect 24-hour messaging window
- Provide clear opt-out instructions
- Include business identification in messages

**Template Guidelines:**
- Keep messages concise and clear
- Include relevant order information
- Provide customer service contact
- Use personalization tokens appropriately

### Troubleshooting

**Messages Not Delivering:**
- Check phone number format (+44 for UK numbers)
- Verify customer has WhatsApp installed
- Ensure message is within 24-hour window
- Check template approval status

**Template Rejection:**
- Avoid promotional language in transactional templates
- Include clear business purpose
- Remove unnecessary formatting
- Provide specific use case documentation

**Business Verification Delays:**
- Ensure all business documents are current
- Use consistent business name across platforms
- Provide clear business website

### Migration Path
**From Twilio to WhatsApp Business API:**
1. Set up WhatsApp Business API account
2. Get templates approved
3. Configure new integration in parallel
4. Test thoroughly with small group
5. Switch production traffic

### Quick Start Recommendation
- **For immediate testing:** Start with Twilio WhatsApp (5-minute setup)
- **For production use:** Plan for WhatsApp Business API migration within 30 days
- **For high volume:** Go directly to WhatsApp Business API for cost savings
        `
      },
      {
        title: "Broadcasts Coming Soon",
        content: `
### Broadcasts Are Coming Soon

WhatsApp broadcast campaigns are not available yet. You may still see the Broadcast area in the app, but it is currently a coming-soon feature.

#### What You Can Do Now
1. **Organize Customer Groups**: Keep customer lists accurate so they are ready when broadcasts launch
2. **Configure WhatsApp**: Set up WhatsApp messaging for supported customer notifications
3. **Maintain Product Details**: Keep product names, descriptions, prices, and MOQ information current
4. **Prepare Message Ideas**: Draft future stock updates, new arrival notices, and special offer copy offline

#### When Broadcasts Launch
The planned broadcast workflow will help you select products, choose customer groups, add a custom message, and review delivery results.
        `
      },
      {
        title: "Welcome Message Troubleshooting",
        content: `
### Customer Welcome Message System

When you add new customers to your platform, the system automatically sends welcome messages via email and WhatsApp to help them get started with your wholesale portal.

#### How Welcome Messages Work

**Automatic Triggers:**
- New customer creation through Customer Directory
- Customer registration requests (when approved)
- Manual customer addition through Customer Groups

**Message Content Includes:**
- Welcome greeting with customer's name
- Your business name and contact information
- Direct link to your customer portal
- Instructions on how to browse products and place orders
- Professional branding with Quikpik platform signature

#### Email Welcome Messages

**✅ When Email Messages Work:**
- Customer has valid email address
- SendGrid is configured with verified sender
- All email templates load correctly

**❌ Common Email Issues and Solutions:**

**Problem: "403 Forbidden" SendGrid Error**
- **Cause**: Sender email address not verified in SendGrid
- **Solution**: 
  1. Go to SendGrid Dashboard → Settings → Sender Authentication
  2. Add and verify your business email as authenticated sender
  3. System will automatically use verified sender (hello@quikpik.co)
  4. Customer replies will go to your business email

**Problem: Email not received by customer**
- **Cause**: Customer email in spam folder or invalid
- **Solution**: 
  1. Check customer's spam/junk folder
  2. Verify email address is correct
  3. Ask customer to whitelist hello@quikpik.co

**Problem: Welcome email has wrong business information**
- **Cause**: Business profile not completed
- **Solution**: Update Settings → Business Settings with correct information

#### WhatsApp Welcome Messages

**✅ When WhatsApp Messages Work:**
- Customer has valid UK phone number (+44 format)
- Twilio WhatsApp Business API is activated
- WhatsApp number can receive business messages

**❌ Common WhatsApp Issues and Solutions:**

**Problem: "Twilio could not find a Channel" Error (Code 63007)**
- **Cause**: Your Twilio number needs WhatsApp Business API activation
- **Solution**: 
  1. Contact Twilio support to activate WhatsApp Business API
  2. Apply for WhatsApp Business account approval
  3. Your phone number will be enabled for WhatsApp messaging

**Problem: "Invalid phone number" Error (Code 21211)**
- **Cause**: Customer phone number format is incorrect
- **Solution**: 
  1. Ensure phone numbers use international format (+44XXXXXXXXX)
  2. Verify customer's WhatsApp is active on that number
  3. Check phone number doesn't have extra characters

**Problem: Messages sent but customer didn't receive**
- **Cause**: Customer blocked business numbers or doesn't have WhatsApp
- **Solution**: 
  1. Ask customer to check WhatsApp blocked contacts
  2. Verify customer uses WhatsApp on provided number
  3. Try sending test message manually

#### Configuration Status Check

**Email Configuration:**
- SendGrid API Key: Required
- Verified Sender: hello@quikpik.co (must be verified)
- Business Email: Used for customer replies

**WhatsApp Configuration:**
- Twilio Account SID: Required  
- Twilio Auth Token: Required
- Twilio Phone Number: Required
- WhatsApp Business API: Must be activated

#### Testing Welcome Messages

**To test email system:**
1. Add test customer with your email address
2. Check for welcome email delivery
3. Verify business information appears correctly
4. Test reply functionality

**To test WhatsApp system:**
1. Add test customer with your WhatsApp number
2. Check for welcome message delivery
3. Verify portal link works correctly
4. Test customer can reply

#### Message Delivery Status

When adding customers, the system returns delivery status:
- **emailSent: true/false** - Email delivery success
- **whatsappSent: true/false** - WhatsApp delivery success
- **errors: []** - Array of any error messages

#### Best Practices

**For Reliable Email Delivery:**
- Keep business email updated in settings
- Monitor SendGrid dashboard for delivery issues
- Ask customers to whitelist hello@quikpik.co
- Include clear subject lines with your business name

**For Reliable WhatsApp Delivery:**
- Use proper international phone number format
- Verify customer WhatsApp numbers before adding
- Consider WhatsApp Business API upgrade for higher volume
- Include clear business identification in messages

#### Getting Help

**If welcome messages still don't work:**
1. Check Settings → Integrations for configuration status
2. Test with your own email/phone number first  
3. Verify customer contact information is correct
4. Contact support with specific error messages

**API Integration Status:**
- Settings → Integrations shows real-time status
- Green indicators mean services are working
- Red indicators show configuration needed

The welcome message system helps create professional first impressions and guides customers to start ordering from your wholesale platform immediately.
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

### Collection Notification System

When customers place orders for collection/pickup, the platform **automatically handles all notifications**:

#### Customer Notifications (Automatic)
- **Confirmation Email**: Includes order details, collection address, and contact information
- **WhatsApp Message**: Welcome message with business details and pickup instructions (if configured)
- **Order Receipt**: Professional invoice with collection instructions

#### Wholesaler Notifications (Automatic)
- **Order Alert Email**: New order notification with customer details and items to prepare
- **WhatsApp Alert**: Instant notification of new orders (if configured)
- **Order Dashboard**: Real-time order updates in your dashboard

#### Collection Address Information
- **Automatic Display**: Your business address is automatically included in all customer notifications
- **Fallback Message**: If no address is set, shows "Please contact store for address"
- **Business Details**: Customer receives your business name, phone, and email for coordination

#### Order Status Updates
- **Ready for Collection**: Update order status to notify customers when ready
- **Resend Notifications**: Resend confirmation emails with collection details anytime
- **Customer Communication**: Direct contact information shared for easy coordination

#### Setting Up Collection Address
1. Go to **Settings → Business Settings**
2. Add your **Business Address** - this will automatically appear in all collection notifications
3. Ensure your **Business Phone** and **Email** are up to date for customer contact

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
- Product/delivery subtotal, platform fee (4.6% on eligible online card payments), and your revenue
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
1. Customer pays their checkout total through Stripe
2. Customer card checkouts include a customer transaction fee of 5.5% + £0.50
3. Quikpik automatically collects a 4.6% platform fee from the order subtotal on eligible online card orders
4. You receive the subtotal minus the platform fee directly to your bank account
5. Order status updates to "Processing"

#### Account Status
Your payment account has two key states:
- **Account Status**: Verified or Pending
- **Payment Processing**: Enabled or Disabled

#### Revenue Breakdown
- **Platform Fee**: 4.6% to Quikpik for platform services on eligible online card orders
- **Customer Transaction Fee**: 5.5% + £0.50 shown to the customer on card checkout only; it is not your revenue
- **You Keep**: The order subtotal after the 4.6% platform fee
- **Offline / Pay Later Orders**: No platform fee or customer transaction fee is collected unless an online payment is made later

#### Bank Transfers
- Funds are transferred to your bank account automatically
- Transfer timing depends on your country (usually 2-7 business days)
- View transfer history in your Stripe dashboard
        `
      },
      {
        title: "Payment Notification Emails",
        content: `
### Automatic Payment Notifications

Both you and the customer receive email notifications automatically whenever a payment is received via Stripe — whether that's a deposit or a full/balance payment.

#### What the Email Includes
- Amount paid in this transaction
- Cumulative total paid to date
- Outstanding balance remaining (if any)
- A **Paid in Full** or **Partially Paid** status badge
- Order number and a link for reference

#### When Notifications Are Sent
- **Deposit payment received** — both parties notified immediately
- **Balance payment received** — both parties notified, outstanding shown as £0.00 if fully settled
- **Pay Later orders** — no payment notification is sent (there is no Stripe transaction)

#### Filtering Orders by Payment Status
On the Orders page, use the **Paid / Unpaid** dropdown filter to quickly view:
- **Paid** — orders fully settled
- **Unpaid** — orders with no payment received yet
- Combine this with the status filter to find, for example, confirmed-but-unpaid orders outstanding

#### Idempotency
Payment emails include a duplicate-check so that if Stripe sends the same webhook more than once (a normal Stripe behaviour), the notification is only sent once per actual payment event.
        `
      }
    ]
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: Star,
    description: "B2B wholesale seller discovery and marketplace tools",
    articles: [
      {
        title: "Marketplace Overview",
        content: `
### Marketplace Status

Quikpik now supports seller discovery for customers through the customer portal. Customers can find seller stores, browse products where guest browsing is enabled, and request access when they are not yet approved.

#### What It Supports Now
- Customers can discover participating wholesaler stores
- Guests can browse product information where enabled, with prices hidden until approved access
- Customers can request access from sellers before placing orders
- Approved customers can switch between seller stores they are registered with

#### Where to Find It
Use the **Marketplace** page in the sidebar, or go to **/marketplace**, to view marketplace information and updates.

#### What You Can Do Now
- Share your own customer portal link directly with customers
- Keep product names, images, descriptions, MOQ, and stock levels up to date
- Use customer groups and price lists to manage customer-specific selling terms
- Review access requests from customers who discover your store
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

#### Broadcast Analytics (coming soon)
Broadcast performance reporting will become available when broadcast campaigns launch. Planned metrics include:
- **Total Broadcasts**: count of campaigns sent
- **Recipients Reached**: total customers contacted
- **Engagement Rates**: response and conversion rates
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
- Prepare future broadcasts around customer preferences
- Improve customer retention strategies

#### Marketing Effectiveness
- Broadcast performance tracking is coming soon
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
- **Cost**: £0/month
- **Products**: Up to 10 products
- **Features**: 
  - Broadcast tools coming soon
  - Order management
  - Basic analytics
  - Email support

#### Standard Plan
- **Cost**: £19.99/month
- **Products**: Up to 50 products
- **Features**:
  - Broadcast tools coming soon
  - Customer groups
  - Priority order processing
  - Advanced analytics
  - Phone support

#### Premium Plan
- **Cost**: £49.99/month
- **Products**: Unlimited products
- **Features**:
  - Broadcast tools coming soon
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
- Downgrades take effect immediately with pro-rated credit

#### Managing Subscription
- **View Current Plan**: Check your active subscription
- **Usage Monitoring**: Track product limits
- **Payment History**: View past invoices
- **Cancel Anytime**: No long-term contracts

#### Plan Changes
- **Upgrading**: Immediate access to new features
- **Downgrading**: Changes take effect immediately with pro-rated credit
- **Cancellation**: Account remains active until period end

#### Transaction Fees
Regardless of subscription plan:
- **Platform Fee**: 4.6% on eligible online card orders, paid by the wholesaler
- **Customer Transaction Fee**: 5.5% + £0.50 added to customer card checkouts only
- **Payment Processing**: Handled by Stripe
- **Your Revenue**: Order subtotal minus the 4.6% platform fee; the customer transaction fee is not wholesaler revenue
- **Offline / Pay Later Orders**: No platform fee or customer transaction fee is collected unless an online payment is made later
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

The Customer Portal is a dedicated shopping interface where approved customers can browse products, place orders, and make payments. Guests can browse your catalog when guest browsing is enabled, but prices and ordering require customer access.

#### Key Features
- **Simple Customer Access**: Approved customers sign in with SMS verification instead of a password
- **Mobile Responsive**: Perfect experience on phones, tablets, and desktop
- **Secure Payments**: Stripe-powered checkout with card processing
- **Automatic Invoicing**: Professional invoices emailed after purchase
- **Real-time Stock**: Live inventory updates prevent overselling
- **Negotiation System**: Customers can request custom pricing on eligible products

#### How Customers Access Your Portal
1. **Direct Links**: Share your customer portal URL (found in "Preview Store")
2. **WhatsApp Messages**: Share portal links in direct WhatsApp messages; broadcasts are coming soon
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

#### Order Status Badges
Each order shows a combination of badges:
- **Paid** (green) / **Part Paid** (orange) / **Unpaid** (red) — payment status
- **Fulfilled** (blue) / **Ready** (yellow) / **Cancelled** (red) / **Unfulfilled** (grey) — fulfilment status
- **Refunded** (purple) — full refund has been processed (shown alongside "Cancelled")
- **Partially Refunded** (purple) — some items were returned but the order remains active
- **Delivery** / **Collection** — how the order will be fulfilled

> **Dashboard Recent Orders card** shows a single colour-coded badge per order reflecting its overall status: Pending (amber), Confirmed (blue), Processing (purple), Paid (green), Fulfilled (emerald), Cancelled (red), Ready for Collection (orange).

#### Order Details
Each order includes:
- Customer contact information and delivery address
- Product details with quantities and pricing
- Payment information and Stripe transaction ID
- Platform fee calculation (4.6% on eligible online card payments)
- Order timeline with colour-coded status entries
- Payment summary showing subtotal, platform fee, any refunds, and your net amount

#### Order Timeline
The timeline tracks every stage of an order:
- Green dot — completed steps (payment received, ready, fulfilled)
- Orange/amber dot — pending steps (balance outstanding, refund pending)
- Red dot — cancellation
- Purple dot — refund processed to card (with date)
- Amber dot — refund recorded but not yet processed (chose "Later")

#### Payment Summary
The payment summary in each order shows:
- Subtotal and platform fee (4.6% on eligible online card payments)
- A **Refunded** or **Partial Refund** row in purple when a refund has been recorded
- **Your Net Amount** — adjusted to reflect any refunds issued

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
2. **Customer Transaction Fee**: Card checkouts add 5.5% + £0.50 for the customer
3. **Platform Fee**: 4.6% deducted from the order subtotal for Quikpik
4. **Wholesaler Payment**: Subtotal minus the platform fee transferred to your Stripe account
5. **Invoice Generation**: Professional Stripe invoice automatically created and emailed

#### Invoice Features
- **Detailed Line Items**: Shows each product, quantity, and unit price
- **Clear Totals**: Shows product line items, quantities, and the customer checkout total
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
- **Platform Fees**: Automatically calculated on eligible online card payments - no manual action needed
        `
      },
      {
        title: "Quick Quote & Pay Later",
        content: `
### Quick Quote

Quick Quote lets you create orders on behalf of a customer directly from the Orders page — ideal for phone/in-person sales or custom pricing agreements.

#### Creating a Quick Quote
1. Go to **Orders** and click **"Quick Quote"**
2. Select the customer from your registered customer list
3. Add products by searching and clicking — set the quantity for each item
4. Adjust the unit price per item if you're offering custom pricing
5. Choose the payment structure (see below)
6. Click **"Create Quote"**

#### Payment / Deposit Options

| Option | What happens |
|--------|-------------|
| **Pay Later (0%)** | No Stripe payment link generated. Customer receives an SMS confirming the order is placed — payment is arranged offline separately. |
| **25% deposit** | Customer pays 25% now via Stripe. Remaining 75% is due by the balance due date you set. |
| **50% deposit** | Customer pays 50% now via Stripe. Remaining 50% is due by the balance due date you set. |
| **75% deposit** | Customer pays 75% now via Stripe. Remaining 25% is due by the balance due date you set. |
| **100% (full payment)** | Full Stripe payment link sent. No outstanding balance — order is fully paid upfront. |

#### How Deposits Work — Step by Step

1. **You create the quote** — choose the deposit percentage and the balance due date (7, 14, or 30 days from now)
2. **Customer receives an SMS** (and email if provided) with a Stripe link to pay the deposit amount only
3. **Deposit is paid** — the order status updates to "Deposit Paid" and both you and the customer receive a payment confirmation email showing: amount paid, remaining balance, and the due date
4. **Balance is tracked** — visible in the order detail panel under "Payment Summary" with the exact amount outstanding and the due date
5. **Automatic reminders** are sent to the customer before and on the due date (see Payment Reminders below)
6. **Balance is paid** — order moves to "Paid" status and both parties receive a final payment confirmation

#### Balance Due Dates

- Choose **7, 14, or 30 days** at quote creation — the customer sees this date in all reminders
- The balance due date **cannot be changed** after the quote is sent; create a new quote if needed
- The due date is displayed on the order card and in the order detail panel

#### Pay Later (0% Deposit)

- No Stripe payment link is generated — the customer is simply notified the order is placed
- Payment is arranged offline (bank transfer, cash, etc.)
- When payment is received, open the order and manually update the payment status
- No automatic reminders are sent for Pay Later orders

#### Tracking Quote Orders
- Outstanding balances and due dates are visible in each order's payment summary
- The order detail panel shows deposit %, amount paid, remaining balance, and balance due date
        `
      },
      {
        title: "Payment Reminders",
        content: `
### Automatic Payment Reminders

Quikpik automatically contacts customers with outstanding deposit balances — no action needed from you.

#### When Reminders Are Sent

| Timing | Type | Message sent to customer |
|--------|------|--------------------------|
| 3 days before due date | Upcoming reminder | Friendly heads-up with the due date and payment link |
| On the due date | Due today notice | "Payment due today" with payment link |
| 1 day after due date | Overdue notice | Overdue alert with payment link |

Reminders run once daily at **9 AM**. If a due date falls on a weekend or holiday, the reminder still fires at 9 AM that day.

#### What the Customer Receives

Each reminder includes a personalised SMS (and email if the customer's email is on file) containing:
- Their first name
- Your business name
- The order number (e.g. SF-286)
- The items they ordered (e.g. 10x Garri)
- The outstanding amount (e.g. £422.50)
- The balance due date
- A payment link

**Example SMS:**
*Hi Bamidele! Reminder: £422.50 balance due on 7 Mar 2026 for order SF-286 (10x Garri) with Surulere Foods Wholesale. Pay here: https://checkout.stripe.com/...*

#### Payment Links Always Work

Each reminder generates a **brand new Stripe payment link** valid for 7 days — even if the original quote link has long since expired. Customers will always receive a working link regardless of when the quote was created.

#### What Happens When the Customer Pays

- Order status updates automatically to "Paid" (or "Deposit Paid" if only the deposit was paid)
- You receive a payment notification email with the breakdown
- The customer receives a payment confirmation email
- No further reminders are sent once the balance is cleared

#### If a Customer Reports a Broken Link

The previous link may have expired before the next reminder ran. The **next scheduled reminder** (tomorrow at 9 AM at the latest) will include a fresh working link automatically. You can also open the order and resend a quote notification manually from the order detail panel.

#### Pay Later Orders

No reminders are sent for Pay Later (0%) orders — there is no Stripe payment link to send. These are managed manually between you and the customer.
        `
      },
      {
        title: "Refunds & Cancellations",
        content: `
### Cancelling an Order & Processing Refunds

#### How to Cancel an Order
1. Open the order from the Orders page
2. Click **"Cancel Order"** at the bottom of the order details
3. **Select a reason** from the dropdown (required)
4. Add any optional notes for your records

#### Items to Return
- All items default to their full ordered quantity
- **Reduce any quantity** to process a partial return — the remaining items stay on the order
- The **refund amount updates live** as you adjust quantities
- When any item is below its full quantity, a **(partial refund)** label appears next to the amount
- You can also tick **Refund delivery cost** to include the delivery charge in the refund

#### Refund Method
Choose how to process the refund:
- **Original payment method** — Stripe refund sent to the customer's card. Typically takes 5–10 business days to appear on their statement. The exact amount is shown dynamically based on your item selections.
- **Later** — No refund is processed now. The amount is recorded on the order for reference, and you can arrange payment separately.

#### Additional Options
- **Restock inventory** (ticked by default) — Restores stock for all returned items. A "Customer Return" movement entry is logged in each product's stock history. If a second partial return is processed on the same order, the restocked count accumulates correctly (e.g. 3 units + 5 units = 8 units shown in Payment Summary).
- **Send notification** — Sends an SMS and email to the customer confirming the cancellation or partial return.

#### Automatic Itemised Refund Email
When "Send notification" is ticked, the customer automatically receives a detailed itemised email showing:
- A table of every returned item with quantity and unit value
- A delivery refund row (if delivery was included in the refund)
- A "Retained items" section listing any items still on the order (for partial returns)
- Refund status: **Processed** (card refund sent) or **Pending** (later/manual)

The wholesaler also receives a copy of this notification.

#### What Happens After Cancellation

**Full cancellation** (all items at full quantity):
- Order status changes to **Cancelled**
- A purple **Refunded** badge appears alongside the red "Cancelled" badge
- Timeline shows a red "Order Cancelled" entry and a purple/amber refund entry

**Partial return** (some items reduced):
- Order remains active (status unchanged)
- A purple **Partially Refunded** badge appears on the order
- Timeline shows:
  - Purple dot "Partial refund to card: £X" (once Stripe confirms)
  - Amber dot "Partial refund pending: £X" (submitted but awaiting Stripe confirmation, or "Later" chosen)
- Payment summary shows a purple "Partial Refund: −£X" row and adjusted net amount

#### Refund Confirmation States
When you submit a card refund, Stripe doesn't process it instantly — it queues it and then sends back a confirmation a short time later (usually minutes, occasionally a few hours) to say it actually succeeded.

This means refunds go through two stages:
1. **Refund pending Stripe confirmation** (amber badge) — the refund has been submitted to Stripe but not yet confirmed. If Stripe quietly fails the refund after submission, the order won't incorrectly show a confirmed date.
2. **Confirmed** (purple badge) — Stripe has confirmed the money moved. Only at this point is the confirmed date recorded on the order and your net revenue updated.

The date you see on an order is always the moment the refund was confirmed — not just when you pressed the button.

#### Retry Failed Refunds
If a Stripe refund fails (shown in red in the order timeline), use the **Retry Refund** button to re-submit. Once Stripe confirms the retry, the order updates automatically.

#### Refund Timeline
- Stripe refunds appear on the customer's statement within 5–10 business days after Stripe confirmation
- Customers receive an itemised email and SMS confirming the cancellation/refund
- All refund details are logged in the order notes for your audit trail
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
A: Check your subscription plan's product limit. Free plan allows 10 products, Standard allows 50, Premium is unlimited.

**Q: My product images won't upload**
A: Ensure images are under 500KB and max 800x600px. Supported formats: JPG, PNG, GIF.

**Q: Products not appearing in my customer portal**
A: Make sure product status is set to "Active" and you have stock available. Customers can discover seller stores, but product visibility still depends on your store settings, product status, and guest browsing/access rules.

#### WhatsApp Messaging Issues

**Q: Why can't I send WhatsApp broadcasts yet?**
A: Broadcast campaigns are marked as coming soon. Check the **Broadcast** page in the sidebar for launch status. For supported WhatsApp messages, verify your WhatsApp Business API credentials in Settings → WhatsApp Integration and ensure your access token is valid.

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
A: Platform fees are calculated at 4.6% on eligible online card payments when Stripe Connect is set up correctly. Offline, cash, and Pay Later orders have no platform fee or customer transaction fee unless an online card payment is taken later. Verify your Stripe Connect setup is complete.

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

#### All Users
- **Email Support**: Send detailed questions to hello@quikpik.co
- **Documentation**: Use the Help Hub for setup and troubleshooting guidance
- **Setup Guidance**: Ask for help with account setup, product uploads, customer access, and payment configuration
- **Technical Support**: Share the issue details so the support team can investigate and respond during business hours

#### When Contacting Support
Please include:
- Your account name and email
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
  },
  {
    id: "marketplace-registration",
    title: "Customer Access & Registration",
    icon: Users,
    description: "Understanding customer access, per-wholesaler registration, and SMS authentication",
    articles: [
      {
        title: "Customer Registration Requirements",
        content: `
### How Customer Registration Works in Quikpik

#### Multi-Wholesaler Platform Overview
Quikpik supports multiple independent wholesalers, each with their own customer access controls:
- Multiple independent wholesalers run their own stores
- Each wholesaler maintains their own customer database
- Registration is required **per wholesaler** before purchasing

#### Customer Registration Requirements

**Browsing vs Purchasing**:
- ✅ **Guest browsing**: Customers can view your catalog when guest browsing is enabled, but prices and ordering stay locked until approved access
- ❌ **Purchase requires registration**: Customers must be registered with each specific wholesaler

#### Why Per-Wholesaler Registration?
This approach maintains the **B2B wholesale model** because:

1. **Credit Terms**: Wholesalers need to establish individual credit agreements
2. **Business Compliance**: Each wholesaler has their own verification requirements  
3. **Pricing Agreements**: Special pricing tiers and terms are negotiated individually
4. **Relationship Management**: Wholesalers control which businesses they work with
5. **Legal Requirements**: Some products require verified business relationships

#### How Customers Find Your Store

**Discovery Methods**:
1. **Direct Link**: You share your store URL directly with customers
2. **Customer Referrals**: Existing customers recommend your store to others
3. **Seller Discovery**: Customers can use seller selection to find stores and request access

**Customer Journey**:
1. Customer opens your store link
2. Customer can browse your catalog where guest browsing is available, with prices hidden until approved
3. When ready to see prices or purchase, they must be registered in your customer database
4. If not registered, they can request access or contact you to register
5. You approve their registration and add them to customer groups or price lists as needed
6. Customer can then purchase from your store using SMS verification

### Managing Customer Registration

#### Adding New Customers
1. **Go to Customer Groups** in your dashboard
2. **Select appropriate group** for the customer
3. **Click "Add Customer"** 
4. **Enter customer details**:
   - Business name and contact person
   - Phone number (required for SMS authentication)
   - Email address for order confirmations
   - Business address for delivery/invoicing

#### Customer Approval Process
When potential customers contact you for registration:
1. **Verify business credentials** as needed
2. **Discuss terms** (credit limits, payment terms, minimum orders)
3. **Add to appropriate customer group** based on their business type
4. **Notify customer** that registration is complete
5. **Share your store link** for them to start shopping

#### Registration Best Practices
- **Clear Communication**: Let customers know they need registration before first purchase
- **Quick Response**: Approve legitimate business registrations promptly
- **Group Organization**: Organize customers into logical groups (by region, business type, etc.)
- **Terms Documentation**: Keep records of agreed terms and pricing

### Customer Authentication Flow

#### SMS Verification System
Once registered, customers access your store using:
1. **Phone Number Entry**: Their full registered phone number, including country code when needed
2. **SMS Code Verification**: 6-digit code sent via SMS (5-minute expiry)
3. **Session Creation**: Persistent session allows browsing multiple stores
4. **Cross-Store Access**: Session works across different wholesaler stores they're registered with

#### Session Management
- **Single Authentication**: Once verified, customers can access all their registered stores
- **Session Persistence**: Lasts for several hours/days depending on browser settings
- **No Re-verification**: Customers don't need new SMS codes when switching between stores
- **Secure Isolation**: Customers only see stores where they're registered

### Access Management Benefits

#### For Wholesalers:
- **Relationship Control**: Maintain approval process for new customers
- **Data Isolation**: Your customer data remains private and separate
- **Customer-Specific Pricing**: Use customer groups and price lists for agreed terms
- **Secure Ordering**: Only approved customers can place orders

#### For Customers:
- **Simple Sign-In**: Use SMS verification instead of a password
- **Registered Store Access**: Access stores where they have been approved
- **Special Pricing**: See assigned price list prices where applicable
- **Trusted Platform**: Secure payment processing and order management

### Common Questions

**Q: Can customers see other wholesalers' customer lists?**
A: No, customer data is completely isolated between wholesalers.

**Q: Can customers place orders without registration?**
A: No, registration with each wholesaler is required before purchasing.

**Q: How do customers know they need registration?**
A: When unregistered customers try to purchase, they see clear messaging to request access or contact the wholesaler.

**Q: Can I set different terms for different customers?**
A: Yes, organize customers into groups with different pricing or terms as needed.

**Q: What happens if a customer is registered with multiple wholesalers?**
A: They can access all their registered stores with a single SMS authentication session.

This system keeps customer access simple while preserving traditional B2B relationship management.
        `
      }
    ]
  },
  {
    id: "finance-payouts",
    title: "Finance & Payouts",
    icon: Banknote,
    description: "Track your Stripe payouts and reconcile payments with orders",
    articles: [
      {
        title: "Understanding the Finance Page",
        content: `
### What Is the Finance Page?

The **Finance** page (Finance in the sidebar) shows all the money Stripe sends to your bank account — your payouts. It is your single place to check what you've been paid and what is on its way.

#### "To Be Paid" Balance

At the top of the page you'll see a **To be paid** figure. This is money that has been collected from customers but not yet deposited into your bank account. Stripe typically transfers this within **2–7 business days** depending on your account settings and country.

#### Payout Transactions Table

Below the balance is a list of every payout Stripe has sent (or scheduled to send) to your bank. Each row shows:
- **Payout date** — the date funds arrive in your bank account
- **Status** — the current state of that payout (see below)
- **Amount** — the total deposited in that single bank transfer

#### Stripe Not Connected

If you haven't connected a Stripe account yet, the page shows an orange prompt with a button to go to **Settings** and complete the setup. You must have a verified Stripe Connect account to receive payouts and see them here.
        `
      },
      {
        title: "Payout Statuses",
        content: `
### What Each Payout Status Means

| Status | What It Means |
|--------|--------------|
| **Scheduled** | Stripe has queued this payout; funds will leave your Stripe balance shortly |
| **In Transit** | Funds are on their way to your bank — your bank hasn't confirmed receipt yet |
| **Deposited** | Funds have arrived in your bank account |
| **Failed** | The payout could not be completed — check your bank account details in Settings → Payments |
| **Cancelled** | The payout was cancelled before it was sent |

Most payouts move from **Scheduled → In Transit → Deposited** within a few business days. If a payout is stuck on **Failed**, check that your bank account details in your Stripe dashboard are correct.
        `
      },
      {
        title: "Matching Payouts to Orders",
        content: `
### Seeing Which Orders Are in a Payout

Click any row in the payout table to open the **Payout breakdown** panel on the right. This shows every individual transaction that makes up that payout:

- **Order number** — the Quikpik order reference linked to that transaction
- **Customer name** — who placed the order
- **Order date** — when the order was created
- **Amount** — the transaction amount included in this payout

#### How the Amount Is Calculated

The amount shown per transaction is what you actually received — after Quikpik's **4.6% platform fee** has been deducted from the order subtotal. For example, if the order subtotal is £100, your share is approximately £95.40. Customer transaction fees are separate from your revenue.

#### Older Transactions Without an Order Link

A small number of older transactions may appear without an order number or customer name. This happens for payments processed before payout-to-order tracking was introduced. All newer orders are matched automatically.

#### Offline (Pay Later) Orders

Pay Later and cash/bank-transfer orders are not processed through Stripe, so they will never appear in the Finance page payout list. Payouts here only cover card payments made via Stripe.
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

  const inlineFormat = (text: string) => {
    const boldParts = text.split(/\*\*/);
    const nodes: ReactNode[] = [];
    boldParts.forEach((boldPart, bi) => {
      if (bi % 2 === 1) {
        nodes.push(<strong key={`b${bi}`} className="font-semibold text-black">{boldPart}</strong>);
      } else {
        const codeParts = boldPart.split(/`/);
        codeParts.forEach((codePart, ci) => {
          if (ci % 2 === 1) {
            nodes.push(<code key={`b${bi}c${ci}`} className="bg-gray-100 text-black text-xs font-mono px-1 py-0.5 rounded">{codePart}</code>);
          } else if (codePart) {
            nodes.push(codePart);
          }
        });
      }
    });
    return nodes;
  };

  const renderContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-semibold text-black mt-6 mb-3">{inlineFormat(line.replace('### ', ''))}</h3>;
      } else if (line.startsWith('#### ')) {
        return <h4 key={index} className="text-base font-medium text-black mt-4 mb-2">{inlineFormat(line.replace('#### ', ''))}</h4>;
      } else if (line.startsWith('- ')) {
        return <li key={index} className="ml-4 text-black mb-1">{inlineFormat(line.replace(/^- /, ''))}</li>;
      } else if (line.trim().match(/^\d+\./)) {
        return <li key={index} className="ml-4 text-black list-decimal mb-1">{inlineFormat(line.trim().replace(/^\d+\.\s*/, ''))}</li>;
      } else if (line.includes('[developers.facebook.com]')) {
        return (
          <p key={index} className="text-black mb-2">
            {line.replace('[developers.facebook.com](https://developers.facebook.com)', '')}
            <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
              developers.facebook.com
            </a>
          </p>
        );
      } else if (line.trim().startsWith('|')) {
        if (line.includes('---')) return null;
        const cells = line.split('|').filter(c => c.trim() !== '');
        return (
          <div key={index} className="flex gap-3 text-sm text-black border-b border-gray-200 py-1.5">
            {cells.map((cell, ci) => (
              <span key={ci} className="flex-1">{inlineFormat(cell.trim())}</span>
            ))}
          </div>
        );
      } else if (line.trim() === '') {
        return <br key={index} />;
      } else {
        return <p key={index} className="text-black mb-2">{inlineFormat(line)}</p>;
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-black">Help Hub</h1>
          <p className="text-black mt-1">Comprehensive guides and documentation for all Quikpik Merchant features</p>
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
                          ? "bg-blue-50 text-blue-700 border-blue-500"
                          : "text-black hover:bg-gray-50 border-transparent"
                      }`}
                      onClick={() => setSelectedSection(section.id)}
                    >
                      <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{section.title}</div>
                        {section.articles.length > 0 && (
                          <div className="text-xs text-black mt-1">
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
                    <p className="text-black mt-1">{currentSection.description}</p>
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
                      <h3 className="font-medium text-black">{article.title}</h3>
                      {expandedArticles[article.title] ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    {expandedArticles[article.title] && (
                      <div className="px-4 pb-4 border-t bg-white">
                        <div className="pt-4 max-w-none">
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
                <p className="text-gray-800 dark:text-gray-200">
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