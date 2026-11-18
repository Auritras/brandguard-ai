import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, getAuth, getDemoToken, setAuth, setDemoToken } from './api.js'
import { Button } from './ui.jsx'
import { ErrorBoundary } from './Resilience.jsx'
import Login from './pages/Login.jsx'
import Drafts from './pages/Drafts.jsx'
import NewDraft from './pages/NewDraft.jsx'
import DraftView from './pages/DraftView.jsx'
import Library from './pages/Library.jsx'
import Record from './pages/Record.jsx'
import Insights from './pages/Insights.jsx'
import Team from './pages/Team.jsx'
import Account from './pages/Account.jsx'
import Reliability from './pages/Reliability.jsx'


const ROLE_LABEL = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }

export default function App() {
  const [auth, setAuthState] = useState(getAuth())
  const navigate = useNavigate()
  const location = useLocation()

  const signIn = (a) => {
    setAuth(a)
    setAuthState(a)
    navigate('/')
  }
  // Refresh who is signed in (role or brand may have changed), and how many drafts wait for them.
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    if (!auth) return
    api('/me')
      .then(async (u) => {
        // A session in the demo template (from before private copies) moves into a fresh copy instead.
        if (u.demo_brand && !u.sandbox) {
          const a = await api('/demo/start', { method: 'POST', body: { role: u.role, brand: u.demo_key || 'lumio' } })
          setDemoToken(a.token, a.user.demo_key)
          setAuth(a)
          setAuthState(a)
          return
        }
        if (JSON.stringify(u) !== JSON.stringify(auth.user)) {
          const next = { ...auth, user: u }
          setAuth(next)
          setAuthState(next)
        }
      })
      .catch(() => {})
  }, [auth?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!auth) return
    api('/waiting').then((w) => setWaiting(w.count)).catch(() => {})
  }, [auth?.token, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const [leaving, setLeaving] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  // Fade the workspace out, then show the sign-in page (straight away if motion is reduced).
  const signOut = () => {
    setLeaving(true)
    const wait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
    setTimeout(() => {
      setAuth(null)
      setAuthState(null)
      setLeaving(false)
      setSignedOut(true)
      navigate('/')
    }, wait)
  }

  // Inside a demo copy: become someone else in the same copy, or start a new copy.
  const [demoBusy, setDemoBusy] = useState('') // 'switch' | 'restart' while the server works
  const [demoNote, setDemoNote] = useState('')
  const switchTo = async (path, role, note, brand) => {
    setDemoBusy(brand ? 'compare' : path.endsWith('start') ? 'restart' : 'switch')
    setDemoNote('')
    try {
      let a = null
      if (brand) {
        // Jump to the other demo brand: carry on in this browser's copy of it, or make one.
        const saved = getDemoToken(brand)
        if (saved) a = await api('/demo/switch', { method: 'POST', body: { role }, token: saved }).catch(() => null)
        if (!a) a = await api('/demo/start', { method: 'POST', body: { role, brand } })
      } else {
        a = await api(path, { method: 'POST', body: { role, brand: auth.user.demo_key || 'lumio' } })
      }
      setDemoToken(a.token, a.user.demo_key)
      signIn(a)
      if (note) {
        setDemoNote(note)
        setTimeout(() => setDemoNote(''), 6000)
      }
    } catch (e) {
      setDemoNote(e.message)
    } finally {
      setDemoBusy('')
    }
  }

  if (!auth) return <Login onSignIn={signIn} signedOut={signedOut} />
  const user = auth.user
  const tab = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-paper text-ink' : 'text-white/85 hover:bg-white/10 hover:text-white'}`

  return (
    <div className={`min-h-screen ${leaving ? 'app-out' : ''}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="bg-ink text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded" />
            BrandGuard AI
          </Link>
          <nav aria-label="Main" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
            <NavLink to="/" end className={tab} aria-label={waiting ? `Drafts, ${waiting} waiting for you` : 'Drafts'}>
              Drafts
              {waiting > 0 && (
                <span key={waiting} aria-hidden="true" className="roll-in ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-white">
                  {waiting}
                </span>
              )}
            </NavLink>
            <NavLink to="/insights" className={tab}>
              Brand health
            </NavLink>
            <NavLink to="/library" className={tab}>
              Brand Library
            </NavLink>
            <NavLink to="/reliability" className={tab}>
              Reliability
            </NavLink>
            <NavLink to="/team" className={tab}>
              Team
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link to="/account" title="Your account" className="rounded px-1 font-semibold hover:bg-white/10">
              {user.name.split(' (')[0]}
              <span className="hidden font-normal text-white/70 sm:inline">
                {' · '}{ROLE_LABEL[user.role]}{user.brand ? `, ${user.brand}` : ''}
              </span>
            </Link>
            <Button kind="secondary" onClick={signOut} disabled={leaving}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      {user.sandbox && (
        // Keyed by the copy's account, so the bar starts closed in a new copy.
        <DemoBar key={user.email} user={user} busy={demoBusy} note={demoNote}
          onSwitch={(role) => switchTo('/demo/switch', role)}
          onRestart={() => switchTo('/demo/start', user.role, 'Fresh copy ready: everything is back to the start.')}
          onCompare={(brand) => switchTo('/demo/switch', user.role, '', brand)} />
      )}
      <main id="main" aria-busy={!!demoBusy} className={`${demoBusy ? 'pointer-events-none opacity-50' : ''} transition-opacity duration-300 mx-3 my-6 min-h-[calc(100vh-7.5rem)] max-w-7xl rounded-xl border-2 border-ink bg-paper px-5 py-8 shadow-print sm:mx-5 sm:px-8 xl:mx-auto print:m-0 print:min-h-0 print:bg-white print:border-0 print:p-0 print:shadow-none`}>
        {/* Each screen fades up when you move to it; filters on the same screen do not count. It is also
            keyed by who is signed in, so switching person or demo brand reloads the screen's data. */}
        <div key={`${location.pathname}:${user.id}`} className="page-in">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Drafts user={user} />} />
          <Route path="/new" element={<NewDraft user={user} />} />
          <Route path="/drafts/:id" element={<DraftView user={user} />} />
          <Route path="/drafts/:id/record" element={<Record user={user} />} />
          <Route path="/insights" element={<Insights user={user} />} />
          <Route path="/library" element={<Library user={user} />} />
          <Route path="/reliability" element={<Reliability user={user} />} />
          <Route path="/team" element={<Team user={user} />} />
          <Route path="/account" element={<Account user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}

const DEMO_PEOPLE = {
  lumio: [['creator', 'Asha', 'Creator'], ['manager', 'Rohan', 'Manager'], ['reviewer', 'Meera', 'Brand owner']],
  fizzbox: [['creator', 'Kabir', 'Creator'], ['manager', 'Tara', 'Manager'], ['reviewer', 'Neel', 'Brand owner']],
}
const DEMO_BRANDS = { lumio: 'Lumio Payroll', fizzbox: 'Fizzbox' }

// A slim bar for demo visitors: whose shoes they are in, and one click to be someone else.
function DemoBar({ user, busy, note, onSwitch, onRestart, onCompare }) {
  const [confirm, setConfirm] = useState(false)
  const key = user.demo_key || 'lumio'
  const other = key === 'lumio' ? 'fizzbox' : 'lumio'
  return (
    <div className="border-b-2 border-ink bg-accent-soft print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2 text-sm">
        <p className="font-semibold text-accent-deep">Your private copy of {DEMO_BRANDS[key]}</p>
        <div role="group" aria-label="Act as" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-muted">Act as</span>
          {DEMO_PEOPLE[key].map(([role, name, label]) => (
            <button key={role} disabled={!!busy} onClick={() => role !== user.role && onSwitch(role)} aria-pressed={role === user.role}
              className={`rounded-md border-2 px-2.5 py-1 font-semibold transition ${role === user.role ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-white hover:border-ink'}`}>
              {name} <span className={role === user.role ? 'text-paper/70' : 'text-muted'}>· {label}</span>
            </button>
          ))}
        </div>
        {busy === 'compare' ? (
          <span role="status" className="flex items-center gap-2 font-semibold text-primary">
            <span aria-hidden="true" className="spinner" /> Opening {DEMO_BRANDS[other]}…
          </span>
        ) : (
          <button disabled={!!busy} onClick={() => onCompare(other)} className="font-semibold text-primary hover:underline"
            title="The same role in the other demo brand, with its own rules">
            Compare with {DEMO_BRANDS[other]} →
          </button>
        )}
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          {busy === 'switch' && <span role="status" className="flex items-center gap-2 font-semibold text-accent-deep"><span aria-hidden="true" className="spinner" /> Switching…</span>}
          {note && !busy && <span role="status" className="font-semibold text-accent-deep">{note}</span>}
          {busy === 'restart' ? (
            <span role="status" className="flex items-center gap-2 rounded-md border-2 border-ink bg-ink px-2.5 py-1 font-semibold text-paper"><span aria-hidden="true" className="spinner" /> Making a fresh copy…</span>
          ) : confirm ? (
            <>
              <span className="text-muted">Lose your changes?</span>
              <button className="rounded-md border-2 border-ink bg-ink px-2.5 py-1 font-semibold text-paper" disabled={!!busy} onClick={onRestart}>Start over</button>
              <button className="px-2 py-1 font-semibold" onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : (
            !note && <button className="font-semibold text-accent-deep hover:underline" disabled={!!busy} onClick={() => setConfirm(true)}>Start over with a fresh copy</button>
          )}
        </div>
      </div>
    </div>
  )
}

