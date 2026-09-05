import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './app/i18n'
import './index.css'
import { registerScioGeoServiceWorker } from './app/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerScioGeoServiceWorker()
