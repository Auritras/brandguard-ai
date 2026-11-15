import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { Button, Card, ErrorNote, PageLoading, StatusChip, timeAgo } from '../ui.jsx'

// Same order as the channel picker on the new draft form.
const CHANNELS = ['LinkedIn', 'Instagram', 'Email', 'Advertisement', 'Blog', 'Website', 'Document']

const time = (d) => new Date(d.updated_at).getTime()
const SORTS = {
  waiting: ['Waiting for me first', null],
  newest: ['Newest first', (a, b) => time(b) - time(a)],
  oldest: ['Oldest first', (a, b) => time(a) - time(b)],
  risk: ['Most high-risk', (a, b) => b.blocking - a.blocking || b.open - a.open || time(b) - time(a)],
  open: ['Most open findings', (a, b) => b.open - a.open || b.blocking - a.blocking || time(b) - time(a)],
  title: ['Title A to Z', (a, b) => a.title.localeCompare(b.title)],
}

const WAITING = { manager: ['in_review'], reviewer: ['authorised_review', 'in_review'], creator: ['draft', 'changes_requested'] }

export default function Drafts({ user }) {
  const [drafts, setDrafts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/drafts').then(setDrafts).catch((e) => setError(e.message))
  }, [])

  const [params, setParams] = useSearchParams()
  const channel = params.get('channel') || 'All'
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'waiting'

  const mine = (d) => WAITING[user.role].includes(d.status)
  // Orange marks what needs this person's action, and nothing else.
  const waiting = (d) => mine(d) && d.status !== 'draft'
  const channelOf = (d) => d.channel || 'Other'
  const counts = {}
  for (const d of drafts || []) counts[channelOf(d)] = (counts[channelOf(d)] || 0) + 1
  const tabs = [
    ['All', drafts?.length || 0],
    ...[...CHANNELS, 'Other'].filter((c) => counts[c]).map((c) => [c, counts[c]]),
  ]
  const active = tabs.some(([c]) => c === channel) ? channel : 'All'
  const shown = (drafts || []).filter((d) => active === 'All' || channelOf(d) === active)
  const byWaiting = (a, b) => Number(mine(b)) - Number(mine(a)) || time(b) - time(a)
  const sorted = [...shown].sort(SORTS[sort][1] || byWaiting)
  // Keep the address in step with the filters so Back returns to the same view.
  const setView = (next) => {
    const v = { channel: active, sort, ...next }
    const q = {}
    if (v.channel !== 'All') q.channel = v.channel
    if (v.sort !== 'waiting') q.sort = v.sort
    setParams(q, { replace: true })
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Drafts</h1>
          <p className="mt-1 text-muted">
            {user.role === 'creator'
              ? 'Your content. Check it, fix what is flagged, then send it for review.'
              : 'Content from your team. Items waiting for you are listed first.'}
          </p>
        </div>
        <Link to="/new">
          <Button kind="primary">New draft</Button>
        </Link>
      </div>

      <FirstSteps user={user} />

      {drafts?.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <ChannelMenu tabs={tabs} active={active} onPick={(c) => setView({ channel: c })}
            waitingIn={new Set((drafts || []).filter(waiting).map(channelOf))} />
          <label className="flex items-center gap-2 text-sm font-semibold">
            Sort by
            <span className="relative">
              <select
                value={sort}
                onChange={(e) => setView({ sort: e.target.value })}
                className="cursor-pointer appearance-none rounded-md border-2 border-line bg-card py-1.5 pl-3 pr-9 font-semibold transition hover:border-ink"
              >
                {Object.entries(SORTS).map(([k, [label]]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2">
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
          </label>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" key={`${active}-${sort}`}>
        {error && <div className="col-span-full"><ErrorNote>{error}</ErrorNote></div>}
        {drafts === null && !error && <div className="col-span-full"><PageLoading kind="cards" /></div>}
        {drafts?.length === 0 && (
          <Card className="col-span-full p-8 text-center">
            <p className="font-semibold">No drafts yet.</p>
            <p className="mt-1 text-muted">
              Start one with "New draft". A sample post is ready to load.
            </p>
          </Card>
        )}
        {sorted.map((d, i) => (
          <Link key={d.id} to={`/drafts/${d.id}`} className="deal-in block" style={{ '--i': i }}>
            <Card className="relative flex h-full flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-ink hover:shadow-print-sm">
              {waiting(d) && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-accent" />}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted">{d.channel || 'No channel'}</span>
                <StatusChip status={d.status} />
              </div>
              <p className="mt-3 line-clamp-2 font-display text-lg font-bold leading-snug">{d.title}</p>
              <p className="mb-4 mt-1 text-sm text-muted">
                by {d.creator} · version {d.version} · {timeAgo(d.updated_at)}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
                {d.blocking > 0 && <span className="font-semibold text-red-800">{d.blocking} high-risk</span>}
                {d.open > 0 ? <span className="text-muted">{d.open} open</span> : <span className="text-muted">No open findings</span>}
                {waiting(d) && (
                  <span className="ml-auto flex items-center gap-1.5 font-semibold">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                    Waiting for you
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

// A new brand's owner gets three first steps; each ticks off as it is done, and the list goes when all are.
function FirstSteps({ user }) {
  const [o, setO] = useState(null)
  const key = `bg_library_seen_${user.brand || 'demo'}`
  const hideKey = `bg_first_steps_hidden_${user.brand || 'demo'}`
  const read = (k) => {
    try {
      return localStorage.getItem(k) === '1'
    } catch {
      return false
    }
  }
  const [hidden, setHidden] = useState(() => read(hideKey))
  useEffect(() => {
    api('/onboarding').then(setO).catch(() => {})
  }, [])
  if (!o || !o.show || hidden) return null
  const steps = [
    [o.library_changed || read(key), '/library', 'Look over your Brand Library',
      'It starts with sample rules, facts and terms. Change them to match your brand.'],
    [o.has_draft, '/new', 'Write your first draft', 'Paste some real copy, or load the sample post, and run the check.'],
    [o.has_team, '/team', 'Add a teammate',
      'Nobody approves their own draft, so add a Manager or a Creator to work with.'],
  ]
  const left = steps.filter(([done]) => !done).length
  if (left === 0) return null
  return (
    <Card className="mt-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Get {user.brand} started</h2>
          <p className="mt-1 text-sm text-muted">{3 - left} of 3 done</p>
        </div>
        <Button kind="ghost" onClick={() => {
          try { localStorage.setItem(hideKey, '1') } catch { /* nothing to remember in a private window */ }
          setHidden(true)
        }}>Hide</Button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map(([done, to, title, help], i) => (
          <li key={to}>
            <Link to={to} className={`flex h-full gap-3 rounded-md border-2 p-3 transition ${done ? 'border-line bg-white/60' : 'border-line bg-white hover:border-primary hover:bg-primary-soft'}`}>
              <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-primary text-white' : 'border-2 border-ink'}`}>
                {done ? '✓' : i + 1}
              </span>
              <span>
                <span className={`block font-semibold ${done ? 'text-muted line-through' : ''}`}>{title}</span>
                <span className="block text-sm text-muted">{help}</span>
                <span className="sr-only">{done ? '(done)' : '(to do)'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// One button per channel that has drafts, with a highlight that slides to the picked one.
function ChannelMenu({ tabs, active, onPick, waitingIn }) {
  const refs = useRef({})
  const [pill, setPill] = useState(null)

  useLayoutEffect(() => {
    const el = refs.current[active]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [active, tabs.length])

  return (
    <nav aria-label="Filter by channel" className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <div className="relative inline-flex gap-1 rounded-lg border-2 border-line bg-card p-1">
        {pill && (
          <span
            aria-hidden="true"
            className="channel-pill absolute top-1 bottom-1 rounded-md bg-primary"
            style={{ transform: `translateX(${pill.left - 4}px)`, width: pill.width }}
          />
        )}
        {tabs.map(([c, n]) => (
          <button
            key={c}
            ref={(el) => (refs.current[c] = el)}
            onClick={() => onPick(c)}
            aria-pressed={active === c}
            className={`relative z-10 flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              active === c ? 'text-white' : 'text-ink hover:bg-black/5'
            }`}
          >
            {c}
            {(c === 'All' ? waitingIn.size > 0 : waitingIn.has(c)) && (
              <span aria-label="has drafts waiting for you" className="h-2 w-2 rounded-full bg-accent" />
            )}
            <span className={`rounded-full px-1.5 text-xs ${active === c ? 'bg-white/20' : 'bg-black/5 text-muted'}`}>{n}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
