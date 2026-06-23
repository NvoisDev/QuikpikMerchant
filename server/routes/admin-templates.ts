import type { Express } from "express";
import { ADMIN_EMAILS, getAdminEmail, requireAuth } from "./shared";
import { getTemplateCatalog } from "../services/templateCatalog";

export function registerAdminTemplatesRoutes(app: Express): void {
  // GET /api/admin/templates — read-only preview of every platform message
  app.get('/api/admin/templates', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(getAdminEmail(req) || "")) return res.status(403).json({ error: 'Forbidden' });
      const templates = getTemplateCatalog();
      res.json({ templates });
    } catch (error: any) {
      console.error('[admin/templates] Failed to build template catalogue:', error);
      res.status(500).json({ error: 'Failed to load templates' });
    }
  });
}
