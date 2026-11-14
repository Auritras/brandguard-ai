import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, ErrorNote, Field, inputCls } from '../ui.jsx'

const ROLE_HELP = {
  creator: 'Writes a draft, runs the check, fixes or disputes findings.',
  manager: 'Reviews the draft, comments, approves or asks for changes.',
  reviewer: 'Owns the Brand Library. Decides high-risk findings and waivers.',
}

export default function Login({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(null)

  useEffect(() => {
    api('/health')
      .then((h) => setDemo(h.demo))
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
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-2">
      <div>
        <img src="/favicon.svg" alt="" className="h-14 w-14 rounded-md border-2 border-ink shadow-print-sm" />
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

      <Card className="p-6">
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

        <form
          className="mt-6 grid gap-3 border-t border-line pt-5"
          onSubmit={(ev) => {
            ev.preventDefault()
            signIn(email, password)
          }}
        >
          <p className="text-sm font-semibold">Or sign in with an email</p>
          <Field label="Email">
            <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button kind="primary" type="submit" disabled={busy}>
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  )
}
