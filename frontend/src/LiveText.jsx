import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { Chip, RollNumber, SEVERITY } from './ui.jsx'

// The same box metrics for the textarea and the highlight layer behind it, so the marks line up.
const BOX = 'w-full rounded-md border-2 px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'

// A text box that runs the exact checks while you type (after a short pause) and underlines
// what they find. Only the instant code checks run here; AI checks run when the draft is saved.
export default function LiveText({ id, value, onChange, required, placeholder, minHeight = 'min-h-56', channel = '' }) {
  const [found, setFound] = useState([])
  const [state, setState] = useState('idle') // idle | checking | done | error
  const ref = useRef(null)

  useEffect(() => {
    if (!value.trim()) {
      setFound([])
      setState('idle')
      return
    }
    setState('checking')
    let stale = false
    const t = setTimeout(() => {
      api('/check-text', { method: 'POST', body: { body: value, channel } })
        .then((r) => { if (!stale) { setFound(r); setState('done') } })
        .catch(() => { if (!stale) setState('error') })
    }, 600)
    return () => { stale = true; clearTimeout(t) }
  }, [value, channel])

  // Grow with the text so the box never scrolls and the highlight layer stays aligned.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const marks = []
  for (const f of found) for (const [start, end] of f.spans) {
    // A wrong or expired figure: only the number is highlighted, not the whole sentence.
    const inner = f.focus ? value.slice(start, end).indexOf(f.focus) : -1
    marks.push(inner === -1 ? { start, end, f } : { start: start + inner, end: start + inner + f.focus.length, f })
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end)
  const pieces = []
  let pos = 0
  for (const m of marks) {
    if (m.start < pos) continue
    pieces.push(value.slice(pos, m.start))
    pieces.push(<mark key={`${m.start}:${m.f.quote}`} className={`${SEVERITY[m.f.severity].mark} live-mark`}>{value.slice(m.start, m.end)}</mark>)
    pos = m.end
  }
  pieces.push(value.slice(pos) + '\n')

  const high = found.filter((f) => f.severity === 'high').length
  return (
    <div>
      <div className="relative">
        <div aria-hidden="true" className={`${BOX} ${minHeight} pointer-events-none absolute inset-0 border-transparent bg-white text-transparent`}>
          {pieces}
        </div>
        <textarea id={id} ref={ref} required={required} placeholder={placeholder} value={value} onChange={onChange}
          aria-describedby={id && `${id}-live`}
          className={`${BOX} ${minHeight} relative block resize-none overflow-hidden border-line bg-transparent text-ink placeholder:text-slate-400 focus:border-primary focus:outline-none`} />
      </div>

      <div id={id && `${id}-live`} aria-live="polite" className="mt-2 text-sm">
        {state === 'checking' && <p className="text-muted">Checking as you type…</p>}
        {state === 'error' && <p className="text-muted">The live check is unavailable right now. The full check still runs when you save.</p>}
        {state === 'done' && found.length === 0 && <p className="font-semibold">No issues from the instant checks so far.</p>}
        {state === 'done' && found.length > 0 && (
          <details className="rounded-md border-2 border-line bg-card p-3" open={found.length <= 4}>
            <summary className="cursor-pointer font-semibold">
              <RollNumber value={found.length} /> {found.length === 1 ? 'issue' : 'issues'} found while typing{high > 0 && <span className="text-red-800"> · <RollNumber value={high} /> high-risk</span>}
            </summary>
            <ul className="mt-2 grid gap-1.5">
              {found.map((f, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2">
                  <Chip className={SEVERITY[f.severity].chip}>{SEVERITY[f.severity].label}</Chip>
                  <span>
                    <span className={`rounded px-0.5 ${SEVERITY[f.severity].mark}`}>{f.quote}</span>{' '}
                    <span className="text-muted">{f.reason}{f.suggestion && ` Try: “${f.suggestion}”.`}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-1 text-xs text-muted">Instant checks only (terms, rule patterns, numbers). AI checks run when you save.</p>
      </div>
    </div>
  )
}
