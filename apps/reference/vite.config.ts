import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import path from 'path'

const toolkitSrc = path.resolve(__dirname, '../../packages/toolkit/src')
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  base: basePath,
  build: {
    // Required for Automerge WASM which uses top-level await
    target: 'esnext',
  },
  define: {
    'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
  },
  resolve: {
    alias: {
      '@real-life-stack/toolkit': toolkitSrc,
      '@': toolkitSrc,
    },
  },
  // Unit tests are discovered by PATTERN, never by a hand-maintained list —
  // a list silently leaves new test files out of `pnpm test` and CI (rls#241,
  // which is how auth-gate.test.tsx went unrun). Scoped to `src/` and to
  // `.test.`, so the Playwright suites in `e2e/*.spec.ts` stay out: they need
  // the Playwright runner and would fail under vitest.
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (Automerge WASM).
      // `credentialless` keeps SharedArrayBuffer working AND allows cross-origin
      // resources without CORP headers (OSM tiles, third-party avatars, …).
      // Supported in Chrome 96+, Firefox 124+, Safari 17+.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
