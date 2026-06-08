import type { Express } from "express";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
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

// Infer retail vs wholesale from Google place types
function inferType(types: string[]): "retail" | "wholesale" {
  const wholesale = ["storage", "food", "wholesale_store"];
  if (types?.some(t => wholesale.includes(t))) return "wholesale";
  return "retail";
}

// Parse opening hours from Google Places period array into HH:MM strings
function parseHours(openingHours: any): { openingTime: string | null; closingTime: string | null } {
  if (!openingHours?.periods?.length) return { openingTime: null, closingTime: null };
  // Use Monday (day=1) as representative; fall back to first available day
  const period = openingHours.periods.find((p: any) => p.open?.day === 1) ?? openingHours.periods[0];
  if (!period) return { openingTime: null, closingTime: null };
  const fmt = (t: string) => t ? `${t.slice(0, 2)}:${t.slice(2)}` : null;
  return {
    openingTime: fmt(period.open?.time),
    closingTime: fmt(period.close?.time),
  };
}

// Single Google Places Text Search call
async function textSearch(query: string, apiKey: string): Promise<any[]> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as any;
    return data.results ?? [];
  } catch {
    return [];
  }
}

// Fetch full place details (phone + hours)
async function placeDetails(placeId: string, apiKey: string): Promise<any | null> {
  try {
    const fields = "formatted_phone_number,opening_hours,types";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.result ?? null;
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

  // POST /api/admin/prospect-stores/sweep  — discover stores via Google Places
  app.post("/api/admin/prospect-stores/sweep", requireAuth, requireSuperAdmin, async (req: any, res) => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Google Places API key not configured" });
    }

    const QUERIES = [
      "Nigerian grocery store London",
      "African food store South East London",
      "Nigerian supermarket London",
      "African supermarket South East London",
      "Nigerian cash and carry London",
      "African cash and carry London",
      "West African food store London",
      "Afro-Caribbean grocery London",
      "Nigerian provisions store London",
      "African market South East London",
    ];

    // Run all text searches in parallel
    const rawResults = await Promise.all(QUERIES.map(q => textSearch(q, apiKey)));

    // Deduplicate by placeId
    const seen = new Set<string>();
    const candidates: Array<{
      placeId: string;
      name: string;
      address: string;
      lat: number | null;
      lng: number | null;
      types: string[];
    }> = [];

    for (const batch of rawResults) {
      for (const place of batch) {
        if (!place.place_id || seen.has(place.place_id)) continue;
        seen.add(place.place_id);
        candidates.push({
          placeId: place.place_id,
          name: place.name ?? "",
          address: place.formatted_address ?? "",
          lat: place.geometry?.location?.lat ?? null,
          lng: place.geometry?.location?.lng ?? null,
          types: place.types ?? [],
        });
      }
    }

    // Fetch place details in parallel (phone + hours) — cap at 100 to avoid quota abuse
    const toDetail = candidates.slice(0, 100);
    const details = await Promise.all(toDetail.map(c => placeDetails(c.placeId, apiKey)));

    // Check which placeIds are already saved
    const existing = await db
      .select({ placeId: prospectStores.placeId })
      .from(prospectStores);
    const savedPlaceIds = new Set(existing.map(e => e.placeId).filter(Boolean));

    const results = toDetail.map((c, i) => {
      const det = details[i];
      const { openingTime, closingTime } = parseHours(det?.opening_hours);
      return {
        placeId: c.placeId,
        name: c.name,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        phone: det?.formatted_phone_number ?? null,
        openingTime,
        closingTime,
        type: inferType(det?.types ?? c.types),
        alreadyAdded: savedPlaceIds.has(c.placeId),
      };
    });

    res.json({ results, total: results.length });
  });

  // POST /api/admin/prospect-stores
  app.post("/api/admin/prospect-stores", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const {
        name, address, openingTime, closingTime, type, notes,
        assignedWholesalerIds, visited, latitude, longitude,
        contactName, contactPhone, placeId,
      } = req.body as {
        name: string; address?: string; openingTime?: string; closingTime?: string;
        type?: string; notes?: string; assignedWholesalerIds?: string[];
        visited?: boolean; latitude?: number | null; longitude?: number | null;
        contactName?: string; contactPhone?: string; placeId?: string;
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
        placeId: placeId?.trim() || null,
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
      res.status(500).json({ error: "Failed to delete store" });
    }
  });
}
