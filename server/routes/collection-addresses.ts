import type { Express } from "express";
import { storage, requireAuth, requireMemberPermission, insertCollectionAddressSchema } from "./shared";

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
  // Lazy migration: if no rows exist and user has pickupAddress, create a default row from it.
  app.get("/api/collection-addresses", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user?.id) return res.status(401).json({ error: "Unauthorised" });
      let addresses = await storage.getCollectionAddresses(user.id);

      // Lazy migration: auto-create first collection address from pickupAddress if none exist
      if (addresses.length === 0) {
        const wholesaler = await storage.getUser(user.id);
        const pickupAddr = wholesaler?.pickupAddress?.trim();
        if (pickupAddr) {
          try {
            const created = await storage.createCollectionAddress({
              wholesalerId: user.id,
              name: "Main Collection Point",
              addressLine1: pickupAddr,
              addressLine2: null,
              city: wholesaler?.city || "",
              postcode: wholesaler?.postalCode || "",
              country: wholesaler?.country || "United Kingdom",
              isDefault: true,
              isActive: true,
            });
            addresses = [created];
            console.log(`✅ Lazy-migrated pickupAddress → collection_addresses for wholesaler ${user.id}`);
          } catch (migrateErr) {
            console.error("Lazy migration of pickupAddress failed (non-fatal):", migrateErr);
          }
        }
      }

      res.json(addresses);
    } catch (err: any) {
      console.error("getCollectionAddresses error:", err);
      res.status(500).json({ error: "Failed to fetch collection addresses" });
    }
  });

  // POST /api/collection-addresses — create new (owner + team admin; blocks member/viewer)
  app.post("/api/collection-addresses", requireAuth, requireMemberPermission("settings"), async (req: any, res) => {
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

  // PATCH /api/collection-addresses/:id — update (owner + team admin; blocks member/viewer)
  app.patch("/api/collection-addresses/:id", requireAuth, requireMemberPermission("settings"), async (req: any, res) => {
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

  // DELETE /api/collection-addresses/:id — delete (owner + team admin; blocks member/viewer)
  app.delete("/api/collection-addresses/:id", requireAuth, requireMemberPermission("settings"), async (req: any, res) => {
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

  // PATCH /api/collection-addresses/:id/set-default — set as default (owner + team admin)
  app.patch("/api/collection-addresses/:id/set-default", requireAuth, requireMemberPermission("settings"), async (req: any, res) => {
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
