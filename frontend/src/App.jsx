import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, getAuth, getDemoToken, setAuth, setDemoToken } from './api.js'
import { ErrorBoundary } from './Resilience.jsx'
import { usePoll } from './poll.js'
import Tour, { tourDone } from './Tour.jsx'
import CommandMenu from './CommandMenu.jsx'
import { DEMO_BRANDS, DemoMenu, PersonMenu } from './HeaderMenus.jsx'
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
import Bulk from './pages/Bulk.jsx'



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
  // The waiting badge also updates by itself when a teammate sends something your way.
  usePoll(() => { if (auth) api('/waiting').then((w) => setWaiting(w.count)).catch(() => {}) }, 10000, [auth?.token])

  // The tour opens by itself the first time someone uses a demo copy or a new brand, once per role.
  const [touring, setTouring] = useState(false)
  // Only on the Drafts page, once its drafts have loaded (not over another page or a loading draft).
  useEffect(() => {
    if (!auth?.user || touring || location.pathname !== '/' || tourDone(auth.user)) return
    let t = setTimeout(function wait() {
      if (document.querySelector('[data-tour="drafts"][data-loaded="true"]')) setTouring(true)
      else t = setTimeout(wait, 300)
    }, 900)
    return () => clearTimeout(t)
  }, [auth?.user?.id, auth?.user?.role, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = () => setTouring(true)
    addEventListener('bg-tour', open)
    return () => removeEventListener('bg-tour', open)
  }, [])

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

  // "Act as" buttons elsewhere (the Team page) ask for a switch with an event.
  useEffect(() => {
    const act = (e) => switchTo('/demo/switch', e.detail)
    addEventListener('bg-act-as', act)
    return () => removeEventListener('bg-act-as', act)
  }) // re-bound every render so it always uses the current sign-in

  // A shared review record opens for anyone with the link, signed in or not.
  if (location.pathname.startsWith('/share/')) {
    return (
      <main className="mx-3 my-6 max-w-7xl rounded-xl border-2 border-ink bg-paper px-5 py-8 shadow-print sm:mx-5 sm:px-8 xl:mx-auto print:m-0 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <Routes><Route path="/share/:id" element={<Record shared />} /></Routes>
      </main>
    )
  }
  if (!auth) return <Login onSignIn={signIn} signedOut={signedOut} />
  const user = auth.user

  return (
    <div className={`min-h-screen ${leaving ? 'app-out' : ''}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="bg-ink text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-3 py-1.5 sm:px-5">
          <Link to="/" aria-label="BrandGuard AI, go to drafts" className="flex min-h-11 items-center gap-2 font-display text-xl font-bold sm:min-h-0">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded" />
            <span className="hidden lg:inline">BrandGuard AI</span>
          </Link>
          <MainNav waiting={waiting} />
          <div className="ml-auto flex items-center gap-1 text-sm">
            <button onClick={() => dispatchEvent(new Event('bg-command'))} title="Go to a page or draft (Ctrl+K)"
              className="hidden rounded-md border border-white/25 px-2 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 xl:inline-flex">
              Go to… <kbd className="ml-1.5 font-sans text-white/60">Ctrl K</kbd>
            </button>
            {demoBusy && (
              <span role="status" className="flex items-center gap-2 px-2 text-sm font-semibold text-white/85">
                <span aria-hidden="true" className="spinner" />
                {demoBusy === 'compare' ? `Opening ${DEMO_BRANDS[user.demo_key === 'lumio' ? 'fizzbox' : 'lumio']}…` : demoBusy === 'restart' ? 'Making a fresh copy…' : 'Switching…'}
              </span>
            )}
            {user.sandbox && (
              <DemoMenu key={user.email} user={user} busy={demoBusy}
                onRestart={() => switchTo('/demo/start', user.role, 'Fresh copy ready: everything is back to the start.')}
                onCompare={(brand) => switchTo('/demo/switch', user.role, '', brand)} />
            )}
            <PersonMenu user={user} busy={demoBusy} onSwitch={(role) => switchTo('/demo/switch', role)} onSignOut={signOut} />
          </div>
        </div>
      </header>
      {demoNote && !demoBusy && (
        <p role="status" className="toast-in fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-lg border-2 border-ink bg-card px-4 py-3 text-sm font-semibold shadow-print print:hidden">
          {demoNote}
        </p>
      )}
      <Tour key={`${user.id}-${user.role}`} user={user} open={touring} onClose={() => setTouring(false)} />
      <CommandMenu onTour={() => setTouring(true)} />
      <main id="main" aria-busy={!!demoBusy} className={`${demoBusy ? 'pointer-events-none opacity-50' : ''} transition-opacity duration-300 mx-3 my-6 min-h-[calc(100vh-7.5rem)] max-w-7xl rounded-xl border-2 border-ink bg-paper px-5 py-8 shadow-print sm:mx-5 sm:px-8 xl:mx-auto print:m-0 print:min-h-0 print:bg-white print:border-0 print:p-0 print:shadow-none`}>
        {/* Each screen fades up when you move to it; filters on the same screen do not count. It is also
            keyed by who is signed in, so switching person or demo brand reloads the screen's data. */}
        <div key={`${location.pathname}:${user.id}`} className="page-in">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Drafts user={user} />} />
          <Route path="/new" element={<NewDraft user={user} />} />
          <Route path="/check-many" element={<Bulk />} />
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

// The main links. On a phone they scroll sideways on their own row, with a fade at whichever edge has more.
function MainNav({ waiting }) {
  const ref = useRef(null)
  const [more, setMore] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    addEventListener('resize', measure)
    return () => { el.removeEventListener('scroll', measure); removeEventListener('resize', measure) }
  }, [])
  // The highlight behind the current page slides to the next one instead of jumping.
  const location = useLocation()
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = ref.current?.querySelector('[aria-current="page"]')
      setPill(a ? { left: a.offsetLeft, top: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight } : null)
    }
    place()
    addEventListener('resize', place)
    return () => removeEventListener('resize', place)
  }, [location.pathname])
  const tab = ({ isActive }) =>
    `relative z-10 flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-semibold transition-colors duration-300 sm:min-h-9 ${isActive ? 'text-ink' : 'text-white/85 hover:bg-white/10 hover:text-white'}`
  return (
    <div className="relative order-last -mx-3 w-[calc(100%+1.5rem)] sm:order-none sm:mx-0 sm:w-auto sm:min-w-0 sm:flex-1">
      <nav ref={ref} aria-label="Main" className="relative flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:px-0 sm:pb-0">
        {pill && <span aria-hidden="true" className="nav-pill absolute rounded-md bg-paper" style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} />}
        <NavLink to="/" end className={tab} data-tour="nav-drafts" aria-label={waiting ? `Drafts, ${waiting} waiting for you` : 'Drafts'}>
          Drafts
          {waiting > 0 && (
            <span key={waiting} aria-hidden="true" className="roll-in ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-white">
              {waiting}
            </span>
          )}
        </NavLink>
        <NavLink to="/insights" className={tab} data-tour="nav-insights">Brand health</NavLink>
        <NavLink to="/library" className={tab} data-tour="nav-library">Brand Library</NavLink>
        <NavLink to="/reliability" className={tab} data-tour="nav-reliability">Reliability</NavLink>
        <NavLink to="/team" className={tab}>Team</NavLink>
      </nav>
      {more.left && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-ink to-transparent" />}
      {more.right && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink to-transparent" />}
    </div>
  )
}
