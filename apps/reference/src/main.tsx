import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import 'leaflet/dist/leaflet.css'
import { checkForLiveUpdate } from './live-update'

// Check for OTA updates before rendering (no-op in browser/dev)
checkForLiveUpdate()

// Use VITE_BASE_PATH for GitHub Pages deployment
const basename = import.meta.env.VITE_BASE_PATH || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
