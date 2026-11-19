// Images on a draft: the picture with what the review measured drawn on it (text lines, logo),
// its colours against the brand palette, contrast per line of text, and its description.
import { useState } from 'react'
import { api, BASE } from './api.js'
import { Button, Card, inputCls } from './ui.jsx'

export const imageSrc = (url) => BASE + url

export default function ImagePanel({ d, busy, act, onError }) {
  if (!d.images.length && !d.can.edit) return null
  return (
    <Card id="images" className="@container scroll-mt-24 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Images <span className="text-base font-normal text-muted">({d.images.length})</span></h2>
        {d.can.edit && d.images.length < 4 && <AddImage d={d} busy={busy} act={act} onError={onError} />}
      </div>
      {d.images.length === 0 && (
        <p className="mt-2 text-sm text-muted">No images. Add one and the check also reviews its colours, contrast, logo, any text in it, and its description.</p>
      )}
      <div className="mt-4 grid gap-6">
        {d.images.map((img, n) => (
          <OneImage key={img.id} n={n + 1} img={img} d={d} busy={busy} act={act} onError={onError} />
        ))}
      </div>
    </Card>
  )
}

function AddImage({ d, busy, act, onError }) {
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onError('')
    await act('image', `/drafts/${d.id}/images`, { __form: { file } })
  }
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-ink bg-card px-3.5 py-1.5 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-primary-soft ${busy ? 'pointer-events-none opacity-50' : ''}`}>
      {busy === 'image' ? 'Adding…' : 'Add image'}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={pick} disabled={!!busy} />
    </label>
  )
}

function OneImage({ n, img, d, busy, act }) {
  const a = img.analysis
  const [alt, setAlt] = useState(img.alt_text)
  const [show, setShow] = useState(true)
  const failing = (a?.lines || []).filter((l) => l.contrast && !l.contrast.passes).length
  const off = (a?.colours || []).filter((c) => c.off).length
  return (
    <figure id={`image-${img.id}`} className="scroll-mt-24 grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <div>
        <div className="relative overflow-hidden rounded-lg border-2 border-line bg-white">
          <img src={imageSrc(img.url)} alt={img.alt_text || `Image ${n}, not described yet`} className="block h-auto w-full" />
          {a && show && (
            <svg viewBox={`0 0 ${img.width} ${img.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {a.lines.filter((l) => l.box).map((l, i) => (
                <rect key={i} className="box-trace" style={{ '--i': i }} x={l.box[0]} y={l.box[1]} width={l.box[2] - l.box[0]} height={l.box[3] - l.box[1]}
                  fill="none" stroke={l.contrast && !l.contrast.passes ? '#c0261b' : '#2f3bd9'} strokeWidth={Math.max(2, img.width / 300)} rx="4" pathLength="1" />
              ))}
              {a.logo?.box && (
                <rect className="box-fade" style={{ '--i': a.lines.length }} x={a.logo.box[0]} y={a.logo.box[1]} width={a.logo.box[2] - a.logo.box[0]} height={a.logo.box[3] - a.logo.box[1]}
                  fill="none" stroke={a.logo.issues.length ? '#c0261b' : '#2f3bd9'} strokeDasharray="10 6" strokeWidth={Math.max(2, img.width / 300)} rx="4" />
              )}
              {a.colours.filter((c) => c.off && c.box).map((c, i) => (
                <rect key={c.hex} className="box-fade" style={{ '--i': a.lines.length + 1 + i }} x={c.box[0] + 3} y={c.box[1] + 3} width={c.box[2] - c.box[0] - 6} height={c.box[3] - c.box[1] - 6}
                  fill="none" stroke="#d9a21b" strokeDasharray="14 8" strokeWidth={Math.max(3, img.width / 220)} />
              ))}
            </svg>
          )}
          {/* Labels on what was measured: the contrast of each failing line, and each off-brand colour area. */}
          {a && show && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {a.lines.filter((l) => l.box && l.contrast && !l.contrast.passes).map((l, i) => (
                <span key={i} className="box-fade absolute -translate-y-full whitespace-nowrap rounded-sm bg-[#c0261b] px-1 text-[10px] font-bold leading-4 text-white"
                  style={{ left: `${(l.box[0] / img.width) * 100}%`, top: `${(l.box[1] / img.height) * 100}%`, '--i': i + 1 }}>
                  {l.contrast.ratio}:1
                </span>
              ))}
              {a.colours.filter((c) => c.off && c.box).map((c, i) => (
                <span key={c.hex} className="box-fade absolute flex items-center gap-1 whitespace-nowrap rounded-sm bg-ink px-1 text-[10px] font-bold leading-4 text-paper"
                  style={{ left: `calc(${(c.box[0] / img.width) * 100}% + 6px)`, top: `calc(${(c.box[1] / img.height) * 100}% + 6px)`, '--i': a.lines.length + 1 + i }}>
                  <span className="h-2 w-2 rounded-sm border border-white/60" style={{ background: c.hex }} />off-brand
                </span>
              ))}
            </div>
          )}
          {a && <span key={img.id} aria-hidden="true" className="img-scan pointer-events-none absolute inset-x-0 top-0 h-1" />}
        </div>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="font-semibold text-ink">Image {n}</span>
          <span>{img.filename}</span>
          {a && (
            <button className="font-semibold text-primary hover:underline" onClick={() => setShow(!show)} aria-pressed={show}>
              {show ? 'Hide' : 'Show'} what was measured
            </button>
          )}
          {d.can.edit && (
            <button className="ml-auto font-semibold text-red-800 hover:underline" disabled={!!busy}
              onClick={() => act('image-remove', `/images/${img.id}`, { __method: 'DELETE' })}>
              Remove image
            </button>
          )}
        </figcaption>
        <div className="mt-3">
          <label className="block text-sm font-semibold" htmlFor={`alt-${img.id}`}>Description for screen readers</label>
          {d.can.edit ? (
            <div className="mt-1 flex gap-2">
              <input id={`alt-${img.id}`} className={`${inputCls} min-w-0`} value={alt} onChange={(e) => setAlt(e.target.value)}
                placeholder="What does the image show? Include any text in it." maxLength={1000} />
              <Button kind="dark" disabled={!!busy || alt.trim() === img.alt_text}
                onClick={() => act('alt', `/images/${img.id}`, { __method: 'PUT', data: { alt_text: alt } })}>Save</Button>
            </div>
          ) : (
            <p className="mt-1 text-sm">{img.alt_text || <span className="text-muted">Not described yet.</span>}</p>
          )}
        </div>
      </div>

      {a ? (
        <div className="grid content-start gap-4 text-sm">
          <section>
            <h3 className="font-semibold">Colours {off > 0 && <span className="text-red-800">· {off} off-brand</span>}</h3>
            <ul className="mt-2 grid gap-1.5">
              {a.colours.map((c, i) => (
                <li key={c.hex} className="swatch-in flex items-center gap-2" style={{ '--i': i }}>
                  <span className="h-5 w-5 shrink-0 rounded border border-black/15" style={{ background: c.hex }} />
                  <span className="w-16 font-mono text-xs">{c.hex}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-black/5"><span className="block h-full rounded-full bg-ink/60" style={{ width: `${Math.round(c.share * 100)}%` }} /></span>
                  <span className="w-9 text-right tabular-nums text-xs">{Math.round(c.share * 100)}%</span>
                  <span className={`w-16 text-right text-xs font-semibold ${c.off ? 'text-red-800' : 'text-muted'}`}>
                    {c.off ? 'off-brand' : c.neutral ? 'neutral' : c.distance !== null && c.distance <= 25 ? 'on brand' : c.nearest ? 'small detail' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {a.palette.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
                Brand colours:
                {a.palette.map((h) => <span key={h} title={h} className="inline-block h-4 w-4 rounded border border-black/15" style={{ background: h }} />)}
              </p>
            )}
          </section>
          {a.lines.length > 0 && (
            <section>
              <h3 className="font-semibold">Text in the image {failing > 0 && <span className="text-red-800">· {failing} hard to read</span>}</h3>
              <ul className="mt-2 grid gap-2">
                {a.lines.map((l, i) => (
                  <li key={i} className="rounded-md border border-line bg-white p-2">
                    <p className="font-semibold">“{l.text}”</p>
                    {l.contrast ? <ContrastMeter c={l.contrast} /> : <p className="text-xs text-muted">Contrast not measured.</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {a.logo && (
            <section>
              <h3 className="font-semibold">Logo</h3>
              <p className={`mt-1 ${a.logo.issues.length ? 'font-semibold text-red-800' : 'text-muted'}`}>
                {!a.logo.present ? 'Not found in the image.' : a.logo.issues.length ? `Used wrongly: ${a.logo.issues.join(', ')}.` : 'Used as supplied.'}
              </p>
            </section>
          )}
          {a.note && <p className="text-xs text-muted">{a.note}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted">Run the check to review this image.</p>
      )}
    </figure>
  )
}

// The measured ratio against what WCAG asks for, on a scale up to 7:1.
function ContrastMeter({ c }) {
  const at = (r) => `${Math.min(100, ((r - 1) / 6) * 100)}%`
  return (
    <div className="mt-1.5">
      <div className="relative h-2 rounded-full bg-black/5" role="img" aria-label={`Contrast ${c.ratio} to 1; needs ${c.needed} to 1`}>
        <span className={`meter-fill absolute inset-y-0 left-0 rounded-full ${c.passes ? 'bg-primary' : 'bg-red-700'}`} style={{ width: at(c.ratio) }} />
        <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-ink" style={{ left: at(c.needed) }} title={`Needed: ${c.needed}:1`} />
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs">
        <span className="h-3 w-3 rounded-sm border border-black/15" style={{ background: c.text }} />
        on
        <span className="h-3 w-3 rounded-sm border border-black/15" style={{ background: c.background }} />
        <span className={`font-semibold ${c.passes ? '' : 'text-red-800'}`}>{c.ratio}:1</span>
        <span className="text-muted">needs {c.needed}:1{c.large ? ' (large text)' : ''}</span>
      </p>
    </div>
  )
}
