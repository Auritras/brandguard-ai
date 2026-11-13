// Small shared building blocks so every screen looks the same.
import { useState } from 'react'

export function Button({ kind = 'secondary', className = '', ...props }) {
  const kinds = {
    primary: 'bg-accent text-white hover:bg-[#9a3915] border-accent',
    secondary: 'bg-card text-ink hover:bg-white border-line',
    dark: 'bg-ink text-paper hover:bg-[#243246] border-ink',
    ghost: 'bg-transparent text-ink hover:bg-black/5 border-transparent',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${className}`}
    />
  )
}

export function Card({ className = '', ...props }) {
  return <div {...props} className={`rounded-2xl border border-line bg-card ${className}`} />
}

const STATUS = {
  draft: ['Draft', 'bg-slate-100 text-slate-700'],
  in_review: ['In review', 'bg-blue-50 text-blue-800'],
  changes_requested: ['Changes requested', 'bg-amber-50 text-amber-900'],
  authorised_review: ['Authorised review', 'bg-purple-50 text-purple-900'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-900'],
}

export function StatusChip({ status }) {
  const [label, cls] = STATUS[status] || [status, 'bg-slate-100 text-slate-700']
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
}

export const SEVERITY = {
  high: { label: 'High', chip: 'bg-red-50 text-red-800 border-red-200', mark: 'bg-red-100' },
  medium: { label: 'Medium', chip: 'bg-amber-50 text-amber-900 border-amber-200', mark: 'bg-amber-100' },
  low: { label: 'Low', chip: 'bg-slate-100 text-slate-700 border-slate-200', mark: 'bg-slate-200' },
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
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400'

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
    <div className="w-full rounded-lg border border-line bg-white p-3">
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
