// What the app shows when things go wrong outside the user's control: a slow (sleeping) server,
// no connection, or a bug in a screen. Each says what is happening and what to do, in plain words.
import { Component, useEffect, useState } from 'react'
import { serverEvents } from './api.js'

export function ServerStatus() {
  const [slow, setSlow] = useState(false)
  const [online, setOnline] = useState(navigator.onLine !== false)
  const [since, setSince] = useState(0)
  useEffect(() => {
    const onChange = (e) => setSlow(e.detail.slow)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    serverEvents.addEventListener('change', onChange)
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => {
      serverEvents.removeEventListener('change', onChange)
      removeEventListener('online', up)
      removeEventListener('offline', down)
    }
  }, [])
  // Count the seconds while waiting, so a long wake-up visibly progresses.
  useEffect(() => {
    if (!slow) return setSince(0)
    const start = Date.now()
    const t = setInterval(() => setSince(Math.round((Date.now() - start) / 1000) + 2), 1000)
    return () => clearInterval(t)
  }, [slow])

  if (!online) {
    return (
      <div role="status" className="toast-in fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-lg border-2 border-ink bg-ink px-4 py-3 text-sm text-paper shadow-print print:hidden">
        <span className="font-semibold">You are offline.</span> What you have typed stays on this page. Actions will work again once you reconnect.
      </div>
    )
  }
  if (!slow) return null
  return (
    <div role="status" aria-live="polite" className="toast-in fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-lg border-2 border-ink bg-card px-4 py-3 text-sm shadow-print print:hidden">
      <span aria-hidden="true" className="spinner shrink-0 text-primary" />
      <span>
        <span className="font-semibold">{since < 8 ? 'Still working…' : 'Waking the server…'}</span>{' '}
        {since < 8 ? 'This is taking a little longer than usual.' : 'The free server sleeps when nobody has used it for a while. It takes up to a minute to start; your request will finish on its own.'}
        {since >= 8 && <span className="ml-1 tabular-nums text-muted">({since}s)</span>}
      </span>
    </div>
  )
}

// If a screen crashes, show a way out instead of a blank page. Nothing typed on the server is lost.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info?.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div role="alert" className="max-w-md rounded-xl border-2 border-ink bg-card p-6 shadow-print">
          <h1 className="font-display text-2xl font-bold">Something went wrong on this screen</h1>
          <p className="mt-2 text-muted">
            The page hit a problem it could not handle. Everything already saved is safe. Reloading usually fixes it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-md border-2 border-ink bg-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-print-sm"
              onClick={() => location.reload()}>Reload the page</button>
            <button className="rounded-md px-3.5 py-1.5 text-sm font-semibold hover:bg-black/5"
              onClick={() => { this.setState({ error: null }); location.assign('/') }}>Go to Drafts</button>
          </div>
          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer">Details for the team</summary>
            <pre className="mt-2 whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    )
  }
}
