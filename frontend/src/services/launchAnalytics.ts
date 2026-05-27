import { api } from '../api/client'
import { reportFrontendPerf } from './monitoring'

export type LaunchEventName =
  | 'open_app'
  | 'signup_complete'
  | 'account_linked'
  | 'first_game_imported'
  | 'first_analysis_completed'
  | 'review_session_started'
  | 'second_session_within_7d'
  | 'training_plan_beta_opened'

interface LaunchEventOptions {
  oncePerSessionKey?: string
  onceEverKey?: string
}

const SESSION_ID_KEY = 'deepmove_launch_session_id'
const SESSION_EVENT_PREFIX = 'deepmove_launch_session_event:'
const EVER_EVENT_PREFIX = 'deepmove_launch_ever_event:'
const REVIEW_SESSION_HISTORY_KEY = 'deepmove_review_session_history'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function getSessionId(): string {
  const storage = getSessionStorage()
  if (!storage) return 'server-render'
  const existing = storage.getItem(SESSION_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID()
  storage.setItem(SESSION_ID_KEY, next)
  return next
}

function wasSentThisSession(key: string | undefined): boolean {
  if (!key) return false
  const storage = getSessionStorage()
  return storage?.getItem(`${SESSION_EVENT_PREFIX}${key}`) === '1'
}

function markSentThisSession(key: string | undefined): void {
  if (!key) return
  getSessionStorage()?.setItem(`${SESSION_EVENT_PREFIX}${key}`, '1')
}

function wasSentEver(key: string | undefined): boolean {
  if (!key) return false
  const storage = getStorage()
  return storage?.getItem(`${EVER_EVENT_PREFIX}${key}`) === '1'
}

function markSentEver(key: string | undefined): void {
  if (!key) return
  getStorage()?.setItem(`${EVER_EVENT_PREFIX}${key}`, '1')
}

export async function trackLaunchEvent(
  name: LaunchEventName,
  properties: Record<string, unknown> = {},
  options: LaunchEventOptions = {},
): Promise<void> {
  if (wasSentThisSession(options.oncePerSessionKey) || wasSentEver(options.onceEverKey)) {
    return
  }

  markSentThisSession(options.oncePerSessionKey)
  markSentEver(options.onceEverKey)

  reportFrontendPerf('launch_event', { name, ...properties })

  try {
    await api.post('/analytics/events', {
      name,
      session_id: getSessionId(),
      page: typeof window !== 'undefined' ? window.location.pathname : null,
      properties,
    }, { timeoutMs: 4000 })
  } catch {
    // Launch analytics should never block the product experience.
  }
}

export function trackReviewSessionWindow(): void {
  const storage = getStorage()
  if (!storage) return

  let history: number[] = []
  try {
    history = JSON.parse(storage.getItem(REVIEW_SESSION_HISTORY_KEY) ?? '[]') as number[]
  } catch {
    history = []
  }

  const now = Date.now()
  const recent = history.filter(timestamp => now - timestamp <= SEVEN_DAYS_MS)
  recent.push(now)
  storage.setItem(REVIEW_SESSION_HISTORY_KEY, JSON.stringify(recent.slice(-10)))

  if (recent.length >= 2) {
    void trackLaunchEvent('second_session_within_7d', {}, { onceEverKey: 'second_session_within_7d' })
  }
}
