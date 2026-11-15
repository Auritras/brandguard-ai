import { useEffect, useState } from 'react'
import { api, getDemoToken, setDemoToken } from '../api.js'
import { Button, Card, ErrorNote, Field, inputCls } from '../ui.jsx'

const ROLE_HELP = {
  creator: 'Writes a draft, runs the check, fixes or disputes findings.',
  manager: 'Reviews the draft, comments, approves or asks for changes.',
  reviewer: 'Owns the Brand Library. Decides high-risk findings and waivers.',
}

const TABS = [
  ['demo', 'Try the demo'],
  ['signin', 'Sign in'],
  ['signup', 'Create a brand'],
]

// Kept between visits to this page, so signing out does not wait for the server again.
let cachedDemo = null

export default function Login({ onSignIn, signedOut }) {
  const [tab, setTab] = useState('demo')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoInfo, setDemo] = useState(cachedDemo)
  const [form, setForm] = useState({ brand: '', name: '', email: '', password: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  useEffect(() => {
    if (cachedDemo) return
    api('/health')
      .then((h) => setDemo((cachedDemo = h.demo)))
      .catch((e) => setError(e.message))
  }, [])

  const go = async (path, body) => {
    setBusy(true)
    setError('')
    try {
      onSignIn(await api(path, { method: 'POST', body }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  // Try the demo: carry on in this browser's private copy if it still exists, else make a new one.
  const demo = async (role, fresh = false) => {
    setBusy(true)
    setError('')
    try {
      let a = null
      const saved = getDemoToken()
      if (saved && !fresh) a = await api('/demo/switch', { method: 'POST', body: { role }, token: saved }).catch(() => null)
      if (!a) a = await api('/demo/start', { method: 'POST', body: { role } })
      setDemoToken(a.token)
      onSignIn(a)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const hasCopy = !!getDemoToken()
  const pick = (k) => {
    setTab(k)
    setError('')
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
          The demo uses a fictional brand, Lumio Payroll. All its rules, facts and sample content are made up. Or create
          your own brand: it is private to you and the teammates you add.
        </p>
      </div>

      <Card heavy className="p-6">
        {signedOut && <p role="status" className="mb-4 rounded-md bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-deep">You've signed out. Pick how to carry on.</p>}
        <div role="tablist" aria-label="How to sign in" className="grid grid-cols-3 gap-1 rounded-lg border-2 border-line bg-white p-1">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)}
              className={`rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${tab === k ? 'bg-ink text-paper' : 'hover:bg-black/5'}`}>
              {label}
            </button>
          ))}
        </div>

        <div key={tab} className="step-in mt-5">
          {tab === 'demo' && (
            <>
              <p className="text-sm text-muted">
                {hasCopy
                  ? 'Carry on in your private copy of the Lumio Payroll demo. Pick who to be; you can switch at any time.'
                  : 'You get your own private copy of the Lumio Payroll demo: 13 drafts at every stage. Pick who to be; you can switch at any time.'}
              </p>
              <div className="mt-3 grid gap-2">
                {(demoInfo?.accounts || []).map((a) => (
                  <button key={a.role} disabled={busy} onClick={() => demo(a.role)}
                    className="rounded-md border-2 border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft disabled:opacity-50">
                    <span className="block font-semibold">{a.name}</span>
                    <span className="block text-sm text-muted">{ROLE_HELP[a.role]}</span>
                  </button>
                ))}
                {!demoInfo && !error && <p className="text-sm text-muted">Loading demo accounts… the free server can take up to a minute to wake.</p>}
                {busy && <p role="status" className="text-sm text-muted">Setting up your copy…</p>}
              </div>
              {hasCopy && (
                <button className="mt-3 text-sm font-semibold text-primary hover:underline" disabled={busy} onClick={() => demo('creator', true)}>
                  Start a fresh copy instead
                </button>
              )}
            </>
          )}

          {tab === 'signin' && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); go('/auth/login', { email: form.email, password: form.password }) }}>
              <p className="text-sm text-muted">For your own brand, or an account your brand owner made for you.</p>
              <Field label="Email">
                <input className={inputCls} type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
              </Field>
              <Field label="Password">
                <input className={inputCls} type="password" autoComplete="current-password" required value={form.password} onChange={set('password')} />
              </Field>
              <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
            </form>
          )}

          {tab === 'signup' && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); go('/auth/signup', form) }}>
              <p className="text-sm text-muted">
                You become the brand owner. Your Brand Library starts with sample rules you can change, and you add your
                team afterwards. No other brand can see your content.
              </p>
              <Field label="Brand name">
                <input className={inputCls} required minLength={2} value={form.brand} onChange={set('brand')} placeholder="e.g. Acme Tea" />
              </Field>
              <Field label="Your name">
                <input className={inputCls} required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} />
              </Field>
              <Field label="Email">
                <input className={inputCls} type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
              </Field>
              <Field label="Password" hint="At least 8 characters.">
                <input className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
              </Field>
              <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create brand and sign in'}</Button>
            </form>
          )}
          <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        </div>
      </Card>
    </main>
  )
}
