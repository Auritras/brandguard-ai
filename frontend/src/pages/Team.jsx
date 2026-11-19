import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, ErrorNote, Field, PageLoading, inputCls, timeAgo } from '../ui.jsx'

const ROLES = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }
const ROLE_HELP = {
  creator: 'Writes drafts and fixes findings. Sees only their own drafts.',
  manager: 'Reviews every draft; approves when nothing high-risk is open.',
  reviewer: 'Owns the Brand Library and the team; decides high-risk findings.',
}

// Teammates removed earlier, with a way to add each back (same role and password as before).
function Removed({ onRestored }) {
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { api('/team/removed').then(setPeople).catch(() => {}) }, [])
  if (!people.length) return null
  return (
    <details className="mt-6 rounded-lg border-2 border-line bg-card p-4">
      <summary className="cursor-pointer font-semibold">Removed teammates ({people.length})</summary>
      <ErrorNote>{error}</ErrorNote>
      <ul className="mt-3 grid gap-2 text-sm">
        {people.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-2.5">
            <span className="flex-1"><span className="font-semibold">{m.name}</span> <span className="text-muted">· {m.email}</span></span>
            <Button onClick={async () => {
              try {
                const team = await api(`/team/${m.id}/restore`, { method: 'POST' })
                setPeople(people.filter((p) => p.id !== m.id))
                onRestored(team)
              } catch (e) { setError(e.message) }
            }}>Add back</Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">They come back with the role and password they had. Their past work never left the record.</p>
    </details>
  )
}

const order = { reviewer: 0, manager: 1, creator: 2 }
const ROLE_COLOUR = { reviewer: 'bg-ink text-paper', manager: 'bg-primary text-white', creator: 'bg-primary-soft text-primary-deep' }
// What each role has done most, so each card shows the numbers that matter for that person.
const DONE = {
  creator: [['written', 'drafts written'], ['sent', 'sent for review']],
  manager: [['approved', 'approved'], ['sent_back', 'sent back']],
  reviewer: [['approved', 'approved'], ['waived', 'waived']],
}

function Person({ m, i, st, user, owner, busy, confirm, setConfirm, run }) {
  const name = m.name.split(' (')[0]
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const waiting = st?.waiting || 0
  return (
    <Card className={`deal-in relative flex flex-col overflow-hidden p-5 ${m.you ? 'border-ink' : ''}`} style={{ '--i': i }}>
      {waiting > 0 && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-accent" />}
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-lg font-bold ${ROLE_COLOUR[m.role]}`}>{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-tight">{name}{m.you && <span className="font-sans text-sm font-normal text-muted"> (you)</span>}</p>
          <p className="text-sm font-semibold text-muted">{ROLES[m.role]}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">{ROLE_HELP[m.role]}</p>
      {!user.sandbox && <p className="mt-2 truncate text-xs text-muted" title={m.email}>{m.email}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <div>
          <p className={`font-display text-2xl font-bold tabular-nums ${waiting ? 'text-accent-deep' : ''}`}>{st ? waiting : '–'}</p>
          <p className="text-xs text-muted">{m.you ? 'waiting for you' : 'waiting for them'}</p>
        </div>
        {DONE[m.role].map(([k, label]) => (
          <div key={k}>
            <p className="font-display text-2xl font-bold tabular-nums">{st ? st[k] : '–'}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{st?.last_active ? `Last active ${timeAgo(st.last_active)}` : st ? 'Not active yet' : ''}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {user.sandbox && !m.you && (
          <Button onClick={() => dispatchEvent(new CustomEvent('bg-act-as', { detail: m.role }))}>Act as {name}</Button>
        )}
        {owner && !m.you && (
          <>
            <label className="sr-only" htmlFor={`role-${m.id}`}>Role for {m.name}</label>
            <select id={`role-${m.id}`} value={m.role} disabled={busy}
              onChange={(e) => run(() => api(`/team/${m.id}`, { method: 'PUT', body: { role: e.target.value } }))}
              className="cursor-pointer rounded-md border-2 border-line bg-card px-2 py-1 text-sm font-semibold hover:border-ink">
              {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            {confirm === m.id ? (
              <span className="flex items-center gap-1">
                <Button kind="dark" disabled={busy} onClick={async () => { if (await run(() => api(`/team/${m.id}`, { method: 'DELETE' }))) setConfirm(null) }}>
                  Remove
                </Button>
                <Button kind="ghost" onClick={() => setConfirm(null)}>Keep</Button>
              </span>
            ) : (
              <Button kind="ghost" onClick={() => setConfirm(m.id)} aria-label={`Remove ${m.name}`}>Remove…</Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// How a draft moves through the team, and where it can go back.
function Flow() {
  const step = (n, title, text, i) => (
    <li className="deal-in relative flex-1 rounded-lg border-2 border-line bg-white p-3" style={{ '--i': i }}>
      <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-card text-xs font-bold">{n}</span>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{text}</p>
    </li>
  )
  const arrow = <li aria-hidden="true" className="hidden self-center text-xl text-muted sm:block">→</li>
  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">How a draft moves</h2>
      <ol className="mt-4 flex flex-col gap-2 sm:flex-row">
        {step(1, 'Writer', 'Writes it, runs the check, fixes or disputes what it finds, sends it.', 0)}
        {arrow}
        {step(2, 'Manager', 'Approves it, or sends it back. With high-risk findings open, approving passes it up.', 1)}
        {arrow}
        {step(3, 'Brand owner', 'Waives each high-risk finding with a reason, or sends it back, then approves.', 2)}
      </ol>
      <p className="mt-3 text-sm text-muted">
        Approved drafts are locked, with a review record of every decision. Whoever writes a draft never decides it: if the
        manager or the brand owner writes one, someone else on the team reviews it.
      </p>
    </Card>
  )
}

const CAN = [
  ['Write drafts and run the check', true, true, true],
  ['Fix or dispute findings on their own drafts', true, true, true],
  ['Approve drafts, or send them back', false, 'When nothing high-risk is open', true],
  ['Waive a high-risk finding, decide a high-risk dispute', false, false, true],
  ['Change the Brand Library (rules, facts, terms, colours, logo)', false, false, true],
  ['Add, change or remove teammates', false, false, true],
]

function Permissions() {
  const mark = (v) => (v === true ? <span className="font-bold text-good" aria-label="Yes">✓</span>
    : v === false ? <span className="text-muted" aria-label="No">–</span> : <span className="text-xs">{v}</span>)
  return (
    <Card className="overflow-x-auto p-5">
      <h2 className="font-display text-xl font-bold">Who can do what</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-line text-xs text-muted">
            <th className="py-2 pr-2 font-semibold"><span className="sr-only">Action</span></th>
            <th className="px-1 py-2 text-center font-semibold">Writer</th>
            <th className="px-1 py-2 text-center font-semibold">Manager</th>
            <th className="px-1 py-2 text-center font-semibold">Owner</th>
          </tr>
        </thead>
        <tbody>
          {CAN.map(([what, ...who]) => (
            <tr key={what} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-2 font-normal">{what}</th>
              {who.map((v, i) => <td key={i} className="px-1 py-2 text-center">{mark(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Nobody approves, waives or decides a dispute on a draft they wrote.</p>
    </Card>
  )
}

export default function Team({ user }) {
  const [team, setTeam] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState('')
  const [confirm, setConfirm] = useState(null) // id of the teammate about to be removed
  const [form, setForm] = useState({ name: '', email: '', role: 'creator', password: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const owner = user.role === 'reviewer' && !user.demo_brand

  const [stats, setStats] = useState({})
  useEffect(() => {
    api('/team').then(setTeam).catch((e) => setError(e.message))
    api('/team/stats').then(setStats).catch(() => {})
  }, [])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      setTeam(await fn())
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!team) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading kind="cards" />

  const people = [...team].sort((x, y) => (order[x.role] ?? 3) - (order[y.role] ?? 3) || x.name.localeCompare(y.name))
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Team</h1>
      <p className="mt-1 max-w-3xl text-muted">
        {team.length === 1 ? 'One person works' : `${team.length} people work`} on {user.brand}. Only they can see its drafts and Brand
        Library, and nobody approves their own work, so every draft is decided by someone else.
      </p>
      {user.sandbox && (
        <p className="mt-3 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-deep">
          This is your demo copy, so the team is fixed. <span className="font-semibold">Act as</span> anyone below to see the product from their side.
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
        {people.map((m, i) => (
          <Person key={m.id} m={m} i={i} st={stats[m.id]} user={user} owner={owner} busy={busy}
            confirm={confirm} setConfirm={setConfirm} run={run} />
        ))}
      </div>

      <div className="mt-8 grid gap-6">
        <Flow />
        <Permissions />
      </div>
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>

      {owner && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-xl font-bold">Add a teammate</h2>
          <p className="mt-1 text-sm text-muted">Give them the email and starting password to sign in with.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await run(() => api('/team', { method: 'POST', body: form }))) {
                setAdded(`${form.name} can now sign in as ${ROLES[form.role]} with ${form.email}.`)
                setForm({ name: '', email: '', role: 'creator', password: '' })
              }
            }}>
            <Field label="Name"><input className={inputCls} required minLength={2} value={form.name} onChange={set('name')} /></Field>
            <Field label="Email"><input className={inputCls} type="email" required value={form.email} onChange={set('email')} /></Field>
            <Field label="Role" hint={ROLE_HELP[form.role]}>
              <select className={inputCls} value={form.role} onChange={set('role')}>
                {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
            <Field label="Starting password" hint="At least 8 characters.">
              <input className={inputCls} type="text" autoComplete="off" required minLength={8} value={form.password} onChange={set('password')} />
            </Field>
            <div className="sm:col-span-2">
              <Button kind="primary" type="submit" disabled={busy}>Add to {user.brand}</Button>
            </div>
          </form>
          {added && <p role="status" className="mt-3 text-sm font-semibold text-primary-deep">{added}</p>}
        </Card>
      )}
      {owner && !user.demo_brand && <Removed key={team.length} onRestored={setTeam} />}
    </div>
  )
}
