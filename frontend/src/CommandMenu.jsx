// Ctrl+K (or Cmd+K): jump to any page or draft by typing. Arrow keys move, Enter opens, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api.js'

const PAGES = [
  ['Drafts', '/'], ['New draft', '/new'], ['Check many posts', '/check-many'], ['Brand health', '/insights'], ['Guideline gaps', '/insights#gaps-title'],
  ['Brand Library', '/library'], ['Reliability', '/reliability'], ['Team', '/team'], ['Your account', '/account'],
]

export default function CommandMenu({ onTour }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const [drafts, setDrafts] = useState([])
  const navigate = useNavigate()
  const input = useRef(null)

  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const toggle = () => setOpen((o) => !o)
    addEventListener('keydown', key)
    addEventListener('bg-command', toggle)
    return () => { removeEventListener('keydown', key); removeEventListener('bg-command', toggle) }
  }, [])
  useEffect(() => {
    if (!open) return
    setQ('')
    setAt(0)
    api('/drafts').then(setDrafts).catch(() => {})
    setTimeout(() => input.current?.focus(), 0)
  }, [open])

  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (s) => words.every((w) => s.toLowerCase().includes(w))
    return [
      ...PAGES.filter(([label]) => hit(label)).map(([label, to]) => ({ kind: 'Page', label, to })),
      ...(hit('tour guide help') || !words.length ? [{ kind: 'Help', label: 'Take the tour', tour: true }] : []),
      ...drafts.filter((d) => hit(`${d.title} ${d.creator} ${d.channel}`)).slice(0, 8)
        .map((d) => ({ kind: 'Draft', label: d.title, sub: `${d.channel || 'No channel'} · ${d.creator}`, to: `/drafts/${d.id}` })),
    ]
  }, [q, drafts])

  if (!open) return null
  const go = (item) => {
    setOpen(false)
    if (item.tour) return onTour()
    const [path, hash] = item.to.split('#')
    navigate(path)
    if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 500)
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-ink/40 px-4 pt-[12vh] print:hidden" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Go to" className="toast-in mx-auto w-full max-w-lg overflow-hidden rounded-xl border-2 border-ink bg-card shadow-print"
        onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} placeholder="Go to a page or draft…" aria-label="Go to a page or draft"
          aria-controls="command-list" aria-activedescendant={items[at] ? `cmd-${at}` : undefined}
          onChange={(e) => { setQ(e.target.value); setAt(0) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(items.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter' && items[at]) go(items[at])
          }}
          className="w-full border-b-2 border-line bg-white px-4 py-3 text-base focus:outline-none" />
        <ul id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing matches.</li>}
          {items.map((item, i) => (
            <li key={`${item.kind}${item.label}${i}`} id={`cmd-${i}`} role="option" aria-selected={i === at}
              onMouseEnter={() => setAt(i)} onClick={() => go(item)}
              className={`flex cursor-pointer items-baseline gap-3 rounded-md px-3 py-2 text-sm ${i === at ? 'bg-primary text-white' : ''}`}>
              <span className={`w-12 shrink-0 text-xs font-semibold ${i === at ? 'text-white/75' : 'text-muted'}`}>{item.kind}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
              {item.sub && <span className={`truncate text-xs ${i === at ? 'text-white/75' : 'text-muted'}`}>{item.sub}</span>}
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">↑ ↓ to move · Enter to open · Esc to close · Ctrl+K any time</p>
      </div>
    </div>
  )
}
