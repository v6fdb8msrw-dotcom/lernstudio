import '@fontsource-variable/manrope/index.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/pages.css'

// Speicher nach Möglichkeit als dauerhaft markieren, damit der Browser den Zwischenspeicher nicht aufräumt
if (navigator.storage?.persist) {
  void navigator.storage.persisted().then((p) => (p ? undefined : navigator.storage.persist()))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
