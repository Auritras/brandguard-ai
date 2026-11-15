import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, ErrorNote, Field, PageLoading, inputCls } from '../ui.jsx'

const ROLES = { creator: 'Creator', manager: 'Manager', reviewer: 'Brand owner' }
const ROLE_HELP = {
  creator: 'Writes drafts and fixes findings. Sees only their own drafts.',
  manager: 'Reviews every draft; approves when nothing high-risk is open.',
  reviewer: 'Owns the Brand Library and the team; decides high-risk findings.',
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

  useEffect(() => {
    api('/team').then(setTeam).catch((e) => setError(e.message))
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

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold">Team</h1>
      <p className="mt-1 text-muted">
        Everyone who works on {user.brand}. Only these people can see its drafts and Brand Library. Someone you remove
        can no longer sign in, but their name stays on the drafts and history they worked on.
      </p>
      {user.demo_brand && (
        <p className="mt-3 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-deep">
          {user.sandbox
            ? 'This is your demo copy, so its team is fixed. Use "Act as" at the top to be someone else, or create your own brand from the sign-in page to add people.'
            : 'This is the demo brand, so its team is fixed. Create your own brand from the sign-in page to add people.'}
        </p>
      )}

      <Card className="mt-6 divide-y divide-line">
        {team.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold">{m.name}{m.you && <span className="font-normal text-muted"> (you)</span>}</p>
              <p className="truncate text-sm text-muted">{m.email}</p>
            </div>
            {owner && !m.you && (confirm === m.id ? (
              <span className="flex items-center gap-2">
                <Button kind="dark" disabled={busy} onClick={async () => { if (await run(() => api(`/team/${m.id}`, { method: 'DELETE' }))) setConfirm(null) }}>
                  Remove {m.name}
                </Button>
                <Button kind="ghost" onClick={() => setConfirm(null)}>Keep</Button>
              </span>
            ) : (
              <Button kind="ghost" onClick={() => setConfirm(m.id)} aria-label={`Remove ${m.name}`}>Remove</Button>
            ))}
            {owner ? (
              <select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy}
                onChange={(e) => run(() => api(`/team/${m.id}`, { method: 'PUT', body: { role: e.target.value } }))}
                className="cursor-pointer rounded-md border-2 border-line bg-card px-2 py-1 text-sm font-semibold hover:border-ink">
                {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            ) : (
              <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold">{ROLES[m.role]}</span>
            )}
          </div>
        ))}
      </Card>
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
    </div>
  )
}
