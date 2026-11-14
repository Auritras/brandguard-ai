import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Button, Card, Chip, ErrorNote, ReasonButton, SEVERITY, StatusChip, inputCls, timeAgo } from '../ui.jsx'

const FINDING_STATUS = {
  accepted: 'Fix accepted',
  edited: 'Fixed by the creator',
  disputed: 'Disputed by the creator',
  dismissed: 'Dismissed by a reviewer',
  waived: 'Waived by the authorised reviewer',
}

const ACTION_LABEL = {
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

// Split the text into plain and highlighted pieces, one highlight per open or disputed finding.
function highlight(body, findings) {
  const spans = []
  for (const f of findings) {
    if (!['open', 'disputed'].includes(f.status)) continue
    const at = body.indexOf(f.quote)
    if (at === -1) continue
    spans.push({ start: at, end: at + f.quote.length, f })
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  const out = []
  let pos = 0
  for (const s of spans) {
    if (s.start < pos) continue // overlaps an earlier highlight
    if (s.start > pos) out.push({ text: body.slice(pos, s.start) })
    out.push({ text: body.slice(s.start, s.end), f: s.f })
    pos = s.end
  }
  if (pos < body.length) out.push({ text: body.slice(pos) })
  return out
}

function nextStep(d, user) {
  const isOwner = d.can.edit
  if (d.status === 'approved') return 'Approved. This version is locked and ready to publish.'
  if (isOwner && d.needs_check) return 'The text has changed since the last check. Run the check again before sending it for review.'
  if (isOwner && d.open > 0) return `${d.open} finding(s) to handle. Accept the fix, write your own, or dispute. You can also send it for review as it is.`
  if (isOwner) return 'Nothing left to handle. Send it for review.'
  if (d.status === 'in_review' && user.role === 'manager')
    return d.blocking > 0
      ? `${d.blocking} high-risk finding(s) are still open. If you approve, the draft goes to the authorised reviewer.`
      : 'Read the draft, then approve it or request changes.'
  if (d.status === 'authorised_review' && user.role === 'reviewer')
    return 'High-risk findings need your decision: waive each with a reason, decide the dispute, or request changes.'
  if (d.status === 'in_review' && user.role === 'reviewer') return 'With the manager. You can also decide it now.'
  if (d.status === 'in_review') return 'With the manager for review.'
  if (d.status === 'authorised_review') return 'With the authorised reviewer.'
  if (d.status === 'changes_requested') return 'Sent back to the creator for changes.'
  return 'Still being written by the creator.'
}

export default function DraftView({ user }) {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [tab, setTab] = useState('comments')
  const [comment, setComment] = useState('')
  const contentRef = useRef(null)

  const load = useCallback(() => api(`/drafts/${id}`).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => {
    load()
  }, [load])

  // Run one action against the API and show the refreshed draft.
  const act = async (name, path, body) => {
    setBusy(name)
    setError('')
    try {
      setD(await api(path, { method: body === undefined ? 'POST' : body.__method || 'POST', body: body?.__method ? body.data : body }))
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy('')
    }
  }

  const pieces = useMemo(() => (d ? highlight(d.body, d.findings) : []), [d])
  if (!d) return error ? <ErrorNote>{error}</ErrorNote> : <p className="text-muted">Loading…</p>

  const active = d.findings.filter((f) => ['open', 'disputed'].includes(f.status))
  const settled = d.findings.filter((f) => !['open', 'disputed'].includes(f.status))
  const focus = (fid) => {
    const el = document.getElementById(`finding-${fid}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('flash')
    void el.offsetWidth // restart the animation if it is clicked twice
    el.classList.add('flash')
  }
  let markIndex = 0

  return (
    <div>
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        ← All drafts
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold">{d.title}</h1>
        <StatusChip status={d.status} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {d.channel || 'No channel'} · by {d.creator} · version {d.version}
      </p>

      <Card className="mt-5 flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-0 flex-1 text-sm font-semibold" aria-live="polite">
          {nextStep(d, user)}
        </p>
        {d.can.edit && (
          <>
            <Button kind={d.needs_check ? 'primary' : 'secondary'} disabled={!!busy} onClick={() => act('check', `/drafts/${d.id}/check`)}>
              {busy === 'check' ? 'Checking…' : 'Run check'}
            </Button>
            <Button kind={d.needs_check ? 'secondary' : 'primary'} disabled={!!busy || d.needs_check} onClick={() => act('submit', `/drafts/${d.id}/submit`)}>
              Send for review
            </Button>
          </>
        )}
        {d.can.approve && (
          <Button kind="primary" disabled={!!busy} onClick={() => act('approve', `/drafts/${d.id}/approve`)}>
            {user.role === 'manager' && d.blocking > 0 ? 'Approve and escalate' : 'Approve'}
          </Button>
        )}
        {d.can.request_changes && (
          <ReasonButton label="Request changes" placeholder="What should the creator change?" confirmLabel="Send back"
            onSubmit={(note) => act('changes', `/drafts/${d.id}/request-changes`, { note })} />
        )}
      </Card>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* Left: the content */}
        <div className="grid content-start gap-4">
          <Card className="relative overflow-hidden p-5" ref={contentRef}>
            {busy === 'check' && <div className="scan-bar" aria-hidden="true" style={{ '--scan-h': `${contentRef.current?.offsetHeight || 300}px` }} />}
            {d.status === 'approved' && (
              <span aria-hidden="true" className="approved-stamp pointer-events-none absolute right-5 top-3 rounded-md border-[3px] border-primary bg-card px-3 py-0.5 font-display text-2xl font-extrabold tracking-wide text-primary">
                Approved
              </span>
            )}
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Content</h2>
              {d.can.edit && !editing && (
                <Button onClick={() => { setText(d.body); setEditing(true) }}>Edit text</Button>
              )}
            </div>
            {editing ? (
              <div className="mt-3">
                <label className="sr-only" htmlFor="body">Content</label>
                <textarea id="body" className={`${inputCls} min-h-64`} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <Button kind="dark" disabled={!!busy || !text.trim()}
                    onClick={async () => { if (await act('save', `/drafts/${d.id}`, { __method: 'PUT', data: { body: text } })) setEditing(false) }}>
                    Save as new version
                  </Button>
                  <Button kind="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-[17px] leading-8">
                {pieces.map((p, i) =>
                  p.f ? (
                    <mark key={`f${p.f.id}`} tabIndex={0} role="button" className={`${SEVERITY[p.f.severity].mark} sweep`} style={{ '--i': markIndex++ }}
                      aria-label={`${SEVERITY[p.f.severity].label} risk finding: ${p.text}`}
                      onClick={() => focus(p.f.id)} onKeyDown={(e) => e.key === 'Enter' && focus(p.f.id)}>
                      {p.text}
                    </mark>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </p>
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Audience</dt><dd className="text-muted">{d.audience || 'Not stated'}</dd></div>
              <div><dt className="font-semibold">Purpose</dt><dd className="text-muted">{d.purpose || 'Not stated'}</dd></div>
            </dl>
          </Card>

          <Card className="p-5">
            <div role="tablist" aria-label="Draft record" className="flex gap-1">
              {[['comments', `Comments (${d.comments.length})`], ['history', 'History'], ['versions', `Versions (${d.versions.length})`]].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink text-paper' : 'hover:bg-black/5'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'comments' && (
              <div className="mt-4 grid gap-3">
                {d.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
                {d.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-line bg-white p-3 text-sm">
                    <p><span className="font-semibold">{c.user}</span> <span className="text-muted">· {timeAgo(c.created_at)}</span></p>
                    <p className="mt-1 whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))}
                <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act('comment', `/drafts/${d.id}/comments`, { text: comment })) setComment('') }}>
                  <label className="sr-only" htmlFor="comment">Add a comment</label>
                  <input id="comment" className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
                  <Button kind="dark" type="submit" disabled={!comment.trim() || !!busy}>Post</Button>
                </form>
              </div>
            )}
            {tab === 'history' && (
              <ol className="mt-4 grid gap-2 text-sm">
                {d.history.map((h, i) => (
                  <li key={i} className="border-l-2 border-line pl-3">
                    <span className="font-semibold">{h.user}</span> {ACTION_LABEL[h.action] || h.action}
                    <span className="text-muted"> · {timeAgo(h.created_at)}</span>
                    {h.detail && <span className="block text-muted">{h.detail}</span>}
                  </li>
                ))}
              </ol>
            )}
            {tab === 'versions' && (
              <div className="mt-4 grid gap-2 text-sm">
                {d.versions.map((v) => (
                  <details key={v.number} className="rounded-lg border border-line bg-white p-3">
                    <summary className="cursor-pointer font-semibold">
                      Version {v.number} <span className="font-normal text-muted">· {v.note} · {v.user} · {timeAgo(v.created_at)}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-muted">{v.body}</p>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: findings and disclosure */}
        <div className="grid content-start gap-4">
          <h2 className="font-display text-xl font-bold">
            Findings <span className="text-base font-normal text-muted">({active.length} to handle)</span>
          </h2>
          {d.run === null && <Card className="p-4 text-sm text-muted">This draft has not been checked yet.</Card>}
          {d.run !== null && active.length === 0 && (
            <Card className="p-4 text-sm"><span className="font-semibold">No open findings.</span> {d.needs_check ? 'Run the check again to confirm.' : 'The latest version passed the check.'}</Card>
          )}
          {active.map((f, i) => (
            <FindingCard key={f.id} i={i} f={f} d={d} user={user} busy={!!busy} act={act} />
          ))}

          {settled.length > 0 && (
            <details className="rounded-2xl border border-line bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Handled findings ({settled.length})</summary>
              <div className="mt-3 grid gap-3">
                {settled.map((f) => (
                  <div key={f.id} className="rounded-lg border border-line bg-white p-3 text-sm">
                    <p className="font-semibold">{FINDING_STATUS[f.status]} · {f.ref_code}</p>
                    <p className="mt-1 text-muted">“{f.quote}”</p>
                    {f.note && <p className="mt-1">{f.note}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {d.run && (
            <Card className="p-4 text-sm">
              <h3 className="font-semibold">How this was checked</h3>
              <ul className="mt-2 grid gap-1 text-muted">
                <li>Version {d.run.version}, checked {timeAgo(d.run.created_at)}.</li>
                <li>{d.run.exact_count} finding(s) from exact checks in code (terms, rule patterns, numbers against approved facts).</li>
                <li>
                  {d.run.ai_used
                    ? `${d.run.ai_count} finding(s) from AI (${d.run.ai_provider}, ${d.run.ai_model}). ${d.run.dropped_count} more were dropped because the quote or the rule could not be verified.`
                    : 'AI was not used for this check.'}
                </li>
                <li>{d.run.ai_note}</li>
                <li>The check never approves or publishes. People decide.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function FindingCard({ i, f, d, user, busy, act }) {
  const sev = SEVERITY[f.severity]
  const disputed = f.status === 'disputed'
  const canDecide = d.can.decide_disputes && disputed && (f.severity !== 'high' || user.role === 'reviewer')
  return (
    <Card id={`finding-${f.id}`} className="stamp-in scroll-mt-6 p-4" style={{ '--i': i }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip className={sev.chip}>{sev.label} risk</Chip>
        <Chip className="border-line bg-white capitalize text-ink">{f.category}</Chip>
        <span className="text-xs text-muted">Found by {f.source === 'ai' ? 'AI, then verified' : 'an exact check'}</span>
      </div>
      <p className="mt-3 text-sm"><span className={`rounded px-1 ${sev.mark}`}>“{f.quote}”</span></p>
      <p className="mt-2 text-sm">{f.reason}</p>
      <p className="mt-2 rounded-lg bg-paper p-2 text-sm">
        <span className="font-semibold">{f.ref_code === 'TERM' ? 'Terminology list' : `${f.ref_code.startsWith('F-') ? 'Approved fact' : 'Rule'} ${f.ref_code}`}:</span>{' '}
        {f.ref_text}
      </p>
      {f.suggestion && !disputed && (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm">
          <span className="font-semibold">Suggested fix:</span> {f.suggestion}
        </p>
      )}
      {disputed && (
        <p className="mt-2 rounded-lg border border-purple-200 bg-purple-50 p-2 text-sm">
          <span className="font-semibold">Disputed by the creator:</span> {f.note}
        </p>
      )}
      {f.status === 'open' && f.note && <p className="mt-2 text-sm text-muted">{f.note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {d.can.edit && f.status === 'open' && (
          <>
            {f.suggestion && (
              <Button kind="primary" disabled={busy} onClick={() => act('accept', `/findings/${f.id}/accept`)}>Accept fix</Button>
            )}
            <ReasonButton label="Write my own fix" placeholder="Replacement for the highlighted text" confirmLabel="Apply my fix" initial={f.suggestion || f.quote}
              onSubmit={(replacement) => act('edit', `/findings/${f.id}/edit`, { replacement })} />
            <ReasonButton label="Dispute" placeholder="Why is this finding wrong?" confirmLabel="Send dispute"
              onSubmit={(reason) => act('dispute', `/findings/${f.id}/dispute`, { reason })} />
          </>
        )}
        {canDecide && (
          <>
            <ReasonButton label="Dismiss finding" placeholder="Why is the creator right?" confirmLabel="Dismiss"
              onSubmit={(reason) => act('decide', `/findings/${f.id}/decide`, { decision: 'dismiss', reason })} />
            <ReasonButton label="Reject dispute" placeholder="Why does the rule still apply?" confirmLabel="Reject dispute"
              onSubmit={(reason) => act('decide', `/findings/${f.id}/decide`, { decision: 'uphold', reason })} />
          </>
        )}
        {d.can.waive && (
          <ReasonButton label="Waive" placeholder="Why is it acceptable to publish with this?" confirmLabel="Waive with this reason"
            onSubmit={(reason) => act('waive', `/findings/${f.id}/waive`, { reason })} />
        )}
        {disputed && d.can.decide_disputes && !canDecide && (
          <p className="text-sm text-muted">A high-risk dispute needs the authorised reviewer.</p>
        )}
      </div>
    </Card>
  )
}
