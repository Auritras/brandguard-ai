import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Card, ErrorNote } from '../ui.jsx'

const ROLE_HELP = {
  creator: 'Writes a draft, runs the check, fixes or disputes findings.',
  manager: 'Reviews the draft, comments, approves or asks for changes.',
  reviewer: 'Owns the Brand Library. Decides high-risk findings and waivers.',
}

// Kept between visits to this page, so signing out does not wait for the server again.
let cachedDemo = null

export default function Login({ onSignIn, signedOut }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(cachedDemo)

  useEffect(() => {
    if (cachedDemo) return
    api('/health')
      .then((h) => setDemo((cachedDemo = h.demo)))
      .catch((e) => setError(e.message))
  }, [])

  const signIn = async (e, p) => {
    setBusy(true)
    setError('')
    try {
      onSignIn(await api('/auth/login', { method: 'POST', body: { email: e, password: p } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page-in mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-2">
      <div>
        <svg viewBox="0 0 32 32" aria-hidden="true" className="logo-draw h-14 w-14 rounded-md border-2 border-ink shadow-print-sm">
          <rect width="32" height="32" fill="#2f3bd9" />
          <path className="logo-shield" pathLength="1" d="M16 5l9 4v7c0 6-4 9-9 11-5-2-9-5-9-11V9z" fill="#d9552f" stroke="#f3f0e2" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-5 font-display text-6xl font-extrabold leading-none">BrandGuard AI</h1>
        <p className="mt-5 max-w-md text-lg">
          Check a post, email or document against your approved brand rules and facts before it is published. Every
          issue names the rule it breaks and suggests a fix. People make the final approval.
        </p>
        <p className="mt-6 max-w-md text-sm text-ink/80">
          The demo uses a fictional brand, Lumio Payroll. All rules, facts and sample content are made up for this
          demo.
        </p>
      </div>

      <Card heavy className="p-6">
        {signedOut && <p role="status" className="mb-4 rounded-md bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-deep">You've signed out. Pick an account to carry on.</p>}
        <h2 className="font-display text-2xl font-bold">Try it as…</h2>
        <p className="mt-1 text-sm text-muted">Three demo accounts, one per role. Pick one to sign in.</p>
        <div className="mt-4 grid gap-2">
          {(demo?.accounts || []).map((a) => (
            <button
              key={a.email}
              disabled={busy}
              onClick={() => signIn(a.email, demo.password)}
              className="rounded-md border-2 border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft disabled:opacity-50"
            >
              <span className="block font-semibold">{a.name}</span>
              <span className="block text-sm text-muted">{ROLE_HELP[a.role]}</span>
            </button>
          ))}
          {!demo && !error && <p className="text-sm text-muted">Loading demo accounts… the free server can take up to a minute to wake.</p>}
        </div>

        <ErrorNote>{error}</ErrorNote>
        <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
          There is no public sign-up. In a real workspace the brand owner adds each person with their role.
        </p>
      </Card>
    </main>
  )
}
