import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { diffWords } from '../diff.js'
import LiveText from '../LiveText.jsx'
import ImagePanel, { imageSrc } from '../ImagePanel.jsx'
import ChannelPreview from '../ChannelPreview.jsx'
import MakeRule from '../MakeRule.jsx'
import { usePoll } from '../poll.js'
import { dueLabel } from '../due.js'
import { ACTION_LABEL, Button, Card, Chip, ErrorNote, FINDING_STATUS, HoldButton, PageLoading, ReasonButton, RollNumber, ScoreRing, SEVERITY, StatusChip, Term, inputCls, timeAgo, plural } from '../ui.jsx'

// Split the text into plain and highlighted pieces, one highlight per open or disputed finding.
function highlight(body, findings) {
  const spans = []
  for (const f of findings) {
    if (!['open', 'disputed'].includes(f.status) || f.image_id) continue
    const at = findQuote(body, f.quote)
    if (at === -1) continue
    // A wrong or expired figure: the fix covers the sentence, but only the number is highlighted.
    const inner = f.focus ? f.quote.indexOf(f.focus) : -1
    if (inner !== -1) spans.push({ start: at + inner, end: at + inner + f.focus.length, f })
    else spans.push({ start: at, end: at + f.quote.length, f })
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

const isActive = (f) => f.status === 'open' || f.status === 'disputed'

// Where a quote is in the text, as a whole word or phrase ("Lumio Pay" is not inside "Lumio Payroll").
function findQuote(body, quote) {
  if (!quote) return -1
  const esc = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp((/^\w/.test(quote) ? '(?<![\\w-])' : '') + esc + (/\w$/.test(quote) ? '(?![\\w-])' : ''))
  const m = re.exec(body)
  return m ? m.index : -1
}

// The same ready-to-send score as the server, to show a fix's effect before the server replies.
const WEIGHT = { high: 15, medium: 6, low: 2 }
const scoreOf = (findings) => Math.round(3000 / (30 + findings.filter(isActive).reduce((n, f) => n + (WEIGHT[f.severity] || 0), 0)))

// Which sentence each finding sits in, so findings on the same sentence are shown together.
// Image findings group by image; channel limits (about the whole text) group together.
function groupKeys(body, findings) {
  const bounds = []
  const re = /[^.!?\n]+(?:[.!?]+|$)/g
  let m
  while ((m = re.exec(body))) {
    if (!m[0].trim()) { re.lastIndex++; continue }
    bounds.push([m.index, m.index + m[0].length])
  }
  const keys = {}
  for (const f of findings) {
    if (f.image_id) keys[f.id] = `img${f.image_id}`
    else if (f.ref_code.startsWith('CH-')) keys[f.id] = 'whole'
    else {
      const at = findQuote(body, f.quote)
      const b = at === -1 ? null : bounds.find(([a, z]) => at < z && at + f.quote.length > a)
      keys[f.id] = b ? `s${b[0]}` : `f${f.id}`
    }
  }
  const sentence = (key) => {
    if (!key.startsWith('s')) return ''
    const b = bounds.find(([a]) => `s${a}` === key)
    return b ? body.slice(b[0], b[1]).trim() : ''
  }
  return { keys, sentence }
}

function nextStep(d, user) {
  const isOwner = d.can.edit
  if (d.status === 'approved') return 'Approved. This version is locked and ready to publish.'
  if (isOwner && d.needs_check) return 'The text has changed since the last check. Run the check again before sending it for review.'
  // Counted like the Findings heading: open and disputed (a dispute is still to be settled, by a reviewer).
  const todo = d.findings.filter(isActive).length
  const disputed = d.findings.filter((f) => f.status === 'disputed').length
  const note = disputed ? ` (${disputed} disputed, waiting for a reviewer)` : ''
  if (isOwner && todo > disputed) return `${plural(todo, 'finding')} to handle${note}. Accept the fix, write your own, or dispute. You can also send it for review as it is.`
  if (isOwner && disputed) return `${plural(todo, 'finding')} to handle${note}. Send it for review: the reviewer settles the disputes.`
  if (isOwner) return 'Nothing left to handle. Send it for review.'
  // You wrote it: someone else on the team decides it, whatever your role.
  if (d.mine && d.status === 'authorised_review') return 'With the brand owner. You wrote this draft, so someone else decides it.'
  if (d.mine && d.status === 'in_review') return 'Sent for review. You wrote this draft, so someone else on your team decides it.'
  if (d.mine && d.status === 'changes_requested') return 'Changes were requested. Edit the text, run the check again, then send it back.'
  if (d.status === 'in_review' && user.role === 'manager')
    return d.blocking > 0
      ? `${plural(d.blocking, 'high-risk finding')} ${d.blocking === 1 ? 'is' : 'are'} still open. If you approve, the draft goes to the authorised reviewer.`
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
  const [error, setError] = useState(window.history.state?.usr?.note || '')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [tab, setTab] = useState('comments')
  const [comment, setComment] = useState('')
  const [rewrite, setRewrite] = useState(null) // word diff shown while a change animates in
  const [leaving, setLeaving] = useState([]) // findings just handled, folding out of the list
  const [acted, setActed] = useState(false) // status and next-step only animate after an action here
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picked, setPicked] = useState(null) // the group of findings selected from the text or a card
  const [hovered, setHovered] = useState(null) // the group under the pointer: its phrase lights up
  const [stages, setStages] = useState(null) // the check, step by step: { exact, full, exactCount, images }
  const [preview, setPreview] = useState(null) // exact findings shown while the full check is still running
  const [selection, setSelection] = useState(null) // { phrase, sentence, x, y } text the owner selected
  const [making, setMaking] = useState(null) // { phrase, sentence } turning into a rule
  const [undo, setUndo] = useState(null) // { id, ref } a fix just applied, which can be taken back for a few seconds
  const undoTimer = useRef()
  const [trying, setTrying] = useState(null) // a fix being hovered: shown in the text, not yet applied
  const [view, setView] = useState('Text') // the text, or the draft as it would look in a channel
  const [compare, setCompare] = useState(null) // { before, after, count } after applying all certain fixes
  const location = useLocation()
  const autoChecked = useRef(false)
  const navigate = useNavigate()
  const contentRef = useRef(null)
  const rewriteTimer = useRef()
  useEffect(() => () => clearTimeout(rewriteTimer.current), [])

  const latest = useRef(null) // the draft as shown now; actions started earlier still compare against it
  latest.current = d
  const load = useCallback(() => api(`/drafts/${id}`).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => {
    load()
  }, [load])

  const animate = (from, to) => {
    if (from.body !== to.body && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearTimeout(rewriteTimer.current)
      setRewrite(diffWords(from.body, to.body))
      rewriteTimer.current = setTimeout(() => setRewrite(null), 2600)
    }
    const still = new Set(to.findings.filter(isActive).map((f) => f.id))
    const gone = from.findings.filter(isActive).map((f, at) => ({ f, at })).filter(({ f }) => !still.has(f.id))
    if (gone.length) {
      setLeaving(gone)
      setTimeout(() => setLeaving([]), 700)
    }
  }

  // A fix applied on screen before the server replies: the quote replaced (whole word), the finding handled.
  const guessFix = (f, replacement, status) => (cur) => {
    if (f.image_id) {
      return { ...cur, findings: cur.findings.map((x) => (x.id === f.id ? { ...x, status } : x)),
        images: cur.images.map((im) => (im.id === f.image_id ? { ...im, alt_text: replacement } : im)) }
    }
    const at = findQuote(cur.body, f.quote)
    if (at === -1) return cur
    const body = cur.body.slice(0, at) + replacement + cur.body.slice(at + f.quote.length)
    return { ...cur, body, needs_check: true, version: cur.version + 1,
      findings: cur.findings.map((x) => (x.id === f.id ? { ...x, status } : x)) }
  }

  // After a fix in the text, offer to take it back for six seconds.
  const fixed = (f) => {
    clearTimeout(undoTimer.current)
    setUndo({ id: f.id, ref: f.ref_code === 'TERM' ? `"${f.quote}"` : f.ref_code })
    undoTimer.current = setTimeout(() => setUndo(null), 6000)
  }

  // Run one action against the API and show the refreshed draft.
  const act = async (name, path, body, guess) => {
    setBusy(name)
    setError('')
    const before = latest.current
    if (guess && before) {
      // Show the result straight away: the text rewrites, the card folds away, the counts move. The server
      // then confirms it; if it refuses, the page goes back to what it was and says why.
      const g = guess(before)
      g.score = scoreOf(g.findings)
      g.open = g.findings.filter((f) => f.status === 'open').length
      animate(before, g)
      latest.current = g
      setD(g)
    }
    try {
      const d = latest.current
      const opts = body === undefined ? { method: 'POST' }
        : body.__form ? { method: 'POST', file: body.__form.file, fields: body.__form.fields }
          : body.__method ? { method: body.__method, body: body.data } : { method: 'POST', body }
      const next = await api(path, { ...opts, rev: latest.current?.rev })
      // When the text changes (a fix accepted or written), show the change being made before settling, and
      // findings that were just handled fold away instead of vanishing.
      if (d) animate(d, next)
      setActed(true)
      setD(next)
      return next
    } catch (e) {
      if (guess && before) setD(before)
      setError(e.message)
      // Someone else acted first, or the draft moved on: show the latest instead of a stale page.
      if (e.status === 409 || e.status === 404) load()
      return false
    } finally {
      setBusy('')
    }
  }

  // The check in two real steps: the instant exact checks first (shown at once), then the full check with
  // AI and images. The strip says which step is running; nothing is shown as done before it is.
  const runCheck = async () => {
    const cur = latest.current
    if (!cur) return
    setPicked(null)
    setStages({ exact: 'running', full: 'waiting', images: cur.images.length > 0, exactCount: 0 })
    setBusy('check')
    try {
      const found = await api('/check-text', { method: 'POST', body: { body: cur.body, channel: cur.channel } })
      setPreview(found.map((f, i) => ({ ...f, id: `p${i}`, status: 'open', image_id: null, preview: true })))
      setStages((x) => ({ ...x, exact: 'done', exactCount: found.length, full: 'running' }))
    } catch {
      setStages((x) => ({ ...x, exact: 'skipped', full: 'running' }))
    }
    const next = await act('check', `/drafts/${cur.id}/check`)
    setPreview(null)
    setStages((x) => (next ? { ...x, full: 'done', ai: next.run?.ai_used } : null))
    setTimeout(() => setStages((x) => (x?.full === 'done' ? null : x)), 4000)
  }
  useEffect(() => {
    if (d && location.hash === '#images') setTimeout(() => document.getElementById('images')?.scrollIntoView({ block: 'start' }), 400)
  }, [!!d]) // eslint-disable-line react-hooks/exhaustive-deps

  // A teammate acting on this draft in another window: the page catches up by itself and says who did what.
  const [news, setNews] = useState('')
  usePoll(async () => {
    const cur = latest.current
    if (!cur || busy || editing || trying) return
    const next = await api(`/drafts/${cur.id}`).catch(() => null)
    if (!next || next.rev === cur.rev || latest.current?.rev !== cur.rev) return
    const h = next.history[0]
    if (h && h.user !== user.name) {
      setNews(`${h.user.split(' (')[0]} ${ACTION_LABEL[h.action] || 'changed this draft'} just now.`)
      setTimeout(() => setNews(''), 6000)
    }
    animate(cur, next)
    setActed(true)
    setD(next)
  })

  const keyRef = useRef(null)
  useEffect(() => {
    const on = (e) => keyRef.current?.(e)
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [])

  // The "Make this a rule" button goes away on a click anywhere else.
  useEffect(() => {
    if (!selection) return
    const away = (e) => { if (!e.target.closest?.('[data-make-rule]')) setSelection(null) }
    addEventListener('mousedown', away)
    return () => removeEventListener('mousedown', away)
  }, [selection])

  // Arriving from "Save and run check": run it here, so the writer watches it happen.
  useEffect(() => {
    if (!d || autoChecked.current || !location.state?.autoCheck) return
    autoChecked.current = true
    navigate(location.pathname, { replace: true, state: location.state?.note ? { note: location.state.note } : null })
    if (d.can.edit && !d.run) runCheck()
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyCertain = async () => {
    const before = latest.current.body
    const count = certainFixes
    const next = await act('certain', `/drafts/${latest.current.id}/accept-certain`)
    if (next) setCompare({ before, after: next.body, count })
  }

  const pieces = useMemo(() => (d ? highlight(d.body, preview || d.findings) : []), [d, preview])
  // One keyboard listener for the page; what it does is set further down, once the draft is loaded.
  const keyHandler = keyRef
    if (!d) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading />

  const yourTurn = d.status !== 'approved' && (d.can.edit || d.can.approve || d.can.waive)
  // Every finding handled, and the latest text checked: ready to send.
  const ready = d.score === 100 && !d.needs_check && d.can.edit
  const certainFixes = d.findings.filter((f) => f.status === 'open' && f.certain && d.body.includes(f.quote)).length
  // The left edge of the action bar moves from orange to green as the draft gets closer to ready.
  const edge = d.score === null ? 'var(--color-accent)' : `color-mix(in oklab, var(--color-good) ${d.score}%, var(--color-accent))`
  const active = d.findings.filter(isActive)
  const shown = active.map((f) => ({ f }))
  for (const { f, at } of leaving) if (!active.some((a) => a.id === f.id)) shown.splice(Math.min(at, shown.length), 0, { f, leaving: true })
  const settled = d.findings.filter((f) => !['open', 'disputed'].includes(f.status))
  // Findings on the same sentence (or image) are one group; a highlight and its group point at each other.
  const { keys, sentence } = groupKeys(d.body, [...d.findings, ...leaving.map((l) => l.f)])
  const groups = []
  for (const item of shown) {
    const k = keys[item.f.id] || `f${item.f.id}`
    const g = groups.find((x) => x.key === k)
    if (g) g.items.push(item)
    else groups.push({ key: k, items: [item] })
  }
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
  // Text -> findings: select the group (it stays outlined) and bring it into view.
  const focus = (fid) => {
    const key = keys[fid]
    setPicked(key)
    const el = document.getElementById(`group-${key}`)
    el?.scrollIntoView({ behavior: smooth(), block: 'nearest' })
    pulse(el)
  }
  // Keyboard review: J / K move between findings, A accepts the selected finding's fix, D opens its dispute,
  // Esc clears the selection. Not while typing in a field.
  keyHandler.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return
      const k = e.key.toLowerCase()
      if (!['j', 'k', 'a', 'd', 'escape'].includes(k) || !groups.length) return
      const at = groups.findIndex((g) => g.key === picked)
      if (k === 'escape') return setPicked(null)
      if (k === 'j' || k === 'k') {
        e.preventDefault()
        const next = groups[k === 'j' ? Math.min(groups.length - 1, at + 1) : Math.max(0, at === -1 ? 0 : at - 1)]
        const first = next.items.find((x) => !x.leaving)?.f
        if (first) focus(first.id)
        return
      }
      const box = document.getElementById(`group-${picked}`)
      if (!box) return
      const label = k === 'a' ? /^(Accept fix|Use this description)$/ : /^Dispute$/
      const button = [...box.querySelectorAll('button')].find((b) => label.test(b.innerText.trim()) && !b.disabled)
      if (button) { e.preventDefault(); button.click() }
  }

  // Findings -> text: select the group and bring its highlight into view.
  const showInText = (key) => {
    setPicked(key)
    const el = document.querySelector(`[data-group="${key}"]`) || (key.startsWith('img') && document.getElementById(`image-${key.slice(3)}`))
    el?.scrollIntoView({ behavior: smooth(), block: 'center' })
    pulse(el)
  }
  let markIndex = 0

  return (
    <div>
      <Link to="/" className="inline-flex min-h-11 items-center sm:min-h-0 text-sm font-semibold text-primary hover:underline">
        ← All drafts
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold">{d.title}</h1>
        <span key={d.status} className={acted ? 'status-stamp inline-block' : 'inline-block'}><StatusChip status={d.status} /></span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted">
        {d.channel || 'No channel'} · by {d.creator} · version {d.version} ·{' '}
        <Link to={`/drafts/${d.id}/record`} className="inline-flex min-h-11 items-center sm:min-h-0 font-semibold text-primary hover:underline">
          {d.status === 'approved' ? 'Approval record' : 'Review record'}
        </Link>
        <span aria-hidden="true">·</span>
        <DueDate d={d} busy={busy} act={act} />
        {d.images.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <a href="#images" onClick={(e) => { e.preventDefault(); document.getElementById('images')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary hover:underline sm:min-h-0">
              {d.images.length === 1 ? '1 image' : `${d.images.length} images`}
              {d.image_findings > 0 && <span className="text-ink">· {d.image_findings} image finding{d.image_findings > 1 ? 's' : ''}</span>}
            </a>
          </>
        )}
      </p>

      <Card className={`relative mt-5 flex flex-wrap items-center gap-3 overflow-hidden p-4 ${yourTurn ? 'pl-6' : ''}`}>
        {yourTurn && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 transition-colors duration-700" style={{ background: edge }} />}
        {d.score !== null && d.status !== 'approved' && (
          // At 100 the ring pulses once and a "Brand-safe" label appears: the payoff for working through the list.
          <span key={ready ? 'ready' : 'not'} className={`flex items-center gap-2 ${ready && acted ? 'ready-burst' : ''}`}>
            <ScoreRing value={d.score} />
            {ready && <span className="step-in rounded-full border-2 border-good bg-good px-2.5 py-0.5 text-xs font-bold text-white">Brand-safe ✓</span>}
          </span>
        )}
        <p className="min-w-0 flex-1 basis-64 overflow-hidden text-sm font-semibold" aria-live="polite">
          <span key={nextStep(d, user)} className={acted ? 'step-in block' : 'block'}>{nextStep(d, user)}</span>
        </p>
        {d.can.edit && (
          <>
            <Button kind={d.needs_check ? 'primary' : 'secondary'} disabled={!!busy} onClick={runCheck}>
              {busy === 'check' ? 'Checking…' : 'Run check'}
            </Button>
            <Button kind={d.needs_check ? 'secondary' : 'primary'} disabled={!!busy || d.needs_check} onClick={() => act('submit', `/drafts/${d.id}/submit`)}
              className={ready ? 'ready-lift' : ''}>
              Send for review
            </Button>
          </>
        )}
        {d.can.approve && user.role !== 'manager' && d.blocking > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <Button kind="primary" disabled aria-describedby="approve-why">Hold to approve</Button>
            <span id="approve-why" className="text-sm text-muted">
              {plural(d.blocking, 'high-risk finding')} still {d.blocking === 1 ? 'needs' : 'need'} you: waive {d.blocking === 1 ? 'it' : 'each'} with a reason, decide the dispute, or request changes.
            </span>
          </span>
        )}
        {d.can.approve && !(user.role !== 'manager' && d.blocking > 0) && (
          <HoldButton kind="primary" disabled={!!busy} pendingLabel={user.role === 'manager' && d.blocking > 0 ? 'Escalating' : 'Approving'}
            onConfirm={() => act('approve', `/drafts/${d.id}/approve`)}>
            {busy === 'approve' ? 'Approving…' : user.role === 'manager' && d.blocking > 0 ? 'Hold to approve and escalate' : 'Hold to approve'}
          </HoldButton>
        )}
        {d.can.edit && certainFixes > 0 && (
          <Button disabled={!!busy} onClick={applyCertain}
            title="Preferred terms and approved figures: fixes made by code, not AI. AI rewrites stay for you to accept one by one.">
            {busy === 'certain' ? 'Fixing…' : `Apply all ${certainFixes} certain fix${certainFixes > 1 ? 'es' : ''}`}
          </Button>
        )}
        {d.can.delete && (
          <MoreMenu confirm={confirmDelete} setConfirm={setConfirmDelete} busy={busy} onDelete={async () => {
            setBusy('delete')
            try {
              await api(`/drafts/${d.id}`, { method: 'DELETE' })
              navigate('/')
            } catch (e) {
              setError(e.message)
              setBusy('')
            }
          }} />
        )}
        {d.can.request_changes && (
          <ReasonButton label="Request changes" placeholder="What should the creator change?" confirmLabel="Send back"
            onSubmit={(note) => act('changes', `/drafts/${d.id}/request-changes`, { note })} />
        )}
      </Card>
      {stages && <CheckSteps s={stages} />}
      {news && <p role="status" className="toast-in mt-3 rounded-lg border-2 border-ink bg-card px-4 py-2 text-sm font-semibold">{news}</p>}
      {undo && (
        <div role="status" className="toast-in fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-lg border-2 border-ink bg-ink px-4 py-2.5 text-sm text-paper shadow-print print:hidden">
          <span className="flex-1">Fix for {undo.ref} applied.</span>
          <button className="rounded-md bg-paper px-3 py-1 font-semibold text-ink hover:bg-primary-soft"
            onClick={() => { const id = undo.id; setUndo(null); act('undo', `/findings/${id}/undo`) }}>Undo</button>
        </div>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      {compare && <BeforeAfter c={compare} onClose={() => setCompare(null)} />}

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* Left: the content. On a phone the findings come straight after it. */}
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:col-start-1 lg:row-start-1">
          <Card className="relative overflow-hidden p-5" ref={contentRef}>
            {busy === 'check' && <div className="scan-bar" aria-hidden="true" style={{ '--scan-h': `${contentRef.current?.offsetHeight || 300}px` }} />}
            {selection && (
              <button data-make-rule style={{ left: selection.x, top: selection.y }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setMaking({ phrase: selection.phrase, sentence: selection.sentence }); setSelection(null); getSelection()?.removeAllRanges() }}
                className="toast-in absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-md border-2 border-ink bg-ink px-2.5 py-1 text-xs font-semibold text-paper shadow-print-sm">
                Make this a rule
              </button>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-4 font-display text-xl font-bold">
                Content
                {(d.status === 'approved' || d.status === 'changes_requested') && (
                  <span key={d.status} aria-hidden="true" className={`approved-stamp pointer-events-none inline-block rounded-md border-[3px] bg-card px-2.5 py-0.5 text-lg font-extrabold uppercase tracking-wide ${
                    d.status === 'approved' ? 'border-primary text-primary' : 'border-accent text-accent-deep'}`}>
                    {d.status === 'approved' ? 'Approved' : 'Changes requested'}
                  </span>
                )}
              </h2>
              {!editing && (
                <div role="tablist" aria-label="Show as" className="flex rounded-md border-2 border-line bg-white p-0.5 text-xs font-semibold">
                  {['Text', 'LinkedIn', 'Instagram', 'Email'].map((v) => (
                    <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                      className={`min-h-9 rounded px-2.5 sm:min-h-7 ${view === v ? 'bg-select text-paper' : 'text-muted hover:text-ink'}`}>{v}</button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!editing && <CopyText body={d.body} title={d.title} />}
                {d.can.edit && !editing && (
                  <Button onClick={() => { setText(d.body); setEditing(true) }}>Edit text</Button>
                )}
              </div>
            </div>
            {making && <MakeRule key={making.phrase} phrase={making.phrase} sentence={making.sentence} onClose={() => setMaking(null)} />}
            {editing ? (
              <div className="mt-3">
                <label className="sr-only" htmlFor="body">Content</label>
                <LiveText id="body" value={text} onChange={(e) => setText(e.target.value)} minHeight="min-h-64" channel={d.channel} />
                <div className="mt-2 flex gap-2">
                  <Button kind="dark" disabled={!!busy || !text.trim()}
                    onClick={async () => { if (await act('save', `/drafts/${d.id}`, { __method: 'PUT', data: { body: text } })) setEditing(false) }}>
                    Save as new version
                  </Button>
                  <Button kind="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              rewrite ? (
              <p className="mt-3 whitespace-pre-wrap text-[17px] leading-8" aria-hidden="true">
                {rewrite.map((p, i) =>
                  p.type === 'same' ? <span key={i}>{p.text}</span>
                    : p.type === 'removed' ? <span key={i} className="rewrite-out">{p.text}</span>
                      : <span key={i} className="rewrite-in">{p.text}</span>,
                )}
              </p>
              ) : trying ? (
                <p className="mt-3 whitespace-pre-wrap text-[17px] leading-8" aria-live="polite">
                  <span className="sr-only">Preview of the fix: </span>
                  {view !== 'Text' && <span aria-hidden="true" className="mb-1 block text-xs font-semibold text-muted">Showing the text with this fix · back to {view} when you move away</span>}
                  {diffWords(d.body, trying).map((p, i) =>
                    p.type === 'same' ? <span key={i}>{p.text}</span>
                      : p.type === 'added' ? <ins key={i} className="diff-added">{p.text}</ins>
                        : <del key={i} className="diff-removed">{p.text}</del>)}
                </p>
              ) : view !== 'Text' ? (
                <ChannelPreview view={view} d={d} pieces={pieces} brand={user.brand} />
              ) : (
              <p className="mt-3 whitespace-pre-wrap text-[17px] leading-8"
                onMouseUp={user.role === 'reviewer' ? (e) => {
                  const sel = getSelection()
                  let phrase = sel?.toString().trim() || ''
                  // Snap to whole words, so the rule's pattern matches what was meant ("Running pa" -> "Running payroll").
                  const found = d.body.indexOf(phrase)
                  if (found !== -1) {
                    let a = found, z = found + phrase.length
                    while (a > 0 && /[\w'’-]/.test(d.body[a - 1])) a--
                    while (z < d.body.length && /[\w'’-]/.test(d.body[z])) z++
                    phrase = d.body.slice(a, z).trim()
                  }
                  if (phrase.length < 2 || phrase.length > 120 || !sel.rangeCount) return setSelection(null)
                  const r = sel.getRangeAt(0).getBoundingClientRect()
                  const box = contentRef.current.getBoundingClientRect()
                  const at = d.body.indexOf(phrase)
                  const start = Math.max(0, d.body.lastIndexOf('.', at) + 1)
                  const end = d.body.indexOf('.', at + phrase.length)
                  setSelection({ phrase, sentence: at === -1 ? '' : d.body.slice(start, end === -1 ? undefined : end + 1).trim(),
                    x: r.left - box.left + r.width / 2, y: r.top - box.top })
                  e.stopPropagation()
                } : undefined}>
                {pieces.map((p, i) =>
                  p.f?.preview ? (
                    <mark key={`p${p.f.id}`} className={`${SEVERITY[p.f.severity].mark} sweep`} style={{ '--i': markIndex++ }}>{p.text}</mark>
                  ) : p.f ? (
                    <mark key={`f${p.f.id}`} tabIndex={0} role="button" data-group={keys[p.f.id]} aria-pressed={picked === keys[p.f.id]}
                      className={`${SEVERITY[p.f.severity].mark} sweep cursor-pointer ${picked === keys[p.f.id] ? 'mark-picked' : ''} ${hovered === keys[p.f.id] ? 'mark-hover' : ''}`} style={{ '--i': markIndex++ }}
                      aria-label={`${SEVERITY[p.f.severity].label} risk finding: ${p.text}. Show its findings`}
                      onClick={() => focus(p.f.id)} onKeyDown={(e) => e.key === 'Enter' && focus(p.f.id)}>
                      {p.text}
                    </mark>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </p>
              )
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Audience</dt><dd className="text-muted">{d.audience || 'Not stated'}</dd></div>
              <div><dt className="font-semibold">Purpose</dt><dd className="text-muted">{d.purpose || 'Not stated'}</dd></div>
            </dl>
          </Card>
          <ImagePanel d={d} busy={busy} act={act} onError={setError} />
        </div>

        {/* The record: comments, history, versions. */}
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:col-start-1 lg:row-start-2">
          <Card className="p-5">
            <div role="tablist" aria-label="Draft record" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {[['comments', `Comments (${d.comments.length})`], ['history', 'History'], ['versions', `Versions (${d.versions.length})`]].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`inline-flex min-h-11 items-center sm:min-h-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink text-paper' : 'hover:bg-black/5'}`}>
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
                  <input id="comment" className={`${inputCls} min-w-0`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
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
                {d.versions.length > 1 && <CompareVersions key={d.versions.length} versions={d.versions} />}
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
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 className="font-display text-xl font-bold">
            <Term name="finding">Findings</Term>
            {groups.length > 1 && <span className="ml-2 hidden align-middle text-xs font-normal text-muted lg:inline" title="J and K move between findings, A accepts the fix, D disputes">Keys: J / K, A, D</span>} <span className="text-base font-normal text-muted">(<RollNumber value={preview ? preview.length : active.length} /> {preview ? 'found so far' : 'to handle'})</span>
          </h2>
          {d.run === null && <Card className="p-4 text-sm text-muted">This draft has not been checked yet.</Card>}
          {d.run && !d.run.ai_used && /failed|could not/i.test(d.run.ai_note) && (
            <Card className="border-l-[6px] !border-l-accent p-4 text-sm">
              <p><span className="font-semibold">The AI part of the check did not run this time.</span> Only the exact checks ran, so tone, positioning and unsupported claims were not judged.</p>
              {d.can.edit && (
                <Button className="mt-2" kind="dark" disabled={!!busy} onClick={runCheck}>
                  {busy === 'check' ? 'Checking…' : 'Run the check again'}
                </Button>
              )}
            </Card>
          )}
          {d.run !== null && active.length === 0 && (
            <Card className="flex items-center gap-3 p-4 text-sm">
              <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
                <circle className="tick-ring" cx="16" cy="16" r="14" fill="var(--color-primary-soft)" stroke="var(--color-primary)" strokeWidth="2.5" />
                <path className="tick-mark" d="M9.5 16.5l4.5 4.5 8.5-9" fill="none" stroke="var(--color-primary-deep)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p><span className="font-semibold">No open findings.</span> {d.needs_check ? 'Run the check again to confirm.' : 'The latest version passed the check.'}</p>
            </Card>
          )}
          {preview && <PreviewCards items={preview} stages={stages} />}
          {!preview && groups.map((g, gi) => {
            const live = g.items.filter((x) => !x.leaving).length
            const on = picked === g.key
            const link = {
              onMouseEnter: () => setHovered(g.key), onMouseLeave: () => setHovered(null),
              onFocus: () => setHovered(g.key), onBlur: () => setHovered(null),
              onClick: (e) => { if (!e.target.closest('button, a, input, textarea, select, label, summary')) showInText(g.key) },
            }
            if (g.items.length === 1) {
              const { f, leaving: out } = g.items[0]
              return (
                <div key={g.key} id={`group-${g.key}`} {...link} className={`scroll-mt-24 cursor-pointer rounded-lg transition-shadow ${on ? 'picked' : ''}`}>
                  <FindingCard i={gi} f={f} d={d} user={user} busy={!!busy} act={act} guessFix={guessFix} setTrying={setTrying} onFixed={fixed} leaving={out} onShow={() => showInText(g.key)} />
                </div>
              )
            }
            const text = sentence(g.key)
            return (
              <section key={g.key} id={`group-${g.key}`} {...link} aria-label={`${live} findings on one ${g.key.startsWith('img') ? 'image' : 'sentence'}`}
                className={`stamp-in scroll-mt-24 cursor-pointer rounded-xl border-2 border-dashed border-line bg-black/[0.02] p-3 transition-shadow ${on ? 'picked' : ''}`} style={{ '--i': gi }}>
                <div className="flex items-start justify-between gap-3 px-1 pb-2">
                  <p className="text-sm">
                    <span className="font-semibold">{live} findings on {g.key.startsWith('img') ? 'this image' : g.key === 'whole' ? 'the whole text' : 'this sentence'}</span>
                    {text && <span className="mt-1 block text-muted">“{text}”</span>}
                  </p>
                  <button className="inline-flex min-h-11 items-center sm:min-h-0 shrink-0 text-sm font-semibold text-primary hover:underline" onClick={() => showInText(g.key)}>Show in text</button>
                </div>
                <div className="grid gap-3">
                  {g.items.map(({ f, leaving: out }, i) => (
                    <FindingCard key={f.id} i={i} f={f} d={d} user={user} busy={!!busy} act={act} guessFix={guessFix} setTrying={setTrying} onFixed={fixed} leaving={out} nested hideQuote={f.quote === text} />
                  ))}
                </div>
              </section>
            )
          })}

          {settled.length > 0 && (
            <details className="rounded-2xl border border-line bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Handled findings (<RollNumber value={settled.length} />)</summary>
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
                <li>{plural(d.run.exact_count, 'finding')} from exact checks in code (terms, rule patterns, numbers against approved facts).</li>
                <li>
                  {d.run.ai_used
                    ? `${plural(d.run.ai_count, 'finding')} from AI (${d.run.ai_provider}, ${d.run.ai_model}). ${d.run.dropped_count} more were dropped because the quote or the rule could not be verified.`
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

// Rarely needed, destructive actions live behind "⋯", away from the everyday buttons.
function MoreMenu({ confirm, setConfirm, busy, onDelete }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setConfirm(false) } }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setConfirm(false) } }
    addEventListener('mousedown', away)
    addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc) }
  }, [open, setConfirm])
  return (
    <div ref={box} className="relative ml-auto">
      <Button kind="ghost" aria-label="More actions" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 min-w-11 text-lg sm:min-h-0">⋯</Button>
      {open && (
        <div className="toast-in absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border-2 border-ink bg-card p-1.5 shadow-print">
          {confirm ? (
            <div className="p-2 text-sm">
              <p>Delete this draft? It was never sent for review, so it leaves no record behind.</p>
              <div className="mt-2 flex gap-2">
                <Button kind="dark" disabled={!!busy} onClick={onDelete}>Delete</Button>
                <Button kind="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirm(true)} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-red-800 hover:bg-red-50 sm:min-h-9">
              Delete draft…
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// One short outline pulse on whatever was just selected (skipped with reduced motion).
function pulse(el) {
  if (!el?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate([{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--color-accent) 70%, transparent)' },
    { boxShadow: '0 0 0 10px transparent' }], { duration: 450, easing: 'ease-out' })
}

// Which part of the check is running, in the order it really happens.
function CheckSteps({ s }) {
  const step = (state, label, extra) => (
    <span className={`flex items-center gap-1.5 ${state === 'waiting' ? 'text-muted' : ''}`}>
      {state === 'running' ? <span aria-hidden="true" className="spinner text-primary" />
        : state === 'done' ? <span aria-hidden="true" className="font-bold text-good">✓</span>
          : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-black/15" />}
      {label}{extra}
    </span>
  )
  const running = s.exact === 'running' || s.full === 'running'
  return (
    <div role="status" aria-live="polite" className="toast-in relative mt-3 overflow-hidden rounded-lg border-2 border-line bg-card px-4 py-2 text-sm font-semibold">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {step(s.exact === 'skipped' ? 'done' : s.exact, 'Exact checks', s.exact === 'done' ? ` · ${s.exactCount} found` : '')}
        {step(s.full, s.images ? 'AI review and images' : 'AI review', s.full === 'running' ? '…' : s.full === 'done' && s.ai === false ? ' · AI did not run' : '')}
        {step(s.full === 'done' ? 'done' : 'waiting', 'Verified and saved')}
      </div>
      {running && <span aria-hidden="true" className="check-progress absolute inset-x-0 top-0 h-0.5" />}
    </div>
  )
}

// While the full check runs, the exact findings are already shown, read-only, with a slot for the AI.
function PreviewCards({ items, stages }) {
  return (
    <>
      {items.map((f, i) => (
        <Card key={f.id} className="stamp-in p-4" style={{ '--i': i }}>
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={SEVERITY[f.severity].chip}>{SEVERITY[f.severity].label} risk</Chip>
            <span className="text-xs text-muted">Found by an exact check · {f.ref_code === 'TERM' ? 'terms' : f.ref_code}</span>
          </div>
          <p className="mt-2 text-sm"><span className={`rounded px-1 ${SEVERITY[f.severity].mark}`}>“{f.quote}”</span></p>
          <p className="mt-1 text-sm text-muted">{f.reason}</p>
        </Card>
      ))}
      {stages?.full === 'running' && (
        <Card className="stamp-in flex items-center gap-3 p-4 text-sm" style={{ '--i': items.length }}>
          <span aria-hidden="true" className="spinner text-primary" />
          <span><span className="font-semibold">The AI is reading for tone, positioning and claims{stages.images ? ', and the images' : ''}.</span>
            <span className="block text-muted">Its findings are checked against the draft before they are shown. Fixes come with the full results.</span></span>
        </Card>
      )}
    </>
  )
}

// After applying all certain fixes: the text before and after, side by side, with each change marked.
function BeforeAfter({ c, onClose }) {
  const parts = diffWords(c.before, c.after)
  return (
    <Card className="step-in mt-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Applied {c.count} certain fix{c.count > 1 ? 'es' : ''}</h2>
          <p className="mt-1 text-sm text-muted">Preferred terms and approved figures, made by code. Saved as a new version; run the check again before sending.</p>
        </div>
        <Button kind="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Before</p>
          <p className="mt-1 whitespace-pre-wrap rounded-md border-2 border-line bg-white p-3 text-sm leading-7">
            {parts.filter((x) => x.type !== 'added').map((x, i) => (x.type === 'removed' ? <del key={i} className="diff-removed">{x.text}</del> : <span key={i}>{x.text}</span>))}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">After</p>
          <p className="mt-1 whitespace-pre-wrap rounded-md border-2 border-line bg-white p-3 text-sm leading-7">
            {parts.filter((x) => x.type !== 'removed').map((x, i) => (x.type === 'added' ? <ins key={i} className="diff-added">{x.text}</ins> : <span key={i}>{x.text}</span>))}
          </p>
        </div>
      </div>
    </Card>
  )
}

// When the draft is needed by. Anyone on the team can set it until it is approved.
function DueDate({ d, busy, act }) {
  const [open, setOpen] = useState(false)
  const label = dueLabel(d.due_date)
  if (d.status === 'approved' || d.shared) return d.due_date ? <span>{label.text}</span> : null
  if (open) {
    return (
      <span className="inline-flex items-center gap-1">
        <label className="sr-only" htmlFor="due">Needed by</label>
        <input id="due" type="date" autoFocus defaultValue={d.due_date || ''} className="rounded border-2 border-line bg-white px-1.5 py-0.5 text-sm text-ink"
          onChange={async (e) => { if (await act('due', `/drafts/${d.id}/due`, { __method: 'PUT', data: { due_date: e.target.value || null } })) setOpen(false) }} />
        <button className="px-1 font-semibold" onClick={() => setOpen(false)}>Done</button>
      </span>
    )
  }
  return (
    <button disabled={!!busy} onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center sm:min-h-0 font-semibold hover:underline ${label.cls || 'text-primary'}`}>
      {d.due_date ? label.text : 'Set a due date'}
    </button>
  )
}

// Copy the text, or save it as a file, to paste into the channel once it is approved.
function CopyText({ body, title }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: the Save option still works */ }
  }
  const save = () => {
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/[^\w\- ]+/g, '').trim() || 'draft'}.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <span className="flex items-center gap-1">
      <Button kind="ghost" onClick={copy} aria-live="polite">{copied ? 'Copied ✓' : 'Copy text'}</Button>
      <Button kind="ghost" onClick={save}>Save as .txt</Button>
    </span>
  )
}

// Two versions side by side as one text: removed words struck out, new words highlighted.
function CompareVersions({ versions }) {
  // versions arrive newest first
  const [to, setTo] = useState(versions[0].number)
  const [from, setFrom] = useState(versions[1].number)
  const pieces = useMemo(() => {
    const body = (n) => versions.find((v) => v.number === n)?.body || ''
    return diffWords(body(from), body(to))
  }, [versions, from, to])
  const added = pieces.filter((p) => p.type === 'added' && p.text.trim()).length
  const removed = pieces.filter((p) => p.type === 'removed' && p.text.trim()).length
  const pick = (value, set, label) => (
    <select aria-label={label} value={value} onChange={(e) => set(Number(e.target.value))}
      className="cursor-pointer rounded-md border-2 border-line bg-card px-2 py-1 font-semibold hover:border-ink">
      {versions.map((v) => <option key={v.number} value={v.number}>Version {v.number}</option>)}
    </select>
  )
  return (
    <div className="mb-2 rounded-lg border-2 border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 font-semibold">
        Compare {pick(from, setFrom, 'Older version')} with {pick(to, setTo, 'Newer version')}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="diff-removed">struck out</span> = removed ({removed})</span>
        <span><span className="diff-added">highlighted</span> = added ({added})</span>
      </p>
      {from === to ? (
        <p className="mt-3 text-muted">Pick two different versions.</p>
      ) : (
        <p className="mt-3 whitespace-pre-wrap leading-7" aria-live="polite">
          {pieces.map((p, i) =>
            p.type === 'same' ? <span key={i}>{p.text}</span>
              : p.type === 'added' ? <ins key={i} className="diff-added">{p.text}</ins>
                : <del key={i} className="diff-removed">{p.text}</del>,
          )}
        </p>
      )}
    </div>
  )
}

function FindingCard({ i, f, d, user, busy, act, guessFix, setTrying, onFixed, leaving, nested = false, hideQuote = false, onShow }) {
  const ref = useRef(null)
  // Fold from the card's real height so the collapse is smooth at any size.
  useLayoutEffect(() => {
    if (leaving && ref.current) ref.current.style.setProperty('--fold-h', `${ref.current.offsetHeight}px`)
  }, [leaving])
  const sev = SEVERITY[f.severity]
  const disputed = f.status === 'disputed'
  const canDecide = d.can.decide_disputes && disputed && (f.severity !== 'high' || user.role === 'reviewer')
  const imgIndex = f.image_id ? d.images.findIndex((x) => x.id === f.image_id) : -1
  const img = imgIndex >= 0 ? d.images[imgIndex] : null
  const inPixels = !!f.image_id && f.ref_code !== 'VIS-ALT' // only the description can be fixed from here
  const wholeText = f.ref_code.startsWith('CH-') // channel limits: length, number of hashtags
  return (
    <Card ref={ref} id={leaving ? undefined : `finding-${f.id}`} className={`${nested ? '' : 'stamp-in'} scroll-mt-6 p-4 ${leaving ? 'fold-away' : ''}`} style={{ '--i': i }}
      inert={leaving || undefined} aria-hidden={leaving || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip className={sev.chip}>{sev.label} risk</Chip>
        <Chip className="border-line bg-white capitalize text-ink">{f.category}</Chip>
        <span className="text-xs text-muted">Found by {f.source === 'ai' ? <><Term name="AI check">AI</Term>, then verified</> : f.ref_code.startsWith('VIS-') ? 'measuring the image' : <>an <Term name="exact check" /></>}</span>
      </div>
      {img && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted">
          <img src={imageSrc(img.url)} alt="" className="h-9 w-14 rounded border border-line object-cover" />
          In image {imgIndex + 1}
        </p>
      )}
      {!hideQuote && (
        <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className={`rounded px-1 ${sev.mark}`}>“{f.quote}”</span>
          {onShow && !f.image_id && !f.ref_code.startsWith('CH-') && (
            <button className="inline-flex min-h-11 items-center sm:min-h-0 text-xs font-semibold text-primary hover:underline" onClick={onShow}>Show in text</button>
          )}
        </p>
      )}
      <p className="mt-2 text-sm">{f.reason}</p>
      <p className="mt-2 rounded-lg bg-paper p-2 text-sm">
        <span className="font-semibold">{f.ref_code === 'TERM' ? 'Terminology list' : f.ref_code.startsWith('VIS-') ? 'Image standard' : f.ref_code.startsWith('CH-') ? `${d.channel} limit` : `${f.ref_code.startsWith('F-') ? 'Approved fact' : 'Rule'} ${f.ref_code}`}:</span>{' '}
        {f.ref_text}
      </p>
      {!leaving && d.precedents?.[f.ref_code]?.length > 0 && (
        <details className="mt-2 rounded-lg border border-line bg-white p-2 text-sm">
          <summary className="cursor-pointer font-semibold">How the team decided this before ({d.precedents[f.ref_code].length})</summary>
          <ul className="mt-1.5 grid gap-1.5">
            {d.precedents[f.ref_code].map((x, k) => (
              <li key={k} className="text-muted">
                <span className="font-semibold text-ink">{x.outcome[0].toUpperCase() + x.outcome.slice(1)}</span>
                {x.by && <> by {x.by}</>} in <Link to={`/drafts/${x.draft_id}`} className="font-semibold text-primary hover:underline">{x.draft}</Link>
                {x.note && <span className="block">“{x.note}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {f.suggestion && !disputed && (
        <p className="mt-2 rounded-lg border border-primary/25 bg-primary-soft p-2 text-sm">
          <span className="font-semibold">{f.image_id ? 'Suggested description' : 'Suggested fix'}:</span> {f.suggestion}
        </p>
      )}
      {disputed && (
        <p className="mt-2 rounded-lg border border-line border-l-4 border-l-accent bg-white p-2 text-sm">
          <span className="font-semibold">Disputed by the creator:</span> {f.note}
        </p>
      )}
      {f.status === 'open' && f.note && <p className="mt-2 text-sm text-muted">{f.note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {d.can.edit && f.status === 'open' && (
          <>
            {wholeText && <p className="w-full text-sm text-muted">This is about the whole text: shorten it with Edit text, then run the check again. Or dispute it.</p>}
            {inPixels && <p className="w-full text-sm text-muted">This is in the image itself: change the image, then remove this one and add the new one. Or dispute it.</p>}
            {f.suggestion && !inPixels && !wholeText && (
              <Button kind="primary" disabled={busy}
                onClick={async () => { setTrying?.(null); if (await act('accept', `/findings/${f.id}/accept`, undefined, guessFix(f, f.suggestion, 'accepted')) && !f.image_id) onFixed?.(f) }}
                {...(!f.image_id && setTrying ? {
                  // Hovering (or focusing) shows the fix in the text: old words struck through, new ones marked.
                  onMouseEnter: () => setTrying(guessFix(f, f.suggestion, 'accepted')(d).body),
                  onFocus: () => setTrying(guessFix(f, f.suggestion, 'accepted')(d).body),
                  onMouseLeave: () => setTrying(null), onBlur: () => setTrying(null),
                } : {})}>
                {f.image_id ? 'Use this description' : 'Accept fix'}
              </Button>
            )}
            {!inPixels && !wholeText && (
              <ReasonButton label={f.image_id ? 'Write my own description' : 'Write my own fix'}
                placeholder={f.image_id ? 'What does the image show?' : 'Replacement for the highlighted text'}
                confirmLabel={f.image_id ? 'Save description' : 'Apply my fix'} initial={f.image_id ? f.suggestion : f.suggestion || f.quote}
                onSubmit={async (replacement) => { if (await act('edit', `/findings/${f.id}/edit`, { replacement }, guessFix(f, replacement, 'edited')) && !f.image_id) onFixed?.(f) }} />
            )}
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
          <ReasonButton label="Waive" placeholder="Why is it acceptable to publish with this?" confirmLabel="Waive with this reason" hold pendingLabel="Waiving"
            onSubmit={(reason) => act('waive', `/findings/${f.id}/waive`, { reason })} />
        )}
            {disputed && d.can.decide_disputes && !canDecide && (
          <p className="text-sm text-muted">A high-risk <Term name="dispute" /> needs the <Term name="authorised reviewer" />.</p>
        )}
      </div>
    </Card>
  )
}
