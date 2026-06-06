import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './services/analytics'

// Capture Google OAuth provider token directly from URL hash before Supabase client clears it
try {
  const hash = window.location.hash
  if (hash) {
    const params = new URLSearchParams(hash.substring(1))
    const providerToken = params.get('provider_token')
    if (providerToken) {
      localStorage.setItem('dhanrakshak_oauth_provider_token', providerToken)
    }
  }
} catch (e) {
  console.warn('Failed to parse provider token from hash:', e)
}

// Initialize PostHog analytics before app renders
initAnalytics()

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('SW registration failed:', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
