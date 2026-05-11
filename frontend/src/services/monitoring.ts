import * as Sentry from '@sentry/react'

type MonitoringContext = {
  extra?: Record<string, unknown>
  tags?: Record<string, string | number | boolean>
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
let monitoringInitialized = false

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error('Unknown frontend error')
}

export function initMonitoring(): void {
  if (!sentryDsn || monitoringInitialized) {
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_COMMIT_SHA || undefined,
    sendDefaultPii: false,
  })

  monitoringInitialized = true
}

export function captureFrontendError(
  error: unknown,
  context: MonitoringContext = {},
): void {
  const normalizedError = normalizeError(error)

  if (monitoringInitialized) {
    Sentry.withScope(scope => {
      Object.entries(context.tags ?? {}).forEach(([key, value]) => {
        scope.setTag(key, String(value))
      })

      Object.entries(context.extra ?? {}).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })

      Sentry.captureException(normalizedError)
    })
  }

  if (import.meta.env.DEV || !sentryDsn) {
    console.error('[frontend-monitoring]', normalizedError, context)
  }
}
