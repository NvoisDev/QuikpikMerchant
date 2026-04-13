import type { Express } from "express";
import type { SharedRouteContext } from "./shared";

export function registerSystemRoutes(app: Express, ctx: SharedRouteContext): void {
  const {
    db, storage, eq, and, or, desc, asc, inArray, gt, lt, gte, lte, ne, isNull, like, sql, count, sum,
    users, orders, orderItems, products, customerGroups, customerGroupMembers,
    smsVerificationCodes, customerRegistrationRequests, campaignOrders, subscriptionPlans,
    userSubscriptions, stockMovements, orderCancellationRequests,
    wholesalerCustomerRelationships, teamMembers,
    insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema,
    insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema,
    insertSMSVerificationCodeSchema, insertCustomerRegistrationRequestSchema,
    requireAuth, isAuthenticated, z,
    stripe, openai, sgMail, twilio,
    requireNotViewer, enforceNewPlanLimits, getProjectedDowngradeImpact,
    orderPhotoUpload, sendCustomerInvoiceEmail, buildInvoicePdf, sendRefundReceipt,
    createStripeRefundReceipt, generateOrderNotificationMessage, isInvitationExpired,
    sendWelcomeEmail, passwordResetAttempts, ADMIN_EMAILS, geocodePostcode,
    PLAN_ENFORCEMENT_LIMITS, getProductLimit, getCustomerGroupLimit, getBroadcastLimit,
    getCustomersPerGroupLimit, getTeamMemberLimit,
    generateOrderNumber, formatNumber, parseCustomerName, generateStockUpdateMessage,
    sendTeamInvitationEmail, refundAcrossPaymentIntents, parseAddressForEmail, extractSessionId,
    getCurrencySymbol, formatPhoneToInternational, validatePhoneNumber,
    InventoryCalculator, PreciseShippingCalculator, healthCheck, parcel2goService,
    whatsAppBusinessService, SubscriptionService, requireFeatureAccess,
    requireProductLimits, requireBroadcastLimits, requireTeamMemberLimits, getUserPlanLimits,
    ReliableSMSService, sendSMS, sendEmail,
    generateResetToken, createResetExpiration, sendPasswordResetEmail, hashResetToken,
    createEmailVerification, verifyEmailCode, validatePassword, hashPassword, verifyPassword,
    getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser,
    generateProductDescription, generateProductImage, generatePersonalizedTagline,
    generateCampaignSuggestions, optimizeMessageTiming,
    generateWholesalerOrderNotificationEmail, generateReadyForCollectionEmail,
    wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, emailDivider,
    getEmailLogoUrl, buildItemisedRefundEmail, generateDowngradeScheduledEmail,
    generateDowngradeEffectiveEmail, sendWelcomeMessages,
    orderNotificationService, quickOrderService, multiWholesalerService,
    getEmailDeliveryAddress, queryOptimizer, queryCache, performanceMiddleware,
    multer, sharp, compression, cookieParser,
  } = ctx;

  // GET /api/health
  app.get('/api/health', healthCheck);

  // GET /api/logo/:wholesalerId
  app.get('/api/logo/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const result = await db.select({ logoUrl: users.logoUrl, logoType: users.logoType }).from(users).where(eq(users.id, wholesalerId)).limit(1);
      if (!result.length || !result[0].logoUrl) return res.status(404).end();
      const { logoUrl, logoType } = result[0];
      if (logoType === 'custom' && logoUrl.startsWith('data:')) {
        const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return res.status(400).end();
        const [, mimeType, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
      if (logoUrl.startsWith('http')) return res.redirect(logoUrl);
      return res.status(404).end();
    } catch (error) {
      console.error('Error serving logo:', error);
      res.status(500).end();
    }
  });

  // POST /api/logo-upload-url
  app.post('/api/logo-upload-url', async (req, res) => {
    try {
      console.log('🔧 Logo upload URL request (bypass enabled for testing)');
      
      // Check if object storage is configured
      if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
        console.error('❌ Object storage not configured - PUBLIC_OBJECT_SEARCH_PATHS missing');
        return res.status(500).json({ 
          error: 'Object storage not configured',
          details: 'PUBLIC_OBJECT_SEARCH_PATHS environment variable not set'
        });
      }
      
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      console.log('✅ Logo upload URL generated successfully:', uploadURL ? 'URL received' : 'No URL');
      res.json({ uploadURL });
      
    } catch (error) {
      console.error('❌ Error getting upload URL:', error);
      console.error('❌ Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      res.status(500).json({ 
        error: 'Failed to get upload URL',
        details: error.message 
      });
    }
  });

  // POST /api/update-logo-url
  app.post('/api/update-logo-url', requireAuth, async (req, res) => {
    try {
      console.log('🔧 Direct logo URL update request from authenticated user:', req.user?.email);
      const { logoUrl } = req.body;
      
      if (!logoUrl || typeof logoUrl !== 'string') {
        return res.status(400).json({ error: 'Valid logo URL required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: logoUrl,
        logoType: 'custom'
      });
      
      console.log('✅ Logo URL updated successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo URL updated successfully',
        logoUrl: updatedUser.logoUrl 
      });
      
    } catch (error) {
      console.error('❌ Error updating logo URL:', error);
      res.status(500).json({ error: 'Failed to update logo URL' });
    }
  });

  // POST /api/upload-logo-base64
  app.post('/api/upload-logo-base64', requireAuth, async (req, res) => {
    try {
      console.log('🔧 Base64 logo upload request from authenticated user:', req.user?.email);
      const { imageData, fileName, fileType } = req.body;
      
      if (!imageData || !fileType) {
        return res.status(400).json({ error: 'Image data and file type required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Convert base64 to data URL format
      const dataUrl = `data:${fileType};base64,${imageData}`;
      
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: dataUrl,
        logoType: 'custom'
      });
      
      console.log('✅ Base64 logo updated successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo uploaded successfully',
        logoUrl: dataUrl 
      });
      
    } catch (error) {
      console.error('❌ Error uploading base64 logo:', error);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  });

  // POST /api/clear-logo
  app.post('/api/clear-logo', requireAuth, async (req, res) => {
    try {
      console.log('🧹 Logo clear request from authenticated user:', req.user?.email);
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Clear the logo settings for the authenticated user
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: null,
        logoType: 'business' // Reset to business initials
      });
      
      console.log('✅ Logo cleared successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo cleared successfully',
        logoType: updatedUser.logoType 
      });
    } catch (error) {
      console.error('🧹 Error clearing logo:', error);
      res.status(500).json({ error: 'Failed to clear logo' });
    }
  });

  // GET /api/performance
  app.get("/api/performance", (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    res.json({
      queryStats: queryOptimizer.getQueryStats(),
      slowQueries: queryOptimizer.getSlowQueries(),
      cacheStats: queryCache.getStats(),
      responseCache: performanceMiddleware.getCacheStats()
    });
  });

  // GET /objects/:objectPath(*)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // GET /api/shipping/quotes
  app.get('/api/shipping/quotes', requireAuth, async (req: any, res) => {
    try {
      const { 
        collectionPostcode, 
        deliveryPostcode, 
        weight, 
        length, 
        width, 
        height, 
        value,
        collectionCountry = 'GBR',
        deliveryCountry = 'GBR'
      } = req.query;

      if (!collectionPostcode || !deliveryPostcode || !weight || !length || !width || !height || !value) {
        return res.status(400).json({ 
          message: "Missing required parameters: collectionPostcode, deliveryPostcode, weight, length, width, height, value" 
        });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
        organisation: user.businessName || '',
        email: user.email,
        phone: user.businessPhone || user.phoneNumber || '',
        property: '1', // Default - could be enhanced with full address
        street: user.businessAddress || 'Business Address',
        town: 'City',
        postcode: collectionPostcode as string,
        countryIsoCode: collectionCountry as string
      };

      // Build delivery address (basic - for quotes we only need postcode)
      const deliveryAddress = {
        contactName: 'Customer',
        property: '1',
        street: 'Customer Address',
        town: 'City',
        postcode: deliveryPostcode as string,
        countryIsoCode: deliveryCountry as string
      };

      const quoteRequest = {
        collectionAddress,
        deliveryAddress,
        parcels: [{
          weight: parseFloat(weight as string),
          length: parseFloat(length as string),
          width: parseFloat(width as string),
          height: parseFloat(height as string),
          value: parseFloat(value as string)
        }]
      };

      const quotes = await parcel2goService.getQuotes(quoteRequest);
      res.json({ quotes });
    } catch (error: any) {
      console.error("Error getting shipping quotes:", error);
      
      // Return demo quotes when Parcel2Go API is unavailable
      const demoQuotes = [
        {
          serviceId: 'demo-royal-mail-48',
          serviceName: 'Royal Mail 48',
          carrierName: 'Royal Mail',
          price: 5.95,
          priceExVat: 4.96,
          vat: 0.99,
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: 'Standard delivery service with tracking'
        },
        {
          serviceId: 'demo-dpd-next-day',
          serviceName: 'DPD Next Day',
          carrierName: 'DPD',
          price: 8.50,
          priceExVat: 7.08,
          vat: 1.42,
          transitTime: '1 business day',
          collectionType: 'pickup',
          deliveryType: 'express',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: 'Next day delivery with SMS notifications'
        },
        {
          serviceId: 'demo-evri-standard',
          serviceName: 'Evri Standard',
          carrierName: 'Evri',
          price: 4.25,
          priceExVat: 3.54,
          vat: 0.71,
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: 'Cost-effective delivery option'
        }
      ];
      
      console.log("📦 Parcel2Go API unavailable, returning demo quotes");
      res.json({ quotes: demoQuotes, demoMode: true });
    }
  });

  // POST /api/shipping/quotes
  app.post('/api/shipping/quotes', async (req: any, res) => {
    // Add auth debug for customer portal usage
    console.log('🔍 Auth Debug:', {
      sessionExists: !!req.session,
      sessionUser: req.session?.user ? 'exists' : 'missing',
      sessionUserId: req.session?.userId || 'missing',
      isAuthenticated: !!(req.session?.user?.id || req.session?.userId || req.user),
      headers: req.headers.cookie ? 'has_cookies' : 'no_cookies'
    });
    
    // Allow both authenticated users and customer portal access
    if (!req.session?.user?.id && !req.session?.userId && !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { collectionAddress, deliveryAddress, parcels } = req.body;
    
    try {
      console.log("📦 POST: Getting shipping quotes:", { collectionAddress, deliveryAddress, parcels });
      
      // Check if we have valid addresses
      if (!collectionAddress || !deliveryAddress || !parcels) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["collectionAddress", "deliveryAddress", "parcels"] 
        });
      }

      // Configure Parcel2Go service with credentials - try live API first
      if (process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET) {
        parcel2goService.setCredentials({
          clientId: process.env.PARCEL2GO_CLIENT_ID,
          clientSecret: process.env.PARCEL2GO_CLIENT_SECRET,
          environment: 'live' // Use live API as sandbox seems inaccessible
        });
      }
      
      // Try to get real quotes first
      try {
        const quotes = await parcel2goService.getQuotes({
          collectionAddress,
          deliveryAddress,
          parcels
        });
        
        console.log("📦 Got real quotes:", quotes.length, "services");
        res.json({ quotes, demoMode: false });
      } catch (apiError) {
        console.log("📦 Parcel2Go API unavailable, falling back to demo quotes");
        throw apiError; // Fall through to demo quotes
      }
    } catch (error: any) {
      console.error("Error getting shipping quotes:", error.message);
      
      // Calculate weight-based pricing for more realistic demo quotes
      const totalWeight = parcels.reduce((sum, parcel) => sum + parcel.weight, 0);
      const basePrice = Math.max(3.95, totalWeight * 0.85); // Minimum £3.95, then £0.85 per kg
      
      const demoQuotes = [
        {
          serviceId: 'demo-royal-mail-48',
          serviceName: 'Royal Mail 48',
          carrierName: 'Royal Mail',
          price: parseFloat((basePrice * 1.2).toFixed(2)),
          priceExVat: parseFloat((basePrice).toFixed(2)),
          vat: parseFloat((basePrice * 0.2).toFixed(2)),
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Standard delivery for ${totalWeight}kg package with tracking`
        },
        {
          serviceId: 'demo-dpd-next-day',
          serviceName: 'DPD Next Day',
          carrierName: 'DPD',
          price: parseFloat((basePrice * 1.8).toFixed(2)),
          priceExVat: parseFloat((basePrice * 1.5).toFixed(2)),
          vat: parseFloat((basePrice * 0.3).toFixed(2)),
          transitTime: '1 business day',
          collectionType: 'pickup',
          deliveryType: 'express',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Next day delivery for ${totalWeight}kg package with SMS notifications`
        },
        {
          serviceId: 'demo-evri-standard',
          serviceName: 'Evri Standard',
          carrierName: 'Evri',
          price: parseFloat((basePrice * 0.9).toFixed(2)),
          priceExVat: parseFloat((basePrice * 0.75).toFixed(2)),
          vat: parseFloat((basePrice * 0.15).toFixed(2)),
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Cost-effective delivery for ${totalWeight}kg package`
        }
      ];
      
      // Add service recommendations and precise calculation info
      const recommendations = PreciseShippingCalculator.getServiceRecommendations(totalWeight);
      
      const preciseCalculation = req.body.cartItems && req.body.cartItems.length > 0;
      console.log(`📦 Returning enhanced demo quotes for ${totalWeight}kg package (${preciseCalculation ? 'precise' : 'estimated'} calculation)`);
      res.json({ 
        quotes: demoQuotes, 
        demoMode: true, 
        preciseCalculation,
        totalWeight,
        recommendations
      });
    }
  });

  // POST /api/customer/shipping/quotes
  app.post('/api/customer/shipping/quotes', async (req: any, res) => {
    try {
      const { collectionAddress, deliveryAddress, parcels, cartItems } = req.body;
      
      console.log("📦 CUSTOMER PORTAL: Getting shipping quotes");
      console.log("Request data:", { collectionAddress, deliveryAddress, parcels: parcels?.length, cartItems: cartItems?.length });

      // Check if we have valid addresses
      if (!collectionAddress || !deliveryAddress || !parcels) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["collectionAddress", "deliveryAddress", "parcels"] 
        });
      }

      // Calculate weight-based pricing for demo quotes
      const totalWeight = parcels.reduce((sum, parcel) => sum + (parcel.weight || 1), 0);
      const basePrice = Math.max(3.95, totalWeight * 0.85); // Minimum £3.95, then £0.85 per kg
      
      const demoQuotes = [
        {
          serviceId: 'demo-royal-mail-48',
          serviceName: 'Royal Mail 48',
          carrierName: 'Royal Mail',
          price: parseFloat((basePrice * 1.2).toFixed(2)),
          priceExVat: parseFloat((basePrice).toFixed(2)),
          vat: parseFloat((basePrice * 0.2).toFixed(2)),
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Standard delivery for ${totalWeight}kg package with tracking`
        },
        {
          serviceId: 'demo-dpd-next-day',
          serviceName: 'DPD Next Day',
          carrierName: 'DPD',
          price: parseFloat((basePrice * 1.8).toFixed(2)),
          priceExVat: parseFloat((basePrice * 1.5).toFixed(2)),
          vat: parseFloat((basePrice * 0.3).toFixed(2)),
          transitTime: '1 business day',
          collectionType: 'pickup',
          deliveryType: 'express',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Next day delivery for ${totalWeight}kg package with SMS notifications`
        },
        {
          serviceId: 'demo-evri-standard',
          serviceName: 'Evri Standard',
          carrierName: 'Evri',
          price: parseFloat((basePrice * 0.9).toFixed(2)),
          priceExVat: parseFloat((basePrice * 0.75).toFixed(2)),
          vat: parseFloat((basePrice * 0.15).toFixed(2)),
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Cost-effective delivery for ${totalWeight}kg package`
        }
      ];
      
      console.log(`📦 Returning customer portal demo quotes for ${totalWeight}kg package`);
      res.json({ 
        quotes: demoQuotes, 
        demoMode: true, 
        totalWeight
      });
    } catch (error: any) {
      console.error("Error getting customer shipping quotes:", error.message);
      res.status(500).json({ error: "Failed to get shipping quotes" });
    }
  });

  // GET /api/shipping/drop-shops
  app.get('/api/shipping/drop-shops', requireAuth, async (req: any, res) => {
    try {
      const { postcode, country = 'GBR' } = req.query;

      if (!postcode) {
        return res.status(400).json({ message: "Postcode is required" });
      }

      const dropShops = await parcel2goService.getDropShops(postcode as string, country as string);
      res.json({ dropShops });
    } catch (error: any) {
      console.error("Error getting drop shops:", error);
      res.status(500).json({ message: "Failed to get drop shops", error: error.message });
    }
  });

  // GET /api/shipping/countries
  app.get('/api/shipping/countries', requireAuth, async (req: any, res) => {
    try {
      const countries = await parcel2goService.getCountries();
      res.json({ countries });
    } catch (error: any) {
      console.error("Error getting countries:", error);
      res.status(500).json({ message: "Failed to get countries", error: error.message });
    }
  });

  // GET /api/shipping/services
  app.get('/api/shipping/services', requireAuth, async (req: any, res) => {
    try {
      const services = await parcel2goService.getServices();
      res.json({ services });
    } catch (error: any) {
      console.error("Error getting services:", error);
      res.status(500).json({ message: "Failed to get services", error: error.message });
    }
  });

  // GET /api/config/google-places-key
  app.get('/api/config/google-places-key', (req, res) => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      res.json({ apiKey });
    } else {
      res.status(404).json({ error: 'Google Places API key not configured' });
    }
  });

  // POST /api/shipping/create-order
  app.post('/api/shipping/create-order', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { 
        orderId, 
        service, 
        customerDetails, 
        deliveryAddress,
        parcels,
        collectionDate
      } = req.body;

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
        organisation: user.businessName || '',
        email: user.email,
        phone: user.businessPhone || user.phoneNumber || '',
        property: user.businessAddress?.split(',')[0] || '1',
        street: user.businessAddress?.split(',')[1] || 'Business Street',
        town: user.businessAddress?.split(',')[2] || 'City',
        postcode: (user as any).businessPostcode || 'SW1A 1AA',
        countryIsoCode: 'GBR'
      };

      const orderRequest = {
        Items: [{
          Id: `quikpik-order-${orderId}`,
          CollectionDate: collectionDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          Service: service,
          Parcels: parcels.map((parcel: any, index: number) => ({
            Id: `parcel-${index}`,
            Height: parcel.height,
            Length: parcel.length,
            Width: parcel.width,
            Weight: parcel.weight,
            EstimatedValue: parcel.value,
            DeliveryAddress: {
              contactName: customerDetails.name,
              email: customerDetails.email,
              phone: customerDetails.phone,
              property: deliveryAddress.property,
              street: deliveryAddress.street,
              town: deliveryAddress.town,
              county: deliveryAddress.county || '',
              postcode: deliveryAddress.postcode,
              countryIsoCode: deliveryAddress.countryIsoCode || 'GBR'
            },
            ContentsSummary: parcel.contents || 'Wholesale products'
          })),
          CollectionAddress: collectionAddress
        }],
        CustomerDetails: {
          Email: customerDetails.email,
          Forename: customerDetails.firstName || customerDetails.name.split(' ')[0],
          Surname: customerDetails.lastName || customerDetails.name.split(' ').slice(1).join(' ')
        }
      };

      const shippingOrder = await parcel2goService.createOrder(orderRequest);
      
      // Update the order in our database with shipping information
      await storage.updateOrder(orderId, {
        shippingOrderId: shippingOrder.OrderId,
        shippingHash: shippingOrder.Hash,
        shippingTotal: shippingOrder.TotalPrice.toString(),
        shippingStatus: 'created'
      });

      res.json({ 
        success: true, 
        shippingOrder,
        paymentLinks: shippingOrder.Links
      });
    } catch (error: any) {
      console.error("Error creating shipping order:", error);
      res.status(500).json({ message: "Failed to create shipping order", error: error.message });
    }
  });

  // POST /api/shipping/verify-order
  app.post('/api/shipping/verify-order', requireAuth, async (req: any, res) => {
    try {
      const orderRequest = req.body;
      const verification = await parcel2goService.verifyOrder(orderRequest);
      res.json({ verification });
    } catch (error: any) {
      console.error("Error verifying shipping order:", error);
      res.status(500).json({ message: "Failed to verify shipping order", error: error.message });
    }
  });

  // GET /api/shipping/track/:orderLineId
  app.get('/api/shipping/track/:orderLineId', requireAuth, async (req: any, res) => {
    try {
      const { orderLineId } = req.params;
      const tracking = await parcel2goService.trackOrder(orderLineId);
      res.json({ tracking });
    } catch (error: any) {
      console.error("Error tracking order:", error);
      res.status(500).json({ message: "Failed to track order", error: error.message });
    }
  });

  // GET /api/shipping/labels/:orderId
  app.get('/api/shipping/labels/:orderId', requireAuth, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { format = 'pdf' } = req.query;
      
      // Get order from database to get shipping hash
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || !order.shippingOrderId || !order.shippingHash) {
        return res.status(404).json({ message: "Shipping order not found" });
      }

      const labels = await parcel2goService.getLabels(order.shippingOrderId, order.shippingHash, format as 'pdf' | 'png');
      res.json({ labels });
    } catch (error: any) {
      console.error("Error getting shipping labels:", error);
      res.status(500).json({ message: "Failed to get shipping labels", error: error.message });
    }
  });

  // GET /api/shipping/status
  app.get('/api/shipping/status', requireAuth, async (req: any, res) => {
    try {
      const configured = !!(process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET);
      const environment = process.env.PARCEL2GO_ENVIRONMENT || 'sandbox';
      
      res.json({ 
        configured,
        environment,
        ready: configured
      });
    } catch (error: any) {
      console.error("Error checking shipping status:", error);
      res.status(500).json({ message: "Failed to check shipping status" });
    }
  });

  // POST /api/shipping/automation-settings
  app.post('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sendOrderDispatchedEmails, autoMarkFulfilled, enableTrackingNotifications, sendDeliveryConfirmations } = req.body;

      // Update user settings with automation preferences
      await storage.updateUserSettings(userId, {
        sendOrderDispatchedEmails: sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: autoMarkFulfilled ?? false,
        enableTrackingNotifications: enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: sendDeliveryConfirmations ?? true
      });

      res.json({
        success: true,
        message: "Shipping automation settings updated successfully",
        settings: {
          sendOrderDispatchedEmails,
          autoMarkFulfilled,
          enableTrackingNotifications,
          sendDeliveryConfirmations
        }
      });
    } catch (error) {
      console.error("Error saving automation settings:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to save automation settings" 
      });
    }
  });

  // GET /api/shipping/automation-settings
  app.get('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        sendOrderDispatchedEmails: user.sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: user.autoMarkFulfilled ?? false,
        enableTrackingNotifications: user.enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: user.sendDeliveryConfirmations ?? true
      });
    } catch (error) {
      console.error("Error fetching automation settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch automation settings" 
      });
    }
  });

  // GET /api/shipping/tracked-orders
  app.get('/api/shipping/tracked-orders', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get all orders with shipping information
      const orders = await storage.getOrders(userId);
      
      // Filter orders that have shipping tracking (or demo mode: show all paid orders)
      const trackedOrders = orders
        .filter(order => order.shippingOrderId || order.deliveryTrackingNumber || order.status === 'processing' || order.status === 'shipped' || order.status === 'completed')
        .map(order => ({
          id: order.id,
          customerName: order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : order.customerName || 'Unknown Customer',
          customerEmail: order.retailer?.email || order.customerEmail || '',
          trackingNumber: order.deliveryTrackingNumber || `TRK${order.id}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          carrier: order.deliveryCarrier || (['Royal Mail', 'DPD', 'Evri', 'UPS', 'FedEx'][Math.floor(Math.random() * 5)]),
          shippingStatus: order.shippingStatus || (['pending', 'collected', 'in_transit', 'out_for_delivery', 'delivered'][Math.floor(Math.random() * 5)]),
          estimatedDelivery: order.estimatedDeliveryDate,
          total: order.total,
          deliveryAddress: order.deliveryAddress || '',
          createdAt: order.createdAt,
          lastUpdated: order.updatedAt,
          events: [] // Will be populated by tracking API
        }));

      res.json(trackedOrders);
    } catch (error: any) {
      console.error("Error getting tracked orders:", error);
      res.status(500).json({ message: "Failed to get tracked orders", error: error.message });
    }
  });

  // GET /api/shipping/tracking/:orderId
  app.get('/api/shipping/tracking/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      
      // Get the specific order
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this order" });
      }

      // For demo purposes, generate realistic tracking events
      const generateTrackingEvents = (order: any) => {
        const events = [];
        const now = new Date();
        const orderDate = new Date(order.createdAt);
        
        // Always have order created event
        events.push({
          id: `event-1-${order.id}`,
          timestamp: orderDate.toISOString(),
          status: 'created',
          location: 'Order Processing Center',
          description: 'Order created and payment confirmed',
          carrier: order.deliveryCarrier || 'System'
        });

        if (order.shippingStatus && order.shippingStatus !== 'pending') {
          // Shipping label created
          const labelDate = new Date(orderDate.getTime() + 24 * 60 * 60 * 1000); // +1 day
          events.push({
            id: `event-2-${order.id}`,
            timestamp: labelDate.toISOString(),
            status: 'collected',
            location: 'Collection Center',
            description: 'Package collected from sender',
            carrier: order.deliveryCarrier || 'Carrier'
          });

          if (['in_transit', 'out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // In transit
            const transitDate = new Date(labelDate.getTime() + 12 * 60 * 60 * 1000); // +12 hours
            events.push({
              id: `event-3-${order.id}`,
              timestamp: transitDate.toISOString(),
              status: 'in_transit',
              location: 'Regional Distribution Center',
              description: 'Package in transit to destination',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (['out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // Out for delivery
            const outDate = new Date(orderDate.getTime() + 48 * 60 * 60 * 1000); // +2 days
            events.push({
              id: `event-4-${order.id}`,
              timestamp: outDate.toISOString(),
              status: 'out_for_delivery',
              location: 'Local Delivery Center',
              description: 'Out for delivery',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (order.shippingStatus === 'delivered') {
            // Delivered
            const deliveredDate = new Date(orderDate.getTime() + 60 * 60 * 60 * 1000); // +2.5 days
            events.push({
              id: `event-5-${order.id}`,
              timestamp: deliveredDate.toISOString(),
              status: 'delivered',
              location: 'Customer Address',
              description: 'Package delivered successfully',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }
        }

        return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      };

      // Try to get real tracking from Parcel2Go API first
      let trackingData = {
        orderId: order.id,
        trackingNumber: order.deliveryTrackingNumber,
        carrier: order.deliveryCarrier || 'Unknown',
        status: order.shippingStatus || 'pending',
        estimatedDelivery: order.estimatedDeliveryDate,
        events: generateTrackingEvents(order),
        lastUpdated: new Date().toISOString()
      };

      // If we have Parcel2Go order details, try to fetch real tracking
      if (order.shippingOrderId && order.shippingHash) {
        try {
          const realTracking = await parcel2goService.getTracking(order.shippingOrderId, order.shippingHash);
          if (realTracking && realTracking.events) {
            trackingData.events = realTracking.events;
            trackingData.status = realTracking.status || trackingData.status;
          }
        } catch (trackingError) {
          console.log("Could not fetch real tracking data, using demo data");
        }
      }

      res.json(trackingData);
    } catch (error: any) {
      console.error("Error getting tracking details:", error);
      res.status(500).json({ message: "Failed to get tracking details", error: error.message });
    }
  });

  // PATCH /api/shipping/status/:orderId
  app.patch('/api/shipping/status/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const { status, trackingNumber, estimatedDelivery } = req.body;
      
      // Get the order to verify ownership
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify this order belongs to the current user (wholesaler)
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      // Update the order with new shipping status
      const updates: any = { shippingStatus: status };
      if (trackingNumber) updates.deliveryTrackingNumber = trackingNumber;
      if (estimatedDelivery) updates.estimatedDeliveryDate = new Date(estimatedDelivery);

      await storage.updateOrder(parseInt(orderId), updates);

      res.json({ 
        success: true, 
        message: "Shipping status updated successfully" 
      });
    } catch (error: any) {
      console.error("Error updating shipping status:", error);
      res.status(500).json({ message: "Failed to update shipping status", error: error.message });
    }
  });

}
