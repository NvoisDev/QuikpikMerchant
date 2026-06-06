---
name: Static assets path
description: Where to place static files so they are served correctly in dev and prod
---

# Static assets must go in client/public/

## The rule
Always copy static files (images, fonts, etc.) to `client/public/` — never to the project-root `public/`.

**Why:** `vite.config.ts` sets `root: path.resolve(import.meta.dirname, "client")`, so Vite's static-file middleware serves from `client/public/`. The project-root `public/` directory is NOT served in development.

**How to apply:** Whenever a task says "copy X to public/foo.jpg", the correct destination is `client/public/foo.jpg`. The `<img src="/foo.jpg">` URL then resolves correctly in both dev (Vite middleware) and production (Express serves `dist/public/` which is built from `client/`).
