import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './stores/prefsStore' // initialize early so theme applies before first render

console.info(`[DeepMove] commit=${__DEEPMOVE_COMMIT_SHA__} build=${__DEEPMOVE_BUILD_TIME__}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
