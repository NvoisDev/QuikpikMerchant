import type { Express } from "express";
import { storage, requireAuth, requireNotViewer, db, eq, users, z, ADMIN_EMAILS } from "./shared";
import { insertBusinessProfileSchema, businessProfiles } from "@shared/schema";

function getAdminEmail(req: any): string | undefined {
  return req._adminEmail || req.user?.email;
}

export function registerBusinessProfileRoutes(app: Express): void {
  // GET /api/business-profiles — list profiles for the authenticated wholesaler
  app.get("/api/business-profiles", requireAuth, async (req: any, res) => {
    try {
      const wholesalerId =
        req.user.role === "team_member" && req.user.wholesalerId
          ? req.user.wholesalerId
          : req.user.id;

      const profiles = await storage.getBusinessProfiles(wholesalerId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching business profiles:", error);
      res.status(500).json({ error: "Failed to fetch business profiles" });
    }
  });

  // POST /api/business-profiles — create a new profile
  app.post("/api/business-profiles", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const wholesalerId =
        req.user.role === "team_member" && req.user.wholesalerId
          ? req.user.wholesalerId
          : req.user.id;

      const parsed = insertBusinessProfileSchema.safeParse({
        ...req.body,
        wholesalerId,
      });

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid profile data", details: parsed.error.flatten() });
      }

      const profile = await storage.createBusinessProfile(parsed.data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating business profile:", error);
      res.status(500).json({ error: "Failed to create business profile" });
    }
  });

  // PATCH /api/business-profiles/:id — update a profile
  app.patch("/api/business-profiles/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid profile ID" });

      const wholesalerId =
        req.user.role === "team_member" && req.user.wholesalerId
          ? req.user.wholesalerId
          : req.user.id;

      const existing = await storage.getBusinessProfile(id);
      if (!existing || existing.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const { name, logoUrl, address } = req.body;
      const updated = await storage.updateBusinessProfile(id, { name, logoUrl, address });
      res.json(updated);
    } catch (error) {
      console.error("Error updating business profile:", error);
      res.status(500).json({ error: "Failed to update business profile" });
    }
  });

  // DELETE /api/business-profiles/:id — delete a non-default profile
  app.delete("/api/business-profiles/:id", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid profile ID" });

      const wholesalerId =
        req.user.role === "team_member" && req.user.wholesalerId
          ? req.user.wholesalerId
          : req.user.id;

      const success = await storage.deleteBusinessProfile(id, wholesalerId);
      if (!success) {
        return res.status(400).json({ error: "Cannot delete profile (not found or is the default)" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting business profile:", error);
      res.status(500).json({ error: "Failed to delete business profile" });
    }
  });

  // POST /api/business-profiles/:id/set-default — set a profile as the default
  app.post("/api/business-profiles/:id/set-default", requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid profile ID" });

      const wholesalerId =
        req.user.role === "team_member" && req.user.wholesalerId
          ? req.user.wholesalerId
          : req.user.id;

      const updated = await storage.setDefaultBusinessProfile(id, wholesalerId);
      if (!updated) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error setting default business profile:", error);
      res.status(500).json({ error: "Failed to set default profile" });
    }
  });

  // PATCH /api/admin/users/:id/legal-info — admin update for legal business fields
  app.patch("/api/admin/users/:id/legal-info", requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const userId = req.params.id;
      const { legalBusinessName, vatNumber, companyRegistrationNumber } = req.body;

      const lbnTrimmed = typeof legalBusinessName === "string" ? legalBusinessName.trim() : null;
      const vatTrimmed = typeof vatNumber === "string" ? vatNumber.trim() : null;
      const crnTrimmed = typeof companyRegistrationNumber === "string" ? companyRegistrationNumber.trim() : null;

      if (lbnTrimmed && lbnTrimmed.length > 255) return res.status(400).json({ error: "Legal Business Name must be 255 characters or fewer" });
      if (vatTrimmed && vatTrimmed.length > 50) return res.status(400).json({ error: "VAT Number must be 50 characters or fewer" });
      if (crnTrimmed && crnTrimmed.length > 50) return res.status(400).json({ error: "Company Registration Number must be 50 characters or fewer" });

      const [updated] = await db
        .update(users)
        .set({
          legalBusinessName: lbnTrimmed || null,
          vatNumber: vatTrimmed || null,
          companyRegistrationNumber: crnTrimmed || null,
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id, legalBusinessName: users.legalBusinessName, vatNumber: users.vatNumber, companyRegistrationNumber: users.companyRegistrationNumber });

      if (!updated) return res.status(404).json({ error: "User not found" });

      console.log(`⚖️ Admin updated legal info for user ${userId}`);
      res.json({ success: true, user: updated });
    } catch (error) {
      console.error("Error updating legal info:", error);
      res.status(500).json({ error: "Failed to update legal info" });
    }
  });

  // PATCH /api/admin/users/:id/enable-multi-profile — admin toggle for enableMultiProfile
  app.patch("/api/admin/users/:id/enable-multi-profile", requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const userId = req.params.id;
      const { enableMultiProfile } = req.body;

      if (typeof enableMultiProfile !== "boolean") {
        return res.status(400).json({ error: "enableMultiProfile must be a boolean" });
      }

      const [updated] = await db
        .update(users)
        .set({ enableMultiProfile })
        .where(eq(users.id, userId))
        .returning({ id: users.id, enableMultiProfile: users.enableMultiProfile });

      if (!updated) return res.status(404).json({ error: "User not found" });

      console.log(`🏢 Admin set enableMultiProfile=${enableMultiProfile} for user ${userId}`);
      res.json({ success: true, user: updated });
    } catch (error) {
      console.error("Error toggling multi-profile:", error);
      res.status(500).json({ error: "Failed to toggle multi-profile flag" });
    }
  });
}
