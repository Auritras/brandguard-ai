import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { getAuth, setAuth } from './api.js'
import { Button } from './ui.jsx'
import Login from './pages/Login.jsx'
import Drafts from './pages/Drafts.jsx'
import NewDraft from './pages/NewDraft.jsx'
import DraftView from './pages/DraftView.jsx'
import Library from './pages/Library.jsx'
import Record from './pages/Record.jsx'


export default function App() {
  const [auth, setAuthState] = useState(getAuth())
  const navigate = useNavigate()

  const signIn = (a) => {
    setAuth(a)
    setAuthState(a)
    navigate('/')
  }
  const signOut = () => {
    setAuth(null)
    setAuthState(null)
    navigate('/')
  }

  if (!auth) return <Login onSignIn={signIn} />
  const user = auth.user
  const tab = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-paper text-ink' : 'text-white/85 hover:bg-white/10 hover:text-white'}`

  return (
    <div className="min-h-screen">
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
            <NavLink to="/" end className={tab}>
              Drafts
            </NavLink>
            <NavLink to="/library" className={tab}>
              Brand Library
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="font-semibold">
              {user.name.split(' (')[0]}
              <span className="hidden sm:inline"> ({user.name.split(' (')[1]}</span>
            </span>
            <Button kind="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-3 my-6 min-h-[calc(100vh-7.5rem)] max-w-7xl rounded-xl border-2 border-ink bg-paper px-5 py-8 shadow-print sm:mx-5 sm:px-8 xl:mx-auto print:m-0 print:min-h-0 print:bg-white print:border-0 print:p-0 print:shadow-none">
        <Routes>
          <Route path="/" element={<Drafts user={user} />} />
          <Route path="/new" element={<NewDraft />} />
          <Route path="/drafts/:id" element={<DraftView user={user} />} />
          <Route path="/drafts/:id/record" element={<Record user={user} />} />
          <Route path="/library" element={<Library user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
