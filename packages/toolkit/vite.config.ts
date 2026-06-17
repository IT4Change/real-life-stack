import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    dts({
      include: ['src'],
      outDir: 'dist',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      // Multiple entries: the main barrel + dedicated subpath entries for
      // adapters with optional peer dependencies (e.g. leaflet). This way
      // `@real-life-stack/toolkit/leaflet` is the only thing that touches
      // leaflet — the main entry stays leaflet-free.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        leaflet: resolve(__dirname, 'src/leaflet.ts'),
        maplibre: resolve(__dirname, 'src/maplibre.ts'),
      },
      formats: ['es'],
      // Force flat `<name>.js` filenames so the paths in package.json's
      // `exports` map line up regardless of vite's default per-format suffix.
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // Keep these out of the toolkit bundle. `leaflet` is an optional peer
      // dependency loaded dynamically by the map adapter; bundling it here
      // would defeat the optional-peer/lazy-load intent and bloat the toolkit
      // output for consumers that never use the map.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'leaflet', 'maplibre-gl'],
      onwarn(warning, warn) {
        // Suppress "use client" directive warnings from shadcn/ui + Radix UI
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        if (warning.message?.includes('sourcemap')) return
        warn(warning)
      },
    },
  },
})
