import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { checkForLiveUpdate } from './live-update'
import { prefetchMapLibre } from '@real-life-stack/toolkit/maplibre'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
