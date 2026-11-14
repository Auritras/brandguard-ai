import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { getAuth, setAuth } from './api.js'
import { Button } from './ui.jsx'
import Login from './pages/Login.jsx'
import Drafts from './pages/Drafts.jsx'
import NewDraft from './pages/NewDraft.jsx'
import DraftView from './pages/DraftView.jsx'
import Library from './pages/Library.jsx'


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
      <header className="border-b-2 border-ink bg-primary text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded border-2 border-ink" />
            BrandGuard AI
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/" end className={tab}>
              Drafts
            </NavLink>
            <NavLink to="/library" className={tab}>
              Brand Library
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>
              <span className="font-semibold">{user.name}</span>
            </span>
            <Button kind="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto my-6 max-w-7xl rounded-xl border-2 border-ink bg-paper px-5 py-8 shadow-print sm:mx-5 sm:px-8 xl:mx-auto">
        <Routes>
          <Route path="/" element={<Drafts user={user} />} />
          <Route path="/new" element={<NewDraft />} />
          <Route path="/drafts/:id" element={<DraftView user={user} />} />
          <Route path="/library" element={<Library user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
