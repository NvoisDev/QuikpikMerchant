import type { Express } from "express";
import {
  and, isAuthenticated, or, requireAuth, requireNotViewer, storage
} from "./shared";
import { parseCustomerCookie } from "../utils/customer-auth-cookie";

export function registerAddressRoutes(app: Express): void {
  // GET /api/delivery-address/:addressId (customer-facing, by session auth)
  app.get('/api/delivery-address/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
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
      
      res.json(address);
    } catch (error) {
      console.error("❌ Error fetching delivery address:", error);
      res.status(500).json({ error: "Failed to fetch delivery address" });
    }
  });

  // GET /api/wholesaler/delivery-address/:addressId
  // Returns a single address by id; verifies the address owner is a customer of this wholesaler
  app.get('/api/wholesaler/delivery-address/:addressId', requireAuth, async (req: any, res) => {
    try {
      const { addressId } = req.params;
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;
      
      const address = await storage.getDeliveryAddress(parseInt(addressId));
      
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      const belongs = await storage.isCustomerOfWholesaler(address.customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - address not associated with your customers" });
      }
      
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
      
      const belongs = await storage.isCustomerOfWholesaler(customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - customer not associated with your account" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerId);
      
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses for wholesaler:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // GET /api/wholesaler/customers/:customerId/addresses
  app.get('/api/wholesaler/customers/:customerId/addresses', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId } = req.params;
      
      const belongs = await storage.isCustomerOfWholesaler(customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - customer not associated with your account" });
      }
      
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

      const belongs = await storage.isCustomerOfWholesaler(customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - customer not associated with your account" });
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

      const belongs = await storage.isCustomerOfWholesaler(customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - customer not associated with your account" });
      }

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      const updated = await storage.updateDeliveryAddress(parseInt(addressId), {
        addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault,
      });

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

      const belongs = await storage.isCustomerOfWholesaler(customerId, wholesalerId);
      if (!belongs) {
        return res.status(403).json({ error: "Access denied - customer not associated with your account" });
      }

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      await storage.deleteDeliveryAddress(parseInt(addressId));
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting customer address:", error);
      res.status(500).json({ error: "Failed to delete address" });
    }
  });

  // GET /api/customer/delivery-addresses — clean endpoint (no wholesalerId in URL)
  app.get('/api/customer/delivery-addresses', async (req, res) => {
    try {
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerAuth.customerId);
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // GET /api/customer/delivery-addresses/:wholesalerId
  // Kept as backward-compat alias — wholesalerId in URL is used only for cookie validation, not filtering
  app.get('/api/customer/delivery-addresses/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (customerAuth.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied for this wholesaler" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerAuth.customerId);
      
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
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (!addressLine1 || !city || !postalCode) {
        return res.status(400).json({ error: "Missing required address fields" });
      }
      
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
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
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
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId };
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.deleteDeliveryAddress(parseInt(addressId));
      
      
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
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId };
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.setDefaultDeliveryAddress(customerAuth.customerId, parseInt(addressId));
      
      
      res.json({ success: true, message: "Default address updated successfully" });
    } catch (error) {
      console.error("❌ Error setting default address:", error);
      res.status(500).json({ error: "Failed to set default address" });
    }
  });

  // GET /api/customer/delivery-addresses/:wholesalerId/default
  // Backward-compat URL — wholesalerId used for cookie validation only
  app.get('/api/customer/delivery-addresses/:wholesalerId/default', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) customerAuth = { customerId: cookieData.customerId, wholesalerId: cookieData.wholesalerId };
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
