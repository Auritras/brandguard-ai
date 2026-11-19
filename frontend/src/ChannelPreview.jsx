// The draft as it would appear in its channel: a LinkedIn post, an Instagram post, or an email in the
// inbox. The highlights stay on, and the point where the channel cuts the text off ("…see more") is drawn,
// with what falls below it shown fainter. Simple mock-ups, not the real apps.
import { BASE } from './api.js'
import { SEVERITY } from './ui.jsx'

// Roughly where each channel cuts the text before "see more" (characters), or the inbox preview length.
export const CUT = { LinkedIn: 210, Instagram: 125, Email: 90 }

function split(pieces, n) {
  const before = [], after = []
  let pos = 0
  for (const p of pieces) {
    const end = pos + p.text.length
    if (end <= n) before.push(p)
    else if (pos >= n) after.push(p)
    else {
      before.push({ ...p, text: p.text.slice(0, n - pos) })
      after.push({ ...p, text: p.text.slice(n - pos) })
    }
    pos = end
  }
  return [before, after]
}

const show = (list, key) => list.map((p, i) => (p.f
  ? <mark key={`${key}${i}`} className={`${SEVERITY[p.f.severity].mark} rounded-sm`} title={p.f.reason}>{p.text}</mark>
  : <span key={`${key}${i}`}>{p.text}</span>))

function Fold({ label, after }) {
  if (!after.length) return null
  const hidden = after.filter((p) => p.f).length
  return (
    <>
      <div className="my-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="h-px flex-1 border-t-2 border-dashed border-line" />{label}<span className="h-px flex-1 border-t-2 border-dashed border-line" />
      </div>
      <p className="whitespace-pre-wrap opacity-55">{show(after, 'a')}</p>
      {hidden > 0 && <p className="mt-2 text-xs font-semibold text-accent-deep">{hidden === 1 ? '1 highlighted problem is' : `${hidden} highlighted problems are`} below the cut-off, where fewer people read.</p>}
    </>
  )
}

export default function ChannelPreview({ view, d, pieces, brand }) {
  const name = brand || 'Your brand'
  const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const img = d.images?.[0]
  // Cut where the channel would, at the end of the last whole word before the limit.
  const full = pieces.map((p) => p.text).join('')
  const space = full.lastIndexOf(' ', CUT[view])
  const [before, after] = split(pieces, full.length > CUT[view] && space > CUT[view] * 0.6 ? space : CUT[view])
  const avatar = <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink font-display font-bold text-paper">{name[0]}</span>

  if (view === 'LinkedIn') {
    return (
      <div className="mt-3 max-w-xl rounded-lg border border-black/15 bg-white text-[14px] leading-6 shadow-sm">
        <div className="flex items-center gap-3 p-3">
          {avatar}
          <div className="leading-tight"><p className="font-semibold">{name}</p><p className="text-xs text-muted">Promoted · 1h</p></div>
        </div>
        <div className="px-3 pb-3">
          <p className="whitespace-pre-wrap">{show(before, 'b')}{after.length > 0 && <span className="font-semibold text-muted">…see more</span>}</p>
          <Fold label='after "see more"' after={after} />
        </div>
        {img && <img src={BASE + img.url} alt={img.alt_text || ''} className="block w-full border-y border-black/10" />}
        <div className="flex justify-around px-3 py-2 text-xs font-semibold text-muted"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
      </div>
    )
  }
  if (view === 'Instagram') {
    return (
      <div className="mt-3 max-w-sm rounded-lg border border-black/15 bg-white text-[14px] leading-6 shadow-sm">
        <div className="flex items-center gap-2 p-2.5">{avatar}<p className="font-semibold">{handle}</p></div>
        {img ? <img src={BASE + img.url} alt={img.alt_text || ''} className="block aspect-square w-full object-cover" />
          : <div className="grid aspect-square w-full place-items-center bg-paper text-sm text-muted">No image on this draft</div>}
        <div className="flex gap-4 px-3 pt-2 text-xs font-semibold text-muted"><span>♡ Like</span><span>Comment</span><span>Share</span></div>
        <div className="px-3 pb-3 pt-1">
          <p className="whitespace-pre-wrap"><span className="font-semibold">{handle} </span>{show(before, 'b')}{after.length > 0 && <span className="text-muted">… more</span>}</p>
          <Fold label='after "more"' after={after} />
        </div>
      </div>
    )
  }
  // Email: the inbox row (subject and preview), then the opened message.
  return (
    <div className="mt-3 max-w-xl overflow-hidden rounded-lg border border-black/15 bg-white text-[14px] leading-6 shadow-sm">
      <div className="flex items-start gap-3 border-b border-black/10 bg-primary-soft/40 p-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="flex justify-between gap-2"><span className="font-semibold">{name}</span><span className="text-xs text-muted">9:41</span></p>
          <p className="truncate font-semibold">{d.title}</p>
          <p className="truncate text-muted">{before.map((p) => p.text).join('')}</p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs text-muted">The inbox shows only the start of the text, above. The opened email:</p>
        <p className="mt-2 whitespace-pre-wrap">{show(before, 'b')}{show(after, 'a')}</p>
        {img && <img src={BASE + img.url} alt={img.alt_text || ''} className="mt-3 block w-full rounded" />}
      </div>
    </div>
  )
}
