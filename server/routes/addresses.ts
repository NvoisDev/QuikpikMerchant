import type { Express } from "express";
import {
  and, isAuthenticated, or, requireAuth, requireNotViewer, storage
} from "./shared";

export function registerAddressRoutes(app: Express): void {
  // GET /api/delivery-address/:addressId
  app.get('/api/delivery-address/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const address = await storage.getDeliveryAddress(parseInt(addressId));
      
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      if (address.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      console.log(`🎯 Retrieved exact delivery address ${addressId} for order display: ${address.addressLine1}, ${address.city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error fetching delivery address:", error);
      res.status(500).json({ error: "Failed to fetch delivery address" });
    }
  });

  // GET /api/wholesaler/delivery-address/:addressId
  app.get('/api/wholesaler/delivery-address/:addressId', requireAuth, async (req: any, res) => {
    try {
      const { addressId } = req.params;
      
      const address = await storage.getDeliveryAddress(parseInt(addressId));
      
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      console.log(`🎯 Wholesaler retrieved delivery address ${addressId}: ${address.addressLine1}, ${address.city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error fetching delivery address for wholesaler:", error);
      res.status(500).json({ error: "Failed to fetch delivery address" });
    }
  });

  // GET /api/wholesaler/customer-delivery-addresses/:customerId/:wholesalerId
  app.get('/api/wholesaler/customer-delivery-addresses/:customerId/:wholesalerId', isAuthenticated, async (req, res) => {
    try {
      const { customerId, wholesalerId } = req.params;
      
      const authenticatedWholesalerId = (req.user as any)?.id;
      if (authenticatedWholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerId);
      console.log(`📍 Wholesaler ${wholesalerId} retrieved ${addresses.length} delivery addresses for customer ${customerId}`);
      
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses for wholesaler:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // GET /api/wholesaler/customers/:customerId/addresses
  app.get('/api/wholesaler/customers/:customerId/addresses', requireAuth, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      const addresses = await storage.getDeliveryAddresses(customerId);
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching customer addresses:", error);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  // POST /api/wholesaler/customers/:customerId/addresses
  app.post('/api/wholesaler/customers/:customerId/addresses', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId } = req.params;
      const { addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;

      if (!addressLine1 || !city || !postalCode) {
        return res.status(400).json({ error: "Address line 1, city, and postal code are required" });
      }

      const address = await storage.createDeliveryAddress({
        customerId,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        state: state || null,
        postalCode,
        country: country || 'United Kingdom',
        label: label || null,
        instructions: instructions || null,
        isDefault: isDefault || false,
      });

      console.log(`📍 Wholesaler ${wholesalerId} added address for customer ${customerId}: ${addressLine1}, ${city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error creating customer address:", error);
      res.status(500).json({ error: "Failed to create address" });
    }
  });

  // PUT /api/wholesaler/customers/:customerId/addresses/:addressId
  app.put('/api/wholesaler/customers/:customerId/addresses/:addressId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId, addressId } = req.params;
      const { addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      const updated = await storage.updateDeliveryAddress(parseInt(addressId), {
        addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault,
      });

      console.log(`📍 Wholesaler ${wholesalerId} updated address ${addressId} for customer ${customerId}`);
      res.json(updated);
    } catch (error) {
      console.error("❌ Error updating customer address:", error);
      res.status(500).json({ error: "Failed to update address" });
    }
  });

  // DELETE /api/wholesaler/customers/:customerId/addresses/:addressId
  app.delete('/api/wholesaler/customers/:customerId/addresses/:addressId', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId, addressId } = req.params;

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      await storage.deleteDeliveryAddress(parseInt(addressId));
      console.log(`📍 Wholesaler ${wholesalerId} deleted address ${addressId} for customer ${customerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting customer address:", error);
      res.status(500).json({ error: "Failed to delete address" });
    }
  });

  // GET /api/customer/delivery-addresses/:wholesalerId
  // URL keeps :wholesalerId for backward-compat but no longer filters by it
  app.get('/api/customer/delivery-addresses/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (customerAuth.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied for this wholesaler" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerAuth.customerId);
      console.log(`📍 Retrieved ${addresses.length} delivery addresses for customer ${customerAuth.customerId}`);
      
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // POST /api/customer/delivery-addresses
  app.post('/api/customer/delivery-addresses', async (req, res) => {
    try {
      const { wholesalerId, addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (!addressLine1 || !city || !postalCode) {
        return res.status(400).json({ error: "Missing required address fields" });
      }
      
      // If this is being set as default, first unset any existing default
      if (isDefault) {
        await storage.setDefaultDeliveryAddress(customerAuth.customerId, -1);
      }
      
      const newAddress = await storage.createDeliveryAddress({
        customerId: customerAuth.customerId,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        state: state || null,
        postalCode,
        country: country || 'United Kingdom',
        label: label || null,
        instructions: instructions || null,
        isDefault: isDefault || false
      });
      
      console.log(`📍 Created new delivery address ${newAddress.id} for customer ${customerAuth.customerId}`);
      
      res.status(201).json(newAddress);
    } catch (error) {
      console.error("❌ Error creating delivery address:", error);
      res.status(500).json({ error: "Failed to create delivery address" });
    }
  });

  // PUT /api/customer/delivery-addresses/:addressId
  app.put('/api/customer/delivery-addresses/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      const { addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      if (isDefault && !existingAddress.isDefault) {
        await storage.setDefaultDeliveryAddress(customerAuth.customerId, parseInt(addressId));
      }
      
      const updates: any = {};
      if (addressLine1) updates.addressLine1 = addressLine1;
      if (addressLine2 !== undefined) updates.addressLine2 = addressLine2;
      if (city) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (postalCode) updates.postalCode = postalCode;
      if (country) updates.country = country;
      if (label !== undefined) updates.label = label;
      if (instructions !== undefined) updates.instructions = instructions;
      if (isDefault !== undefined) updates.isDefault = isDefault;
      
      const updatedAddress = await storage.updateDeliveryAddress(parseInt(addressId), updates);
      
      console.log(`📍 Updated delivery address ${addressId} for customer ${customerAuth.customerId}`);
      
      res.json(updatedAddress);
    } catch (error) {
      console.error("❌ Error updating delivery address:", error);
      res.status(500).json({ error: "Failed to update delivery address" });
    }
  });

  // DELETE /api/customer/delivery-addresses/:addressId
  app.delete('/api/customer/delivery-addresses/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.deleteDeliveryAddress(parseInt(addressId));
      
      console.log(`📍 Deleted delivery address ${addressId} for customer ${customerAuth.customerId}`);
      
      res.json({ success: true, message: "Delivery address deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting delivery address:", error);
      res.status(500).json({ error: "Failed to delete delivery address" });
    }
  });

  // POST /api/customer/delivery-addresses/:addressId/set-default
  app.post('/api/customer/delivery-addresses/:addressId/set-default', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.setDefaultDeliveryAddress(customerAuth.customerId, parseInt(addressId));
      
      console.log(`📍 Set address ${addressId} as default for customer ${customerAuth.customerId}`);
      
      res.json({ success: true, message: "Default address updated successfully" });
    } catch (error) {
      console.error("❌ Error setting default address:", error);
      res.status(500).json({ error: "Failed to set default address" });
    }
  });

  // GET /api/customer/delivery-addresses/:wholesalerId/default
  // URL keeps :wholesalerId for backward-compat but no longer filters by it
  app.get('/api/customer/delivery-addresses/:wholesalerId/default', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const defaultAddress = await storage.getDefaultDeliveryAddress(customerAuth.customerId);
      
      if (!defaultAddress) {
        return res.status(404).json({ error: "No default address found" });
      }
      
      console.log(`📍 Retrieved default address ${defaultAddress.id} for customer ${customerAuth.customerId}`);
      
      res.json(defaultAddress);
    } catch (error) {
      console.error("❌ Error fetching default address:", error);
      res.status(500).json({ error: "Failed to fetch default address" });
    }
  });

}
