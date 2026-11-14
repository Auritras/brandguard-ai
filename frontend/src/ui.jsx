// Small shared building blocks so every screen looks the same.
import { useEffect, useRef, useState } from 'react'

// Buttons sit on a small printed shadow and press down into it when clicked.
const PRESS = 'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:translate-x-0 disabled:translate-y-0'
export function Button({ kind = 'secondary', className = '', ...props }) {
  const kinds = {
    primary: `bg-primary text-white border-ink shadow-print-sm hover:bg-primary-deep ${PRESS}`,
    secondary: `bg-card text-ink border-ink shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-primary-soft ${PRESS}`,
    dark: `bg-ink text-paper border-ink shadow-[2px_2px_0_0_var(--color-primary)] hover:bg-primary-deep ${PRESS}`,
    ghost: 'bg-transparent text-ink hover:bg-black/5 border-transparent active:bg-black/10',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md border-2 px-3.5 py-1.5 text-sm font-semibold transition duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${className}`}
    />
  )
}

// Cards inside the page sheet are quiet; `heavy` is for surfaces that stand alone (the login card).
export function Card({ heavy = false, className = '', ...props }) {
  const look = heavy ? 'border-2 border-ink shadow-print' : 'border-2 border-line'
  return <div {...props} className={`rounded-lg bg-card ${look} ${className}`} />
}

// Status uses the palette only: blue tints while it moves through review, orange when it is
// back with the creator, ink once approved. Red, yellow and grey stay reserved for severity.
const STATUS = {
  draft: ['Draft', 'bg-black/5 text-ink'],
  in_review: ['In review', 'bg-primary-soft text-primary-deep'],
  changes_requested: ['Changes requested', 'bg-accent-soft text-accent-deep'],
  authorised_review: ['Authorised review', 'bg-primary text-white'],
  approved: ['Approved', 'bg-ink text-paper'],
}

export function StatusChip({ status }) {
  const [label, cls] = STATUS[status] || [status, 'bg-black/5 text-ink']
  return <span className={`inline-block rounded-full border border-current/25 px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

export const SEVERITY = {
  high: { label: 'High', chip: 'bg-red-50 text-red-800 border-red-200', mark: 'mark-high' },
  medium: { label: 'Medium', chip: 'bg-yellow-100 text-yellow-900 border-yellow-300', mark: 'mark-medium' },
  low: { label: 'Low', chip: 'bg-slate-100 text-slate-700 border-slate-200', mark: 'mark-low' },
}

export function Chip({ className = '', children }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-md border-2 border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-primary focus:outline-none'

// For decisions that matter: press and hold until the button fills, then a short countdown with
// Undo before anything is sent. Works with a mouse, touch, or by holding Enter or Space.
export function HoldButton({ kind = 'primary', ms = 1100, undoSeconds = 4, pendingLabel = 'Sending', disabled, onConfirm, onPhase, children }) {
  const [phase, setPhase] = useState('idle') // idle | holding | pending
  const [left, setLeft] = useState(0)
  const hold = useRef()
  const tick = useRef()
  useEffect(() => () => { clearTimeout(hold.current); clearInterval(tick.current) }, [])
  useEffect(() => { onPhase?.(phase) }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (disabled || phase !== 'idle') return
    setPhase('holding')
    hold.current = setTimeout(() => {
      let n = undoSeconds
      setLeft(n)
      setPhase('pending')
      tick.current = setInterval(() => {
        n -= 1
        setLeft(n)
        if (n <= 0) {
          clearInterval(tick.current)
          setPhase('idle')
          onConfirm()
        }
      }, 1000)
    }, ms)
  }
  const stop = () => {
    clearTimeout(hold.current)
    setPhase((p) => (p === 'holding' ? 'idle' : p))
  }
  const undo = () => {
    clearInterval(tick.current)
    setPhase('idle')
  }

  if (phase === 'pending') {
    return (
      <span role="status" className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-ink py-1 pl-3 pr-1 text-sm font-semibold text-paper">
        {pendingLabel} in {left}s
        <button autoFocus onClick={undo} className="rounded bg-paper px-2.5 py-0.5 text-ink hover:bg-primary-soft">Undo</button>
      </span>
    )
  }
  return (
    <Button kind={kind} disabled={disabled}
      aria-label={`${typeof children === 'string' ? children : 'Confirm'}: press and hold`}
      className="hold relative touch-none select-none overflow-hidden"
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start() } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') stop() }}>
      <span aria-hidden="true" className={`hold-fill ${phase === 'holding' ? 'is-holding' : ''}`} style={{ '--hold': `${ms}ms` }} />
      <span className="relative">{phase === 'holding' ? 'Keep holding…' : children}</span>
    </Button>
  )
}

// Counts up from zero to a value like 15, "7%" or "3.5 h". Anything that is not a number shows as is.
export function CountUp({ value, ms = 900 }) {
  const m = String(value).match(/^(\d+(?:\.\d+)?)(.*)$/)
  const target = m ? Number(m[1]) : 0
  const decimals = m && m[1].includes('.') ? 1 : 0
  const [shown, setShown] = useState(m ? 0 : value)
  useEffect(() => {
    if (!m || matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value)
    let frame
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - (1 - t) ** 3
      setShown(`${(target * eased).toFixed(decimals)}${m[2]}`)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const done = setTimeout(() => setShown(value), ms + 150) // in case frames are paused (background tab)
    return () => { cancelAnimationFrame(frame); clearTimeout(done) }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{shown}</>
}

// A number that rolls in from above whenever it changes.
export function RollNumber({ value }) {
  const first = useRef(true) // no roll on the first render, only on a change
  useEffect(() => { first.current = false }, [])
  return <span key={value} className={`${first.current ? '' : 'roll-in'} inline-block tabular-nums`}>{value}</span>
}

// A button that first asks for a written reason, then calls onSubmit(reason).
export function ReasonButton({ label, placeholder, kind = 'secondary', confirmLabel = 'Confirm', onSubmit, initial = '', hold = false, pendingLabel = 'Sending' }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false) // the reason cannot change once the hold has started
  if (!open) {
    return (
      <Button kind={kind} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }
  return (
    <div className="w-full rounded-md border-2 border-ink bg-white p-3">
      <label className="block text-sm font-semibold">
        {label}
        <textarea
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={locked}
          placeholder={placeholder}
          className={`${inputCls} mt-1 font-normal`}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hold ? (
          <HoldButton kind="dark" disabled={busy || text.trim().length < 3} pendingLabel={pendingLabel}
            onPhase={(p) => setLocked(p !== 'idle')}
            onConfirm={async () => {
              setBusy(true)
              try {
                await onSubmit(text.trim())
                setOpen(false)
              } finally {
                setBusy(false)
              }
            }}>
            {`Hold to ${confirmLabel.charAt(0).toLowerCase()}${confirmLabel.slice(1)}`}
          </HoldButton>
        ) : (
        <Button
          kind="dark"
          disabled={busy || text.trim().length < 3}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit(text.trim())
              setOpen(false)
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
        )}
        <Button kind="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Shown while a page's data loads. Nothing for the first 350 ms, so fast loads never flash;
// after that, grey blocks in the page's rough shape. `kind` picks the shape.
export function PageLoading({ kind = 'page' }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 350)
    return () => clearTimeout(t)
  }, [])
  if (!show) return <div aria-busy="true" />
  const block = 'skeleton rounded-lg bg-black/[0.06]'
  return (
    <div aria-busy="true" aria-label="Loading" className="fade-in">
      {kind !== 'cards' && <div className={`${block} h-8 w-64`} />}
      {kind !== 'cards' && <div className={`${block} mt-3 mb-8 h-4 w-96 max-w-full`} />}
      {kind !== 'page' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className={`${block} h-36`} />)}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className={`${block} h-72`} />
          <div className="grid content-start gap-4">
            <div className={`${block} h-32`} />
            <div className={`${block} h-32`} />
          </div>
        </div>
      )}
    </div>
  )
}

// Shared by the draft page and the printable record.
export const FINDING_STATUS = {
  accepted: 'Fix accepted',
  edited: 'Fixed by the creator',
  disputed: 'Disputed by the creator',
  dismissed: 'Dismissed by a reviewer',
  waived: 'Waived by the authorised reviewer',
}

export const ACTION_LABEL = {
  draft_created: 'created the draft',
  draft_edited: 'edited the text',
  check_run: 'ran the check',
  finding_accepted: 'accepted a suggested fix',
  finding_edited: 'wrote their own fix',
  finding_disputed: 'disputed a finding',
  dispute_rejected: 'rejected a dispute',
  dispute_accepted: 'dismissed a finding',
  finding_waived: 'waived a finding',
  submitted_for_review: 'sent it for review',
  changes_requested: 'requested changes',
  sent_to_authorised_review: 'approved and escalated',
  approved: 'approved',
  comment_added: 'commented',
}
