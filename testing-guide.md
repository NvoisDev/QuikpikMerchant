# Quikpik Platform Manual Testing Guide

## Authentication & Dashboard Testing

### 1. Login & Dashboard Verification
- [ ] Google OAuth login works correctly
- [ ] Dashboard loads without infinite loading spinner
- [ ] Analytics cards show real data (not hardcoded percentages)
- [ ] Revenue change shows calculated percentage (not "+12% from last month")
- [ ] Orders change shows calculated percentage
- [ ] Active Products card shows stock alert status instead of "+3 new this week"
- [ ] WhatsApp Reach shows actual broadcast data

### 2. Chart Functionality Testing
- [ ] Charts display data aligned with DateRangePicker selection
- [ ] "Yesterday" selection shows hourly data (0:00, 4:00, 8:00, etc.)
- [ ] "Last 7 days" selection shows daily data (Jul 3, Jul 4, etc.)
- [ ] "Last 30 days" selection shows weekly data (Week 1, Week 2, etc.)
- [ ] Chart tooltips display correct currency formatting
- [ ] Sales Performance and Order Volume charts use the same data range

## Product Management Testing

### 3. Product CRUD Operations
- [ ] Add new product with all fields (name, price, stock, MOQ, category)
- [ ] Edit existing product (verify edit count tracking)
- [ ] Duplicate product functionality
- [ ] Product status changes (Active/Inactive/Out of Stock)
- [ ] Product image upload and display
- [ ] Promotional pricing with strike-through display

### 4. Product Validation
- [ ] Weight and shipping information saves correctly
- [ ] Currency defaults to user's preferred currency
- [ ] MOQ validation works properly
- [ ] Stock level validation
- [ ] Price format validation

## Customer Groups & Broadcasting

### 5. Customer Group Management
- [ ] Create new customer group
- [ ] Add customers to groups with phone number formatting
- [ ] Edit customer information
- [ ] Delete customers from groups
- [ ] View customer group member counts

### 6. WhatsApp Broadcasting
- [ ] Single product broadcasts with proper formatting
- [ ] Multi-product campaigns
- [ ] Message preview shows correct product details
- [ ] Currency symbols display correctly (£ for GBP)
- [ ] Phone numbers format to international standard (+447...)
- [ ] Negotiation-enabled products show pricing information

## Order Management Testing

### 7. Order Processing
- [ ] View orders list with proper status indicators
- [ ] Order detail modal shows complete information
- [ ] Order status updates work correctly
- [ ] Email confirmations send properly
- [ ] Order timeline displays correctly

### 8. Customer Portal Testing
- [ ] Access customer portal via `/customer/{wholesaler-id}`
- [ ] Featured product displays correctly
- [ ] Browse all products functionality
- [ ] Add products to cart with quantity validation
- [ ] MOQ validation in cart
- [ ] Promotional pricing displays with strike-through

### 9. Checkout & Payment
- [ ] Customer information form validation
- [ ] Shipping options (Pickup vs Delivery)
- [ ] Stripe payment processing
- [ ] 5% platform fee calculation
- [ ] Payment success and order creation
- [ ] Automatic invoice generation

## Subscription & Financial Testing

### 10. Subscription System
- [ ] Free tier limits enforced (3 products, 3 edits)
- [ ] Standard tier limits (10 products, unlimited edits)
- [ ] Premium tier features (unlimited products, marketplace access)
- [ ] Upgrade prompts when limits reached
- [ ] Subscription status display

### 11. Financial Analytics
- [ ] Revenue tracking with real calculations
- [ ] Month-over-month growth percentages
- [ ] Platform fee collection (5% of sales)
- [ ] Stripe invoice generation
- [ ] Financial dashboard accuracy

## Shipping & Logistics

### 12. Shipping Integration
- [ ] Parcel2Go API integration works
- [ ] Google Places address autocomplete
- [ ] Shipping quote generation
- [ ] Multiple carrier options display
- [ ] Shipping cost calculations
- [ ] Customer shipping choice (pickup vs delivery)

## Stock Management

### 13. Stock Alerts
- [ ] Low stock threshold settings
- [ ] Automatic alert generation
- [ ] Stock alert count in navigation
- [ ] Alert resolution functionality
- [ ] Real-time stock level monitoring

## Error Handling & Performance

### 14. Error Scenarios
- [ ] Form validation errors display properly
- [ ] API error handling with user-friendly messages
- [ ] Loading states during data fetching
- [ ] Empty states when no data available
- [ ] Network error recovery

### 15. Performance Verification
- [ ] Page load times under 3 seconds
- [ ] Smooth transitions between pages
- [ ] Responsive design on mobile devices
- [ ] Chart rendering performance
- [ ] Query caching effectiveness

## Integration Testing

### 16. End-to-End Workflows
- [ ] Complete wholesaler onboarding flow
- [ ] Product creation → broadcast → customer order → payment
- [ ] Customer discovery → purchase → fulfillment
- [ ] Team member invitation and access
- [ ] Business settings updates

### 17. Cross-Platform Testing
- [ ] Desktop browser functionality
- [ ] Mobile responsiveness
- [ ] Tablet display optimization
- [ ] Different screen resolutions

## Security & Privacy

### 18. Security Verification
- [ ] Authentication required for protected routes
- [ ] Session management works correctly
- [ ] Data isolation between wholesalers
- [ ] Secure payment processing
- [ ] Environment variables protection

## Specific Fixes Verification

### 19. Recent Bug Fixes
- [ ] ✅ "parcels is not defined" error resolved
- [ ] ✅ Hardcoded analytics percentages replaced with calculations
- [ ] ✅ Chart data aligns with DateRangePicker selection
- [ ] ✅ Stock alerts display instead of hardcoded text
- [ ] ✅ Application loads without infinite spinner
- [ ] ✅ Real month-over-month calculations working

---

## Test Results Summary

**Passed Tests:** ___/19 sections
**Failed Tests:** ___/19 sections
**Critical Issues:** _____________
**Minor Issues:** _______________

**Overall Status:** ⚠️ Needs Testing / ✅ All Tests Passed / ❌ Critical Issues Found

---

*Last Updated: July 10, 2025*
*Tested By: _______________*
*Platform Version: Production*