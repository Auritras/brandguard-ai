import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { Button, Card, ErrorNote, StatusChip, timeAgo } from '../ui.jsx'

// Same order as the channel picker on the new draft form.
const CHANNELS = ['LinkedIn', 'Instagram', 'Email', 'Advertisement', 'Blog', 'Website', 'Document']

const WAITING = { manager: ['in_review'], reviewer: ['authorised_review', 'in_review'], creator: ['draft', 'changes_requested'] }

export default function Drafts({ user }) {
  const [drafts, setDrafts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/drafts').then(setDrafts).catch((e) => setError(e.message))
  }, [])

  const [params, setParams] = useSearchParams()
  const channel = params.get('channel') || 'All'

  const mine = (d) => WAITING[user.role].includes(d.status)
  const channelOf = (d) => d.channel || 'Other'
  const counts = {}
  for (const d of drafts || []) counts[channelOf(d)] = (counts[channelOf(d)] || 0) + 1
  const tabs = [
    ['All', drafts?.length || 0],
    ...[...CHANNELS, 'Other'].filter((c) => counts[c]).map((c) => [c, counts[c]]),
  ]
  const active = tabs.some(([c]) => c === channel) ? channel : 'All'
  const shown = (drafts || []).filter((d) => active === 'All' || channelOf(d) === active)
  const sorted = [...shown].sort((a, b) => Number(mine(b)) - Number(mine(a)))
  const pick = (c) => setParams(c === 'All' ? {} : { channel: c }, { replace: true })

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
        {user.role === 'creator' && (
          <Link to="/new">
            <Button kind="primary">New draft</Button>
          </Link>
        )}
      </div>

      {drafts?.length > 0 && <ChannelMenu tabs={tabs} active={active} onPick={pick} />}

      <div className="mt-4 grid gap-3" key={active}>
        <ErrorNote>{error}</ErrorNote>
        {drafts === null && !error && <p className="text-muted">Loading…</p>}
        {drafts?.length === 0 && (
          <Card className="p-8 text-center">
            <p className="font-semibold">No drafts yet.</p>
            <p className="mt-1 text-muted">
              {user.role === 'creator'
                ? 'Start one with "New draft". A sample post is ready to load.'
                : 'Sign in as the Creator to write one and send it for review.'}
            </p>
          </Card>
        )}
        {sorted.map((d, i) => (
          <Link key={d.id} to={`/drafts/${d.id}`} className="deal-in block" style={{ '--i': i }}>
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition hover:-translate-y-0.5 hover:border-primary">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.title}</p>
                <p className="text-sm text-muted">
                  {d.channel || 'No channel'} · by {d.creator} · version {d.version} · {timeAgo(d.updated_at)}
                </p>
              </div>
              {mine(d) && d.status !== 'draft' && <span className="text-sm font-semibold text-primary">Waiting for you</span>}
              {d.open > 0 && <span className="text-sm text-muted">{d.open} open</span>}
              {d.blocking > 0 && <span className="text-sm font-semibold text-red-800">{d.blocking} high-risk</span>}
              <StatusChip status={d.status} />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

// One button per channel that has drafts, with a highlight that slides to the picked one.
function ChannelMenu({ tabs, active, onPick }) {
  const refs = useRef({})
  const [pill, setPill] = useState(null)

  useLayoutEffect(() => {
    const el = refs.current[active]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [active, tabs.length])

  return (
    <nav aria-label="Filter by channel" className="-mx-1 mt-6 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <div className="relative inline-flex gap-1 rounded-lg border-2 border-ink bg-card p-1">
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
            <span className={`rounded-full px-1.5 text-xs ${active === c ? 'bg-white/20' : 'bg-black/5 text-muted'}`}>{n}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
