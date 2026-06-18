---
name: esbuild 0.28 breaks Vite 5 frontend transform
description: Why you cannot bump esbuild past 0.27 while the app stays on Vite 5.4.x
---

# esbuild 0.28+ is incompatible with the app's Vite 5.4.x dev/build

Forcing `esbuild >= 0.28` (e.g. via an npm `overrides` entry to clear esbuild
security advisories) breaks the app's `vite@5.4.x` frontend transform. The dev
server and `npm run build` fail with errors like:

  "Transforming destructuring to the configured target environment
  (chrome87/edge88/es2020/firefox78/safari14) is not supported yet"

for node_modules ESM deps (framer-motion, date-fns, lucide-react). The server
(tsx, node target) still boots fine — only the browser-target transform breaks.

**Why:** esbuild 0.28 changed how it lowers syntax for old browser targets;
Vite 5.4's optimizeDeps/transform config trips the new stricter behavior.

**How to apply:** On Vite 5, keep esbuild at `^0.25` (the app's direct
devDep) and override Vite's nested esbuild to `>=0.25.0` — NOT `>=0.28`. The
esbuild low-severity advisory from `tsx`'s bundled esbuild 0.27.7 has no
non-breaking fix and must be left documented. esbuild and Vite must be
upgraded together: only move esbuild to 0.28 as part of a Vite 6/8 major.

**Test toolchain is separate:** Vitest carries its OWN nested Vite
(override `vitest{vite>=8.0.16}`), independent of the app's Vite 5. Bumping
the test Vite does not affect the app's dev server / build.
