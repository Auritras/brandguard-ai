// Small shared building blocks so every screen looks the same.
import { useEffect, useState } from 'react'

export function Button({ kind = 'secondary', className = '', ...props }) {
  const kinds = {
    primary: 'bg-primary text-white border-ink shadow-print-sm hover:bg-primary-deep active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    secondary: 'bg-card text-ink border-ink hover:bg-primary-soft',
    dark: 'bg-ink text-paper border-ink hover:bg-primary-deep',
    ghost: 'bg-transparent text-ink hover:bg-black/5 border-transparent',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md border-2 px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${className}`}
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

// A button that first asks for a written reason, then calls onSubmit(reason).
export function ReasonButton({ label, placeholder, kind = 'secondary', confirmLabel = 'Confirm', onSubmit, initial = '' }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
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
          placeholder={placeholder}
          className={`${inputCls} mt-1 font-normal`}
        />
      </label>
      <div className="mt-2 flex gap-2">
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
