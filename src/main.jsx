import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'

// Stale-chunk guard: after a new Vercel deploy the old chunk hashes become 404.
// Detect the unhandled rejection and auto-reload once to pick up the new bundle.
;(function installChunkErrorGuard() {
  const KEY = '_sdash_chunk_reload'
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || ''
    const isChunk =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module')
    if (!isChunk) return
    event.preventDefault()
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1')
      window.location.reload()
    }
  })
  // Clear the flag once a full load succeeds so future errors still trigger a reload.
  window.addEventListener('load', () => sessionStorage.removeItem(KEY))
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
