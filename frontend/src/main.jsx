import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { applyTheme } from './theme.js'

applyTheme()
import App from './App.jsx'
import { ErrorBoundary, ServerStatus } from './Resilience.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <ServerStatus />
    </BrowserRouter>
  </StrictMode>,
)
