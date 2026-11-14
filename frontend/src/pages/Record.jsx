import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { ACTION_LABEL, Button, ErrorNote, FINDING_STATUS, PageLoading, SEVERITY } from '../ui.jsx'

const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

// A one-page record of how a draft was reviewed, made to be printed or saved as PDF.
export default function Record({ user }) {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/drafts/${id}`).then(setD).catch((e) => setError(e.message))
  }, [id])
  if (!d) return error ? <ErrorNote>{error}</ErrorNote> : <PageLoading />

  const approved = d.status === 'approved'
  const timeline = [...d.history].reverse()
  const approval = d.history.find((h) => h.action === 'approved')
  const escalation = d.history.find((h) => h.action === 'sent_to_authorised_review')
  const decided = d.findings.filter((f) => f.status !== 'open')
  const stillOpen = d.findings.filter((f) => f.status === 'open')

  return (
    <article className="record mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/drafts/${d.id}`} className="text-sm font-semibold text-primary hover:underline">← Back to the draft</Link>
        <Button kind="primary" onClick={() => window.print()}>Print or save as PDF</Button>
      </div>

      <header className="mt-6 border-b-2 border-ink pb-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">
          BrandGuard AI · {approved ? 'Approval record' : 'Review record (not approved yet)'}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">{d.title}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Row label="Channel">{d.channel || 'Not stated'}</Row>
          <Row label="Audience">{d.audience || 'Not stated'}</Row>
          <Row label="Purpose">{d.purpose || 'Not stated'}</Row>
          <Row label="Written by">{d.creator}</Row>
          <Row label={approved ? 'Approved version' : 'Current version'}>Version {d.version}</Row>
          {approval && <Row label="Approved by">{approval.user}, {when(approval.created_at)}</Row>}
          {escalation && <Row label="Escalated by">{escalation.user}, {when(escalation.created_at)}</Row>}
        </dl>
      </header>

      <Section title={approved ? 'Approved text' : 'Current text'}>
        <p className="whitespace-pre-wrap rounded-lg border-2 border-line bg-white p-4 leading-7">{d.body}</p>
      </Section>

      <Section title={`Findings handled (${decided.length})`}>
        {decided.length === 0 ? <p className="text-sm text-muted">No findings were handled.</p> : <FindingTable rows={decided} />}
      </Section>

      {stillOpen.length > 0 && (
        <Section title={`Findings left open (${stillOpen.length})`}>
          <p className="mb-2 text-sm text-muted">
            {approved ? 'Approved with these lower-risk findings still open.' : 'Not yet handled.'}
          </p>
          <FindingTable rows={stillOpen} />
        </Section>
      )}

      {d.run && (
        <Section title="How the last check was run">
          <ul className="grid gap-1 text-sm">
            <li>Version {d.run.version}, checked {when(d.run.created_at)}.</li>
            <li>{d.run.exact_count} finding(s) from exact checks in code.</li>
            <li>{d.run.ai_used
              ? `${d.run.ai_count} finding(s) from AI (${d.run.ai_provider}, ${d.run.ai_model}); ${d.run.dropped_count} dropped by verification.`
              : 'AI was not used.'}</li>
            <li>{d.run.ai_note}</li>
          </ul>
        </Section>
      )}

      <Section title="Sign-off">
        <div className="grid gap-6 sm:grid-cols-2">
          {escalation && <Signature entry={escalation} role="Approved and escalated" i={0} />}
          {approval ? <Signature entry={approval} role="Approved for publishing" i={escalation ? 1 : 0} />
            : <div className="self-end"><div className="h-12 border-b-2 border-ink" /><p className="mt-1 text-sm text-muted">Awaiting approval</p></div>}
        </div>
      </Section>

      <Section title="Timeline">
        <ol className="grid gap-1.5 text-sm">
          {timeline.map((h, i) => (
            <li key={i} className="grid gap-x-4 sm:grid-cols-[11rem_1fr]">
              <span className="text-muted">{when(h.created_at)}</span>
              <span>
                <span className="font-semibold">{h.user}</span> {ACTION_LABEL[h.action] || h.action}
                {h.detail && <span className="block text-muted">{h.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <p className="mt-8 border-t border-line pt-3 text-xs text-muted">
        Printed {when(new Date().toISOString())} by {user.name}. Taken from the append-only audit log. The automated check never approves; every decision above was made by a person.
      </p>
    </article>
  )
}

// The approver's name writes itself in, then a pen stroke underlines it.
function Signature({ entry, role, i }) {
  const [name, title] = entry.user.split(' (')
  return (
    <div className="signature" style={{ '--i': i }}>
      <p className="signature-name font-signature text-4xl leading-none text-primary-deep">{name}</p>
      <svg viewBox="0 0 240 14" className="-mt-1 h-3.5 w-60 max-w-full" aria-hidden="true">
        <path className="signature-stroke" d="M2 9 C 40 3, 80 12, 120 7 S 200 2, 238 6" fill="none" stroke="var(--color-primary-deep)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="mt-1 border-t-2 border-ink pt-1 text-sm">
        <p className="font-semibold">{name}{title ? `, ${title.replace(')', '')}` : ''}</p>
        <p className="text-muted">{role} · {when(entry.created_at)}</p>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold">{label}:</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function FindingTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b-2 border-line bg-paper">
          <tr>
            <th className="px-3 py-2">Rule</th>
            <th className="px-3 py-2">Risk</th>
            <th className="px-3 py-2">Passage</th>
            <th className="px-3 py-2">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="break-inside-avoid border-b border-line align-top last:border-0">
              <td className="px-3 py-2 font-semibold">{f.ref_code}</td>
              <td className="px-3 py-2">{SEVERITY[f.severity].label}</td>
              <td className="px-3 py-2">“{f.quote}”</td>
              <td className="px-3 py-2">
                <span className="font-semibold">{FINDING_STATUS[f.status] || 'Open'}</span>
                {f.note && <span className="block text-muted">{f.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
