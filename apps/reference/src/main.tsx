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
import { loadRuntimeConfig, applyBranding, ErrorBoundary, type ErrorFallbackProps } from '@real-life-stack/toolkit'

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

/**
 * Wurzel-Fehleranzeige. Bewusst OHNE „Erneut versuchen": auf dieser Ebene ist
 * der ganze Baum hin, und ein Zurücksetzen würde denselben Fehler sofort
 * wiederholen. Ein Neuladen ist die einzige Handlung, die hier etwas ändert.
 */
function renderAppError({ error }: ErrorFallbackProps) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base font-medium">Die App konnte nicht geladen werden</p>
      <p className="max-w-sm break-words font-mono text-xs text-muted-foreground">{error.message}</p>
      <button
        type="button"
        className="mt-2 rounded-md border px-3 py-1.5 text-sm"
        onClick={() => window.location.reload()}
      >
        Neu laden
      </button>
    </div>
  )
}

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
      {/* Auffangnetz um die Wurzel. Die feinen Grenzen sitzen weiter innen
          (Dialog-Familie, Modul-Flächen) und halten den Ausfall lokal; kommt
          ein Fehler bis hierher, ist der Baum ohnehin verloren, und die Wahl
          steht nur noch zwischen einer Meldung und einer weissen Seite. */}
      <ErrorBoundary label="Die App" fallback={renderAppError}>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void start()
