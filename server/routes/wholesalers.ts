import type { Express } from "express";
import { storage } from "../storage";

export function registerWholesalerRoutes(app: Express) {
  // Get all active wholesalers for store selection
  app.get("/api/wholesalers", async (req, res) => {
    try {
      console.log("🏪 Fetching all wholesalers for store selection");
      
      const wholesalers = await storage.getAllWholesalers();
      
      // Enhance with product counts
      const enhancedWholesalers = await Promise.all(
        wholesalers.map(async (wholesaler) => {
          try {
            const products = await storage.getMarketplaceProducts({
              wholesalerId: wholesaler.id,
              sortBy: 'featured'
            });
            
            return {
              ...wholesaler,
              productCount: products.length,
              isActive: true,
              verified: true // For now, mark all as verified
            };
          } catch (error) {
            console.error(`Error getting product count for ${wholesaler.id}:`, error);
            return {
              ...wholesaler,
              productCount: 0,
              isActive: true,
              verified: true
            };
          }
        })
      );
      
      console.log(`✅ Returning ${enhancedWholesalers.length} wholesalers`);
      res.json(enhancedWholesalers);
    } catch (error) {
      console.error("❌ Error fetching wholesalers:", error);
      res.status(500).json({ 
        error: "Failed to fetch wholesalers",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get specific wholesaler info
  app.get("/api/wholesalers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`🏪 Fetching wholesaler info for: ${id}`);
      
      const wholesaler = await storage.getUser(id);
      
      if (!wholesaler) {
        return res.status(404).json({ error: "Wholesaler not found" });
      }
      
      console.log(`✅ Found wholesaler: ${wholesaler.businessName}`);
      res.json(wholesaler);
    } catch (error) {
      console.error("❌ Error fetching wholesaler:", error);
      res.status(500).json({ 
        error: "Failed to fetch wholesaler",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}