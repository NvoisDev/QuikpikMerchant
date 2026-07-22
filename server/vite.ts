import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

/**
 * Known SPA route patterns. Any path reaching the static catch-all that does
 * NOT match one of these is considered unknown and served as a 404 so that
 * search engines don't treat fabricated/non-existent URLs as valid pages.
 *
 * Public routes (/w/:slug, /product/:slug, /blog/:slug, etc.) are handled by
 * the SEO interceptor in routes.ts *before* the static catch-all is reached,
 * so they don't need to appear here.
 */
const KNOWN_SPA_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/blog(\/[^/]+)?$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/w\/[^/]+$/,
  /^\/product\/[^/]+$/,
  /^\/welcome\/[^/]+$/,
  /^\/campaign\/[^/]+$/,
  /^\/marketplace(\/[^/]+.*)?$/,
  /^\/saved$/,
  /^\/customer(\/.*)?$/,
  /^\/store\/[^/]+$/,
  /^\/team-invitation$/,
  /^\/signup(-complete)?$/,
  /^\/login$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/customer-login$/,
  /^\/auth-success$/,
  /^\/select-wholesaler$/,
  /^\/accept-invitation\/[^/]+$/,
  /^\/admin(\/.*)?$/,
  /^\/super-admin(\/.*)?$/,
  /^\/preview-store(\/[^/]+)?$/,
  /^\/dashboard$/,
  /^\/products(\/[^/]+)?$/,
  /^\/promotions$/,
  /^\/price-lists\/[^/]+$/,
  /^\/customers(\/[^/]+)?$/,
  /^\/customer-registration-requests$/,
  /^\/orders(\/[^/]+)?$/,
  /^\/analytics$/,
  /^\/financials$/,
  /^\/financial-health$/,
  /^\/settings$/,
  /^\/stripe-success$/,
  /^\/campaigns$/,
  /^\/broadcasts$/,
  /^\/message-templates$/,
  /^\/stock-alerts$/,
  /^\/quick-quote$/,
  /^\/team-management$/,
  /^\/help$/,
  /^\/subscription-pricing$/,
  /^\/integrations$/,
  /^\/leads$/,
  /^\/checkout$/,
];

function isKnownSpaRoute(pathname: string): boolean {
  return KNOWN_SPA_PATTERNS.some((re) => re.test(pathname));
}

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as any,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      const status = isKnownSpaRoute(req.path) ? 200 : 404;
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    }
  }));

  // fall through to index.html if the file doesn't exist.
  // Return 404 for paths that don't match any known app route so that search
  // engines don't index random/fabricated URLs as soft-404s.
  app.use("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const status = isKnownSpaRoute(req.path) ? 200 : 404;
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
}
