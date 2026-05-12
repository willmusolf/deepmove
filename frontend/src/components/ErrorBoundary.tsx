import React from 'react'
import { captureFrontendError } from '../services/monitoring'

interface State { hasError: boolean }

interface ErrorBoundaryProps {
  boundaryName?: string
  fallback?: React.ReactNode
  resetKey?: string | number
}

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren<ErrorBoundaryProps>,
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidUpdate(prevProps: Readonly<React.PropsWithChildren<ErrorBoundaryProps>>) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    captureFrontendError(error, {
      tags: { boundary: this.props.boundaryName ?? 'unknown' },
      extra: { componentStack: info.componentStack },
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', gap: '1rem', padding: '2rem' }}>
          <p style={{ margin: 0 }}>Something went wrong. Please reload.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1.5rem', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
