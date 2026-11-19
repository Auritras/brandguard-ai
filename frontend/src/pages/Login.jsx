import { useEffect, useState } from 'react'
import { api, getDemoToken, setDemoToken } from '../api.js'
import { Button, Card, ErrorNote, Field, inputCls } from '../ui.jsx'
import CompareBrands from '../CompareBrands.jsx'

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

// Numbers anyone can check, from the reliability runs on the public test drafts.
function Facts() {
  const [f, setF] = useState(null)
  useEffect(() => { api('/reliability/summary', { token: 'none' }).then(setF).catch(() => {}) }, [])
  const item = 'flex items-baseline gap-2'
  return (
    <ul className="order-4 grid content-start gap-x-6 gap-y-3 border-t-2 border-ink/20 pt-4 text-sm sm:grid-cols-2 md:order-none md:col-start-1 md:row-start-2">
      {f?.exact && <li className={item}><span className="font-display text-2xl font-bold">{f.exact.caught}/{f.exact.planted}</span> planted problems caught by the exact checks</li>}
      {f?.ai && <li className={item}><span className="font-display text-2xl font-bold">{f.ai.caught}/{f.ai.planted}</span> caught by the full check with AI</li>}
      {f && <li className={item}><span className="font-display text-2xl font-bold">{f.cases}</span> public test drafts, run on every change</li>}
    </ul>
  )
}

export default function Login({ onSignIn, signedOut }) {
  const [tab, setTab] = useState('demo')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoInfo, setDemo] = useState(cachedDemo)
  const [form, setForm] = useState({ brand: '', name: '', email: '', password: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // The free server may still be waking: keep asking every few seconds instead of giving up after one try.
  useEffect(() => {
    if (cachedDemo) return
    let gone = false
    let t
    const ask = () => api('/health')
      .then((h) => { if (!gone) { setDemo((cachedDemo = h.demo)); setError('') } })
      .catch(() => { if (!gone) t = setTimeout(ask, 4000) })
    ask()
    return () => { gone = true; clearTimeout(t) }
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
  const [demoBrand, setDemoBrand] = useState('lumio')
  const demo = async (role, fresh = false) => {
    setBusy(true)
    setError('')
    try {
      let a = null
      const saved = getDemoToken(demoBrand)
      if (saved && !fresh) a = await api('/demo/switch', { method: 'POST', body: { role }, token: saved }).catch(() => null)
      if (!a) a = await api('/demo/start', { method: 'POST', body: { role, brand: demoBrand } })
      setDemoToken(a.token, demoBrand)
      onSignIn(a)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const hasCopy = !!getDemoToken(demoBrand)
  const brands = demoInfo?.brands || []
  const chosen = brands.find((b) => b.key === demoBrand)
  const ABOUT = {
    lumio: 'Payroll software. Calm, plain and careful.',
    fizzbox: 'Soft drinks. Loud, playful and full of hype.',
  }
  const pick = (k) => {
    setTab(k)
    setError('')
  }

  return (
    // Above the fold on a laptop: the headline, one sentence and the live comparison on the left, the way in on
    // the right. On a phone: the headline, the way in, then the comparison.
    <main className="page-in mx-auto grid max-w-6xl gap-x-10 gap-y-6 px-5 py-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start md:py-6">
      <div className="order-1 md:order-none md:col-start-1 md:row-start-1">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="logo-draw h-12 w-12 shrink-0 rounded-md border-2 border-ink shadow-print-sm">
            <rect width="32" height="32" fill="#2f3bd9" />
            <path className="logo-shield" pathLength="1" d="M16 5l9 4v7c0 6-4 9-9 11-5-2-9-5-9-11V9z" fill="#d9552f" stroke="#f3f0e2" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <h1 className="font-display text-5xl font-extrabold leading-none sm:text-6xl">BrandGuard AI</h1>
        </div>
        <p className="mt-4 max-w-xl text-lg">
          Checks every post, email, document and image against your brand's rules and approved facts before it goes out.
          <span className="font-bold"> People make the final call.</span>
        </p>
      </div>

      <Card id="try-demo" heavy className="order-3 scroll-mt-4 p-5 md:order-none md:col-start-2 md:row-span-2 md:row-start-1">
        {signedOut && <p role="status" className="mb-4 rounded-md bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-deep">You've signed out. Pick how to carry on.</p>}
        <div role="tablist" aria-label="How to sign in" className="grid grid-cols-3 gap-1 rounded-lg border-2 border-line bg-white p-1">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)}
              className={`rounded-md px-2 py-1.5 text-sm font-semibold transition-colors ${tab === k ? 'border-2 border-ink bg-select text-paper shadow-[2px_2px_0_0_var(--color-ink)]' : 'border-2 border-transparent text-muted hover:bg-black/5 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div key={tab} className="step-in mt-5">
          {tab === 'demo' && (
            <>
              <div role="radiogroup" aria-label="Demo brand" className="grid grid-cols-2 gap-2">
                {brands.map((b) => (
                  <button key={b.key} role="radio" aria-checked={demoBrand === b.key} onClick={() => setDemoBrand(b.key)}
                    className={`relative rounded-md border-2 p-2.5 pr-8 text-left transition ${demoBrand === b.key ? 'border-ink bg-select text-paper shadow-[2px_2px_0_0_var(--color-ink)]' : 'border-line bg-white hover:border-ink'}`}>
                    <span className="block font-display font-bold">{b.name}</span>
                    <span className={`block text-xs ${demoBrand === b.key ? 'text-paper' : 'text-muted'}`}>{ABOUT[b.key]}</span>
                    {demoBrand === b.key && (
                      <span aria-hidden="true" className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-paper text-xs font-bold text-select">✓</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted">
                {hasCopy
                  ? `Carry on in your private copy of ${chosen?.name || 'the demo'}. Pick who to be; you can switch at any time.`
                  : `You get your own private copy of ${chosen?.name || 'the demo'}. Pick who to be; you can switch at any time.`}
              </p>
              <div className="mt-3 grid gap-2">
                {(chosen?.accounts || []).map((a) => (
                  <button key={a.role} disabled={busy} onClick={() => demo(a.role)}
                    className="group flex items-center gap-3 rounded-md border-2 border-ink bg-white px-3 py-2 text-left shadow-[2px_2px_0_0_var(--color-ink)] transition duration-100 hover:-translate-y-px hover:bg-primary-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{a.name}</span>
                      <span className="block text-[13px] leading-snug text-muted">{ROLE_HELP[a.role]}</span>
                    </span>
                    <span aria-hidden="true" className="text-lg font-bold text-primary transition-transform group-hover:translate-x-1">→</span>
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
      <Facts />
      {/* Full width under both, so each brand's result has room; on a phone it comes before the picker. */}
      <div className="order-2 md:order-none md:col-span-2 md:row-start-3">
        <CompareBrands onTryDemo={() => {
          const el = document.getElementById('try-demo')
          el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
          el?.querySelector('button')?.focus({ preventScroll: true })
        }} />
      </div>
      <p className="order-5 md:order-none md:col-span-2 md:row-start-4">
        <a href="https://github.com/Auritras/brandguard-ai" target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-2 underline-offset-4 hover:text-primary-deep sm:min-h-0">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 0z" /></svg>
          GitHub
        </a>
      </p>
    </main>
  )
}
