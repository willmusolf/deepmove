import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './stores/prefsStore' // initialize early so theme applies before first render

// ── Startup env validation ────────────────────────────────────────────────────
// Catch misconfigured Vercel/Render deployments before the first API call fails
// silently. Only enforced in non-development builds.
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error(
    '[DeepMove] VITE_API_URL is not set. Set it in your Vercel/Render environment variables.',
  )
}

// ── OAuth redirect handling ───────────────────────────────────────────────────
// Runs synchronously before React renders.
//
// Success: backend redirects to /?oauth_success=1
//   → stash a non-secret session hint, clean URL
//   → App.tsx performs the normal refresh-cookie bootstrap
//
// Error: backend redirects to /?oauth_error=1
//   → stash flag in sessionStorage, clean URL
//   → UserMenu opens the auth modal automatically with an error message
const _params = new URLSearchParams(window.location.search)
if (_params.get('oauth_success') === '1') {
  localStorage.setItem('dm_has_session', '1')
  window.history.replaceState({}, '', window.location.pathname)
} else if (_params.get('oauth_error') === '1') {
  sessionStorage.setItem('dm_oauth_error', '1')
  window.history.replaceState({}, '', window.location.pathname)
} else if (_params.get('link_success')) {
  // Account-link completed — stash the provider name so App.tsx can reload user
  sessionStorage.setItem('dm_link_success', _params.get('link_success')!)
  window.history.replaceState({}, '', window.location.pathname)
} else if (_params.get('link_error')) {
  sessionStorage.setItem('dm_link_error', _params.get('link_error')!)
  window.history.replaceState({}, '', window.location.pathname)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
