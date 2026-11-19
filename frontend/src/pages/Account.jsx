import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { resetTours } from '../Tour.jsx'
import { api } from '../api.js'
import { ACTION_LABEL, Button, Card, CountUp, ErrorNote, Field, inputCls, timeAgo } from '../ui.jsx'

const ROLES = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }
const ROLE_ABOUT = {
  creator: 'You write drafts, fix or dispute what the check finds, and send them for review.',
  manager: 'You review your team\'s drafts: approve them, send them back, or escalate high-risk ones.',
  reviewer: 'You own the Brand Library and make the final call on high-risk findings and disputes.',
}
// What each role does most, so the activity tiles show what matters for them first.
const TILES = {
  creator: [['written', 'Drafts written'], ['fixed', 'Fixes made'], ['sent', 'Sent for review'], ['checks', 'Checks run']],
  manager: [['approved', 'Approved'], ['sent_back', 'Sent back'], ['comments', 'Comments'], ['written', 'Drafts written']],
  reviewer: [['approved', 'Approved'], ['waived', 'Findings waived'], ['sent_back', 'Sent back'], ['comments', 'Comments']],
}
const EXTRA_LABEL = {
  image_added: 'added an image', image_removed: 'removed an image', image_described: 'described an image',
  due_date_set: 'set a due date', record_shared: 'shared the record', draft_deleted: 'deleted a draft',
}

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private window */ } }

export default function Account({ user }) {
  const name = user.name.split(' (')[0]
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const [act, setAct] = useState(null)
  useEffect(() => { api('/me/activity').then(setAct).catch(() => setAct({ totals: {}, recent: [] })) }, [])

  return (
    <div className="mx-auto max-w-5xl">
      {/* Who you are */}
      <Card className="deal-in relative overflow-hidden p-6 sm:p-8">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-primary" />
        <div className="flex flex-wrap items-center gap-5">
          <span aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-2 border-ink bg-primary font-display text-3xl font-bold text-white shadow-print-sm">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">Your account</p>
            <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-ink px-2.5 py-0.5 font-semibold text-paper">{ROLES[user.role]}</span>
              <span className="font-semibold">{user.brand || 'Lumio Payroll'}</span>
              {user.sandbox && <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-deep">Private demo copy</span>}
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-muted">{ROLE_ABOUT[user.role]}</p>
        <dl className="mt-5 grid gap-x-8 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Sign-in email</dt><dd className="break-all font-semibold">{user.sandbox ? 'None (a demo person)' : user.email}</dd></div>
          <div><dt className="text-muted">Brand</dt><dd className="font-semibold">{user.brand || 'Lumio Payroll'}</dd></div>
          <div><dt className="text-muted">Team</dt><dd><Link to="/team" className="font-semibold text-primary hover:underline">See who you work with →</Link></dd></div>
        </dl>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* What you have done */}
        <div className="grid content-start gap-6">
          <Card className="p-5">
            <h2 className="font-display text-xl font-bold">Your activity</h2>
            <p className="mt-1 text-sm text-muted">Counted from the brand's history, which nobody can edit.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(TILES[user.role] || []).map(([k, label], i) => (
                <div key={k} className="deal-in rounded-lg border-2 border-line bg-white p-3" style={{ '--i': i }}>
                  <p className="font-display text-3xl font-bold tabular-nums">{act ? <CountUp value={act.totals[k] || 0} /> : '–'}</p>
                  <p className="text-xs font-semibold text-muted">{label}</p>
                </div>
              ))}
            </div>
            <h3 className="mt-6 text-sm font-semibold">Latest</h3>
            {act && act.recent.length === 0 && <p className="mt-2 text-sm text-muted">Nothing yet. Your actions on drafts will show up here.</p>}
            <ol className="mt-2 grid gap-1">
              {(act?.recent || []).map((r, i) => (
                <li key={i} className="flex items-baseline gap-3 border-l-2 border-line py-1 pl-3 text-sm">
                  <span className="min-w-0 flex-1">
                    You {ACTION_LABEL[r.action] || EXTRA_LABEL[r.action] || r.action.replace(/_/g, ' ')}
                    {r.draft_id && r.draft && <> on <Link to={`/drafts/${r.draft_id}`} className="font-semibold text-primary hover:underline">{r.draft}</Link></>}
                  </span>
                  <span className="shrink-0 text-xs text-muted" title={new Date(r.at).toLocaleString()}>{timeAgo(r.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Bookmarklet />
        </div>

        {/* Settings */}
        <div className="grid content-start gap-6">
          <Preferences />
          <Password user={user} />
          <Card className="p-5">
            <h2 className="font-display text-xl font-bold">Keyboard</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3"><dt>Go to any page or draft</dt><dd><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></dd></div>
              <div className="flex items-center justify-between gap-3"><dt>Hold to approve or waive</dt><dd><Kbd>Enter</Kbd> held</dd></div>
              <div className="flex items-center justify-between gap-3"><dt>Close a menu or the tour</dt><dd><Kbd>Esc</Kbd></dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }) {
  return <kbd className="rounded border-2 border-line border-b-[3px] bg-white px-1.5 py-0.5 font-sans text-xs font-semibold">{children}</kbd>
}

// Settings that live in this browser: whether the tour opens by itself.
function Preferences() {
  const [autoTour, setAutoTour] = useState(read('bg_tours_off') !== '1')
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Preferences</h2>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={autoTour}
          onChange={(e) => { setAutoTour(e.target.checked); write('bg_tours_off', e.target.checked ? null : '1') }} />
        <span><span className="font-semibold">Show the guided tour</span> the first time I use a role or brand
          <span className="block text-muted">Saved in this browser.</span></span>
      </label>
      <Button className="mt-4" onClick={() => { resetTours(); dispatchEvent(new Event('bg-tour')) }}>Take the tour now</Button>
    </Card>
  )
}

function Password({ user }) {
  const [form, setForm] = useState({ current: '', new: '', again: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    if (form.new !== form.again) return setError('The two new passwords do not match.')
    setBusy(true)
    try {
      await api('/me/password', { method: 'PUT', body: { current: form.current, new: form.new } })
      setDone(true)
      setForm({ current: '', new: '', again: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Password</h2>
      {user.demo_brand ? (
        <p className="mt-2 text-sm text-muted">
          Demo people have no password. You switch between them with <span className="font-semibold text-ink">Act as</span> at
          the top. To have an account of your own, create a brand from the sign-in page.
        </p>
      ) : (
        <form className="mt-3 grid gap-3" onSubmit={save}>
          <Field label="Current password">
            <input className={inputCls} type="password" autoComplete="current-password" required value={form.current} onChange={set('current')} />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={form.new} onChange={set('new')} />
          </Field>
          <Field label="New password again">
            <input className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={form.again} onChange={set('again')} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          {done && <p role="status" className="text-sm font-semibold text-primary-deep">Password changed. Use the new one next time you sign in.</p>}
          <div><Button kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button></div>
        </form>
      )}
    </Card>
  )
}

// A bookmark that sends the text selected on any web page to a new draft here, to check it.
// React does not render javascript: links, so the address is set on the element directly.
function Bookmarklet() {
  const ref = useRef(null)
  useEffect(() => {
    const code = `javascript:(()=>{const t=String(getSelection()).trim().slice(0,4000);if(!t){alert('Select some text on the page first, then click Check with BrandGuard.');return}open('${location.origin}/new?text='+encodeURIComponent(t),'_blank')})()`
    ref.current?.setAttribute('href', code)
  }, [])
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Check text from any web page</h2>
      <ol className="mt-3 grid gap-2 text-sm">
        {['Drag the button below to your browser’s bookmarks bar.', 'On any page (a CMS, a doc, an email), select some text.',
          'Click the bookmark: the text opens here as a new draft, ready to check.'].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-ink text-xs font-bold">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <a ref={ref} onClick={(e) => e.preventDefault()} draggable title="Drag me to your bookmarks bar"
        className="mt-4 inline-flex cursor-grab items-center gap-2 rounded-md border-2 border-ink bg-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-print-sm active:cursor-grabbing">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="M4 2h8v12l-4-3-4 3z" fill="currentColor" /></svg>
        Check with BrandGuard
      </a>
    </Card>
  )
}
