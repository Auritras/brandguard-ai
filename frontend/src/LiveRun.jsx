// Run the test drafts through the exact checks now, in front of you: each draft turns green or red as it
// is scored, and the counter climbs. The AI part is not run live (80 AI calls would exceed the free limit);
// its scores are the recorded runs shown further down.
import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import { Button, Card } from './ui.jsx'

const BATCH = 4

export default function LiveRun({ brand, recorded }) {
  const [cases, setCases] = useState(null)
  const [rows, setRows] = useState({}) // id -> result
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef(false)
  useEffect(() => {
    setCases(null)
    setRows({})
    api(`/reliability/cases?brand=${brand}`).then(setCases).catch((e) => setError(e.message))
    return () => { stop.current = true }
  }, [brand])

  const run = async () => {
    stop.current = false
    setRows({})
    setRunning(true)
    setError('')
    const slow = !matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      for (let i = 0; i < cases.length && !stop.current; i += BATCH) {
        const ids = cases.slice(i, i + BATCH).map((c) => c.id)
        setRows((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, 'running'])) }))
        const out = await api('/reliability/live', { method: 'POST', body: { brand, ids } })
        for (const res of out) {
          setRows((r) => ({ ...r, [res.id]: res }))
          if (slow) await new Promise((ok) => setTimeout(ok, 45)) // one by one, so the run can be followed
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  if (!cases) return null
  const done = Object.values(rows).filter((r) => r && r !== 'running')
  const caught = done.reduce((n, r) => n + r.caught, 0)
  const planted = cases.reduce((n, c) => n + c.planted.length, 0)
  const alarms = done.reduce((n, r) => n + r.extras.length, 0)
  const finished = done.length === cases.length
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="font-display text-xl font-bold">Run the test drafts now</h2>
          <p className="mt-1 text-sm text-muted">
            All {cases.length} drafts through the exact checks, live, against the demo brand's original Brand Library. Each turns
            green when every planted problem is caught and nothing else is flagged.
          </p>
        </div>
        <Button kind="primary" onClick={run} disabled={running}>
          {running ? <><span aria-hidden="true" className="spinner" /> Running…</> : finished ? 'Run again' : `Run all ${cases.length} now`}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1" aria-live="polite">
        <p><span className="font-display text-3xl font-bold tabular-nums">{caught}</span><span className="text-muted"> / {planted} planted problems caught</span></p>
        <p className="text-sm"><span className="font-semibold tabular-nums">{done.length}</span> of {cases.length} drafts run</p>
        <p className={`text-sm ${alarms ? 'font-semibold text-red-800' : ''}`}><span className="font-semibold tabular-nums">{alarms}</span> false alarms</p>
        {finished && recorded && (
          <p className="step-in text-sm font-semibold text-good">
            {caught === recorded.caught && planted === recorded.planted ? '✓ Same as the recorded run' : 'Differs from the recorded run'}
          </p>
        )}
      </div>

      <ol className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5" aria-label="Test drafts">
        {cases.map((c) => {
          const r = rows[c.id]
          const ok = r && r !== 'running' && r.caught === r.wanted && !r.extras.length
          const bad = r && r !== 'running' && !ok
          const tip = !r ? c.body : r === 'running' ? 'Running…'
            : [c.body, c.planted.length ? 'Caught ' + r.caught + ' of ' + r.wanted : 'Clean draft',
              r.missed.length ? 'Missed: ' + r.missed.join('; ') : '', r.extras.length ? 'Also flagged: ' + r.extras.join('; ') : ''].filter(Boolean).join(' · ')
          const look = ok ? 'pop-in border-good bg-good text-white' : bad ? 'pop-in border-red-800 bg-red-700 text-white'
            : r === 'running' ? 'border-primary bg-primary-soft text-primary-deep' : 'border-line bg-white text-muted'
          return (
            <li key={c.id} title={tip}
              className={`grid h-9 place-items-center rounded-md border-2 text-[11px] font-bold tabular-nums transition-colors duration-200 ${look}`}>
              {ok ? '✓' : bad ? '✗' : c.id}
              <span className="sr-only">{ok ? 'passed' : bad ? 'failed' : ''}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">Hover a square to see its draft. Clean drafts must come back with nothing flagged.
        The AI part is not run live (80 AI calls would exceed the free limit); its scores are the recorded runs below.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
    </Card>
  )
}
