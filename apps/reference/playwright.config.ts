import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Agent-Sandboxen haben kein /usr/bin/chromium; ein vorhandenes Chrome >= 137
// (Ed25519-WebCrypto) lässt sich hierüber einhängen, ohne die Config zu ändern.
const CHROMIUM_PATH = process.env.E2E_CHROMIUM_PATH ?? '/usr/bin/chromium'

const RELAY_PORT = 9787
const PROFILES_PORT = 9788
const VAULT_PORT = 9789

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  reporter: process.env.CI ? 'github' : 'list',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: CHROMIUM_PATH,
    },
    permissions: ['clipboard-read', 'clipboard-write'],
    locale: 'de-DE',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: CHROMIUM_PATH },
        locale: 'de-DE',
      },
    },
  ],

  webServer: {
    command: [
      `VITE_RELAY_URL=ws://localhost:${RELAY_PORT}`,
      `VITE_PROFILE_SERVICE_URL=http://localhost:${PROFILES_PORT}`,
      `VITE_VAULT_URL=http://localhost:${VAULT_PORT}`,
      `npx vite --port 5175`,
    ].join(' '),
    port: 5175,
    reuseExistingServer: false,
    timeout: 30_000,
    cwd: path.resolve(__dirname),
  },
})
