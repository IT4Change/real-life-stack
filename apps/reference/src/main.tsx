import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
// Registers the app's type layer (statement) — must run before first render,
// so every surface resolves the same register (spec 06).
import './type-register'
// Registers the app's module surfaces (spec 01) — must run before first render.
import './module-register'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { checkForLiveUpdate } from './live-update'
import { prefetchMapLibre } from '@real-life-stack/toolkit/maplibre'
import { loadRuntimeConfig, applyBranding } from '@real-life-stack/toolkit'

// Check for OTA updates before rendering (no-op in browser/dev)
checkForLiveUpdate()

// Cold-start: warm the map's lazy maplibre-gl chunk + style during idle so the
// first map open is faster. No map/WebGL is created here; skipped on data-saver
// connections. (Re-opens are already instant via the kept-alive map instance.)
function warmMapOnIdle() {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return
  const run = () => void prefetchMapLibre()
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 1500)
}
warmMapOnIdle()

// Use VITE_BASE_PATH for GitHub Pages deployment
const basename = import.meta.env.VITE_BASE_PATH || '/'

// A data router (vs. the declarative <BrowserRouter>) so descendant components
// can use `useBlocker` to guard unsaved composer content against navigation.
// App keeps its own <Routes>; this is just a trivial splat route around it.
const router = createBrowserRouter([{ path: '*', element: <App /> }], { basename })

// Instanz-Konfiguration VOR dem ersten Render (Spec 11): eine App, die erst
// mit Standardwerten rendert und dann umschaltet, zeigt fremdes Branding und
// verbindet sich mit falschen Diensten. Die eingebauten VITE_-Werte sind
// Stufe 2 der Vorrangkette und bleiben fuer bestehende Builds wirksam.
async function start() {
  const config = await loadRuntimeConfig({
    baseUrl: basename,
    // Die App kennt ihre Connector-Ids (siehe createConnector in App.tsx).
    // Ohne diese Liste liefe ein Tippfehler in der Instanz-Konfiguration im
    // Mock-Connector auf — die Instanz zeigte Demo-Daten statt ihres Netzes.
    allowedConnectors: ["wot", "local", "supabase", "mock"],
    buildTimeEnv: {
      relayUrl: import.meta.env.VITE_RELAY_URL,
      profilesUrl: import.meta.env.VITE_PROFILE_SERVICE_URL,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      defaultConnector: import.meta.env.VITE_DEFAULT_CONNECTOR,
    },
  })
  applyBranding(config.branding)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
