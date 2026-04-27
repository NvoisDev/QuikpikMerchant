import type { Express } from "express";
import { storage, requireAuth, requireOwner, insertCollectionAddressSchema } from "./shared";

export function registerCollectionAddressRoutes(app: Express) {
  // GET /api/wholesalers/:wholesalerId/collection-addresses — public, for customer portal
  app.get("/api/wholesalers/:wholesalerId/collection-addresses", async (req: any, res) => {
    try {
      const { wholesalerId } = req.params;
      if (!wholesalerId) return res.status(400).json({ error: "Missing wholesalerId" });
      const addresses = await storage.getCollectionAddresses(wholesalerId);
      res.json(addresses.filter((a: any) => a.isActive !== false));
    } catch (err: any) {
      console.error("public getCollectionAddresses error:", err);
      res.status(500).json({ error: "Failed to fetch collection addresses" });
    }
  });

  // GET /api/collection-addresses — list all for authenticated wholesaler
  app.get("/api/collection-addresses", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      const addresses = await storage.getCollectionAddresses(user.id);
      res.json(addresses);
    } catch (err: any) {
      console.error("getCollectionAddresses error:", err);
      res.status(500).json({ error: "Failed to fetch collection addresses" });
    }
  });

  // POST /api/collection-addresses — create new (owner only)
  app.post("/api/collection-addresses", requireAuth, requireOwner, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      const body = insertCollectionAddressSchema.parse({ ...req.body, wholesalerId: user.id });
      const address = await storage.createCollectionAddress(body);
      res.status(201).json(address);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
      console.error("createCollectionAddress error:", err);
      res.status(500).json({ error: "Failed to create collection address" });
    }
  });

  // PATCH /api/collection-addresses/:id — update (owner only)
  app.patch("/api/collection-addresses/:id", requireAuth, requireOwner, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const updates = insertCollectionAddressSchema.partial().parse(req.body);
      const address = await storage.updateCollectionAddress(id, user.id, updates);
      res.json(address);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
      if (err?.message === "Collection address not found") return res.status(404).json({ error: "Not found" });
      console.error("updateCollectionAddress error:", err);
      res.status(500).json({ error: "Failed to update collection address" });
    }
  });

  // DELETE /api/collection-addresses/:id — delete (owner only)
  app.delete("/api/collection-addresses/:id", requireAuth, requireOwner, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteCollectionAddress(id, user.id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.message === "COLLECTION_ADDRESS_IN_USE") {
        return res.status(409).json({ error: "Cannot delete an address linked to active or pending orders. Deactivate it instead." });
      }
      console.error("deleteCollectionAddress error:", err);
      res.status(500).json({ error: "Failed to delete collection address" });
    }
  });

  // PATCH /api/collection-addresses/:id/set-default — set as default (owner only)
  app.patch("/api/collection-addresses/:id/set-default", requireAuth, requireOwner, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const address = await storage.setDefaultCollectionAddress(user.id, id);
      res.json(address);
    } catch (err: any) {
      if (err?.message === "Collection address not found") return res.status(404).json({ error: "Not found" });
      console.error("setDefaultCollectionAddress error:", err);
      res.status(500).json({ error: "Failed to set default" });
    }
  });
}
