// The two menus at the right of the one-row header: who you are (and, in the demo, who to act as), and
// the demo's own actions. Each is a button that opens a small panel; Esc, a click outside or a choice closes it.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export const DEMO_PEOPLE = {
  lumio: [['creator', 'Asha', 'Creator'], ['manager', 'Rohan', 'Manager'], ['reviewer', 'Meera', 'Brand owner']],
  fizzbox: [['creator', 'Kabir', 'Creator'], ['manager', 'Tara', 'Manager'], ['reviewer', 'Neel', 'Brand owner']],
}
export const DEMO_BRANDS = { lumio: 'Lumio Payroll', fizzbox: 'Fizzbox' }
const ROLE_LABEL = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }

// Touch-sized on phones (44px), compact from the small breakpoint up.
const ITEM = 'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold hover:bg-primary-soft focus-visible:bg-primary-soft sm:min-h-9'

function Popover({ label, button, children, className = '', tour }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus() } }
    addEventListener('mousedown', away)
    addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button aria-expanded={open} aria-label={label} data-tour={tour} onClick={() => setOpen(!open)}
        className={`flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-semibold hover:bg-white/10 sm:min-h-9 ${open ? 'bg-white/10' : ''} ${className}`}>
        {button}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      </button>
      {open && (
        <div className="toast-in absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border-2 border-ink bg-card p-1.5 text-ink shadow-print">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function PersonMenu({ user, busy, onSwitch, onSignOut }) {
  const name = user.name.split(' (')[0]
  const key = user.demo_key || 'lumio'
  return (
    <Popover label={`Account menu: ${name}, ${ROLE_LABEL[user.role]}`} tour="act-as"
      button={<>
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-white">{name.slice(0, 1)}</span>
        <span>{name}</span>
        <span className="hidden font-normal text-white/70 md:inline">· {ROLE_LABEL[user.role]}</span>
      </>}>
      {(close) => (
        <>
          <div className="px-3 pb-2 pt-1.5">
            <p className="font-semibold">{name}</p>
            <p className="text-sm text-muted">{ROLE_LABEL[user.role]}, {user.brand || 'Lumio Payroll'}</p>
          </div>
          {user.sandbox && (
            <div role="group" aria-label="Act as" className="border-t border-line pt-1.5">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Act as</p>
              {DEMO_PEOPLE[key].map(([role, who, label]) => (
                <button key={role} aria-pressed={role === user.role} disabled={!!busy}
                  onClick={() => { close(); if (role !== user.role) onSwitch(role) }} className={ITEM}>
                  <span className="flex-1">{who} <span className="font-normal text-muted">· {label}</span></span>
                  {role === user.role && <span aria-hidden="true" className="font-bold text-primary">✓</span>}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 border-t border-line pt-1.5">
            <Link to="/account" onClick={close} className={ITEM}>Your account</Link>
            <button onClick={() => { close(); onSignOut() }} className={ITEM}>Sign out</button>
          </div>
        </>
      )}
    </Popover>
  )
}

export function DemoMenu({ user, busy, onRestart, onCompare }) {
  const [confirm, setConfirm] = useState(false)
  const key = user.demo_key || 'lumio'
  const other = key === 'lumio' ? 'fizzbox' : 'lumio'
  return (
    <Popover label="Demo menu" button={<span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary-soft" />Demo</span>}>
      {(close) => (
        <>
          <p className="px-3 pb-2 pt-1.5 text-sm">
            <span className="font-semibold">Your private copy of {DEMO_BRANDS[key]}.</span>{' '}
            <span className="text-muted">Nothing you do here reaches anyone else.</span>
          </p>
          <div className="border-t border-line pt-1.5">
            <button disabled={!!busy} className={ITEM} onClick={() => { close(); onCompare(other) }}>
              Compare with {DEMO_BRANDS[other]} <span aria-hidden="true">→</span>
            </button>
            <button className={ITEM} onClick={() => { close(); dispatchEvent(new Event('bg-tour')) }}>Take the tour</button>
            {confirm ? (
              <div className="rounded-md bg-primary-soft p-2">
                <p className="px-1 pb-2 text-sm">Lose your changes and start from the original demo?</p>
                <div className="flex gap-2">
                  <button disabled={!!busy} onClick={() => { setConfirm(false); close(); onRestart() }}
                    className="min-h-11 flex-1 rounded-md border-2 border-ink bg-ink px-3 text-sm font-semibold text-paper sm:min-h-9">Start over</button>
                  <button onClick={() => setConfirm(false)} className="min-h-11 flex-1 rounded-md px-3 text-sm font-semibold hover:bg-white sm:min-h-9">Keep</button>
                </div>
              </div>
            ) : (
              <button className={ITEM} onClick={() => setConfirm(true)}>Start over with a fresh copy</button>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}
