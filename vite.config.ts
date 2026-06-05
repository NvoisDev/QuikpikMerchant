import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// Computed once per build. Injected into the service worker template via
// Vite's define so CACHE_NAME is automatically versioned on every deploy.
const BUILD_HASH = Date.now().toString(36);

export default defineConfig({
  define: {
    // Makes __BUILD_HASH__ available inside client/src/sw.ts at build time.
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
    VitePWA({
      // injectManifest uses client/src/sw.ts as the template.
      // Workbox replaces self.__WB_MANIFEST with a content-hash precache
      // manifest at build time, and Vite's define injects __BUILD_HASH__
      // into the cache names — so every deploy automatically produces
      // fresh, uniquely-named caches with no manual version string.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
