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
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Keep these out of the toolkit bundle. `leaflet` is an optional peer
      // dependency loaded dynamically by the map adapter; bundling it here
      // would defeat the optional-peer/lazy-load intent and bloat the toolkit
      // output for consumers that never use the map.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'leaflet'],
      onwarn(warning, warn) {
        // Suppress "use client" directive warnings from shadcn/ui + Radix UI
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        if (warning.message?.includes('sourcemap')) return
        warn(warning)
      },
    },
  },
})
