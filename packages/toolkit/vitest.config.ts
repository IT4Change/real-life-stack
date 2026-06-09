import { defineConfig } from "vitest/config"

// Standalone vitest config — deliberately NOT extending vite.config.ts:
// the lib build there pulls in vite-plugin-dts and tailwind, which tests
// don't need and which slow down / break the test transform.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
