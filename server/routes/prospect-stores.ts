import type { Express } from "express";
import { db } from "../db";
import { eq, desc, ilike } from "drizzle-orm";
import { prospectStores } from "@shared/schema";
import { requireAuth } from "../googleAuth";
import { ADMIN_EMAILS } from "../config";
import { sql } from "drizzle-orm";

function getAdminEmail(req: any): string | undefined {
  return req._adminEmail || req.user?.email;
}

function requireSuperAdmin(req: any, res: any, next: any) {
  if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(address + ", UK");
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=gb`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Quikpik/1.0 (admin@quikpik.co)" },
    });
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!data || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function registerProspectStoreRoutes(app: Express): void {
  // GET /api/admin/prospect-stores
  app.get("/api/admin/prospect-stores", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const stores = await db
        .select()
        .from(prospectStores)
        .orderBy(desc(prospectStores.createdAt));
      res.json(stores);
    } catch (err) {
      console.error("prospect-stores GET error:", err);
      res.status(500).json({ error: "Failed to fetch prospect stores" });
    }
  });

  // POST /api/admin/prospect-stores
  app.post("/api/admin/prospect-stores", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const {
        name, address, openingTime, closingTime, type, notes,
        assignedWholesalerIds, visited, latitude, longitude,
        contactName, contactPhone,
      } = req.body as {
        name: string; address?: string; openingTime?: string; closingTime?: string;
        type?: string; notes?: string; assignedWholesalerIds?: string[];
        visited?: boolean; latitude?: number | null; longitude?: number | null;
        contactName?: string; contactPhone?: string;
      };

      if (!name?.trim()) {
        return res.status(400).json({ error: "Store name is required" });
      }

      let lat = latitude ?? null;
      let lng = longitude ?? null;

      if (!lat && !lng && address) {
        const coords = await geocodeAddress(address);
        if (coords) { lat = coords.lat; lng = coords.lng; }
      }

      const [store] = await db.insert(prospectStores).values({
        name: name.trim(),
        address: address?.trim() || null,
        openingTime: openingTime?.trim() || null,
        closingTime: closingTime?.trim() || null,
        type: (type === "wholesale" ? "wholesale" : "retail"),
        visited: visited ?? false,
        notes: notes?.trim() || null,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        assignedWholesalerIds: assignedWholesalerIds ?? [],
        latitude: lat !== null ? String(lat) : null,
        longitude: lng !== null ? String(lng) : null,
      }).returning();

      res.json(store);
    } catch (err) {
      console.error("prospect-stores POST error:", err);
      res.status(500).json({ error: "Failed to create prospect store" });
    }
  });

  // PATCH /api/admin/prospect-stores/:id
  app.patch("/api/admin/prospect-stores/:id", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const existing = await db
        .select()
        .from(prospectStores)
        .where(eq(prospectStores.id, id))
        .limit(1);
      if (!existing.length) return res.status(404).json({ error: "Store not found" });

      const {
        name, address, openingTime, closingTime, type, notes,
        assignedWholesalerIds, visited, latitude, longitude,
        contactName, contactPhone,
      } = req.body as Record<string, any>;

      const patch: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (type !== undefined) patch.type = type === "wholesale" ? "wholesale" : "retail";
      if (openingTime !== undefined) patch.openingTime = openingTime?.trim() || null;
      if (closingTime !== undefined) patch.closingTime = closingTime?.trim() || null;
      if (notes !== undefined) patch.notes = notes?.trim() || null;
      if (visited !== undefined) patch.visited = !!visited;
      if (assignedWholesalerIds !== undefined) patch.assignedWholesalerIds = assignedWholesalerIds;
      if (contactName !== undefined) patch.contactName = contactName?.trim() || null;
      if (contactPhone !== undefined) patch.contactPhone = contactPhone?.trim() || null;

      if (address !== undefined) {
        patch.address = address?.trim() || null;
        if (patch.address) {
          let lat = latitude ?? null;
          let lng = longitude ?? null;
          if (lat == null && lng == null) {
            const coords = await geocodeAddress(patch.address);
            if (coords) { lat = coords.lat; lng = coords.lng; }
          }
          patch.latitude = lat !== null ? String(lat) : null;
          patch.longitude = lng !== null ? String(lng) : null;
        } else {
          patch.latitude = null;
          patch.longitude = null;
        }
      }
      if (latitude !== undefined && address === undefined) patch.latitude = latitude !== null ? String(latitude) : null;
      if (longitude !== undefined && address === undefined) patch.longitude = longitude !== null ? String(longitude) : null;

      const [updated] = await db
        .update(prospectStores)
        .set(patch)
        .where(eq(prospectStores.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error("prospect-stores PATCH error:", err);
      res.status(500).json({ error: "Failed to update prospect store" });
    }
  });

  // DELETE /api/admin/prospect-stores/:id
  app.delete("/api/admin/prospect-stores/:id", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      await db.delete(prospectStores).where(eq(prospectStores.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("prospect-stores DELETE error:", err);
      res.status(500).json({ error: "Failed to delete prospect store" });
    }
  });
}
