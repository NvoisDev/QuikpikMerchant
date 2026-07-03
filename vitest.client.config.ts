import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Vite 8 (bundled in vitest 4.x) uses oxc for transforms.
  // Configure it to handle JSX with the automatic React runtime so that
  // tsx component files can be imported without a separate babel plugin.
  oxc: {
    jsx: { runtime: 'automatic' },
  } as any,
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@assets': path.resolve(import.meta.dirname, 'client', 'src', 'assets'),
    },
  },
  test: {
    include: ['client/src/__tests__/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['client/src/test-setup.ts'],
    css: false,
  },
});
