import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './stores/prefsStore' // initialize early so theme applies before first render

// ── OAuth redirect handling ───────────────────────────────────────────────────
// Runs synchronously before React renders.
//
// Success: backend redirects to /#at=<access_token>
//   → stash the token in sessionStorage, clear the hash
//   → App.tsx picks it up and calls bootstrapFromOAuth() instead of refresh()
//
// Error: backend redirects to /?oauth_error=1
//   → stash flag in sessionStorage, clean URL
//   → UserMenu opens the auth modal automatically with an error message
const _hash = window.location.hash
if (_hash.startsWith('#at=')) {
  const _at = _hash.slice(4)
  if (_at) {
    sessionStorage.setItem('dm_oauth_at', _at)
    window.history.replaceState({}, '', window.location.pathname)
  }
} else {
  const _params = new URLSearchParams(window.location.search)
  if (_params.get('oauth_error') === '1') {
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
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
