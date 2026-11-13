import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Button, Card, ErrorNote, StatusChip, timeAgo } from '../ui.jsx'

const WAITING = { manager: ['in_review'], reviewer: ['authorised_review', 'in_review'], creator: ['draft', 'changes_requested'] }

export default function Drafts({ user }) {
  const [drafts, setDrafts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/drafts').then(setDrafts).catch((e) => setError(e.message))
  }, [])

  const mine = (d) => WAITING[user.role].includes(d.status)
  const sorted = drafts ? [...drafts].sort((a, b) => Number(mine(b)) - Number(mine(a))) : []

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Drafts</h1>
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

      <div className="mt-6 grid gap-3">
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
        {sorted.map((d) => (
          <Link key={d.id} to={`/drafts/${d.id}`} className="block">
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition hover:border-accent">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.title}</p>
                <p className="text-sm text-muted">
                  {d.channel || 'No channel'} · by {d.creator} · version {d.version} · {timeAgo(d.updated_at)}
                </p>
              </div>
              {mine(d) && d.status !== 'draft' && <span className="text-sm font-semibold text-accent">Waiting for you</span>}
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
