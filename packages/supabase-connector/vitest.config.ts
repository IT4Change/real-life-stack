import { defineConfig } from "vitest/config"

/**
 * Zwei Profile mit getrennten Timeouts:
 *
 * - Unit-Tests laufen gegen den In-Memory-Fake und müssen schnell scheitern
 *   (vitest-Default 5s).
 * - Die LIVE-Suite spricht mit einem echten Server: jeder Fall baut
 *   Sessions und Realtime-Kanäle auf, spätere Fälle laufen unter der
 *   akkumulierten Last messbar langsamer (Gesamtdauer ~45s). Mit 5s kippten
 *   einzelne Fälle scheinbar zufällig, obwohl nichts hängt — 30s bilden die
 *   Netz-Realität ehrlich ab.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.live.test.ts"],
        },
      },
      {
        test: {
          name: "live",
          include: ["tests/**/*.live.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Ein Worker: parallele Dateien würden die Verbindungslast
          // zusätzlich hochtreiben.
          fileParallelism: false,
        },
      },
    ],
  },
})
