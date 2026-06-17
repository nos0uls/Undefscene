import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  resetKey: number
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    resetKey: 0
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, resetKey: 0 }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in boundary:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1
    }))
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div style={{
          padding: '24px',
          background: 'var(--bg-surface, #171a1f)',
          color: 'var(--status-error, #d9534f)',
          border: '1px solid var(--border-default, #383d47)',
          borderRadius: '8px',
          margin: '16px',
          fontFamily: 'sans-serif'
        }}>
          <h2 style={{ fontSize: '16px', marginBottom: '8px' }}>Something went wrong.</h2>
          <pre style={{
            fontSize: '12px',
            background: 'var(--bg-base, #111318)',
            padding: '12px',
            borderRadius: '4px',
            overflow: 'auto',
            color: 'var(--text-secondary, #8b949e)'
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '12px',
              padding: '6px 12px',
              background: 'var(--accent-default, #5e6ad2)',
              color: 'var(--text-inverse, #fff)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return (
      <div key={this.state.resetKey} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    )
  }
}
