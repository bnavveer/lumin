import { useState } from 'react'
import type { Evidence } from '../../../shared/workflow'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { safeUrl, timeAgo } from './ui'

// One renderer per EvidenceKind. Links, images and frames only ever use
// http(s) URLs (safeUrl), and all text is rendered as text.

const imageUrl = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null
  const chips = items.filter((e) => e.kind === 'keewano_event')
  const rest = items.filter((e) => e.kind !== 'keewano_event')
  return (
    <div className="mt-4 flex flex-col gap-3">
      <h4 className="type-label-m text-secondary">Evidence</h4>
      <ul className="flex flex-col gap-3">
        {rest.map((e) => <li key={e.id}><EvidenceItem e={e} /></li>)}
      </ul>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Events recorded">
          {chips.map((e) => (
            <li key={e.id} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-tertiary px-2.5 type-label-s">
              <Icon name="check" size={12} strokeWidth={2.5} className="text-green-600" />
              {e.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Source({ e }: { e: Evidence }) {
  return (
    <p className="type-label-s text-tertiary">
      {[e.source, timeAgo(e.at)].filter(Boolean).join(' · ')}
    </p>
  )
}

function ExternalTitle({ e, className }: { e: Evidence; className?: string }) {
  const url = safeUrl(e.url)
  if (!url) return <span className={className}>{e.title}</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cx('inline-flex items-start gap-1.5 rounded-4 text-link underline underline-offset-4 focus-ring', className)}>
      <span>{e.title}</span>
      <Icon name="external" size={14} className="mt-1 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

const card = 'rounded-24 border border-border-tertiary bg-background-primary p-4'

function EvidenceItem({ e }: { e: Evidence }) {
  const url = safeUrl(e.url)
  switch (e.kind) {
    case 'citation':
      return (
        <div className={card}>
          <ExternalTitle e={e} className="type-body-m font-medium" />
          {e.detail && <blockquote className="mt-2 border-l-2 border-border-secondary pl-3 type-body-s text-secondary">“{e.detail}”</blockquote>}
          <div className="mt-2"><Source e={e} /></div>
        </div>
      )
    case 'document': {
      const thumb = url && imageUrl.test(url) ? url : null
      return (
        <div className={cx(card, 'flex gap-4')}>
          {thumb && <Thumb src={thumb} alt={`Preview of ${e.title}`} href={url!} className="h-20 w-16 shrink-0" />}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 type-body-m font-medium"><Icon name="document" size={16} className="shrink-0" />{e.title}</p>
            {e.detail && <p className="mt-1 type-body-s text-secondary">{e.detail}</p>}
            {url && !thumb && <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block rounded-4 type-body-s text-link underline underline-offset-4 focus-ring">View file<span className="sr-only"> (opens in a new tab)</span></a>}
            <div className="mt-2"><Source e={e} /></div>
          </div>
        </div>
      )
    }
    case 'live_view':
      return (
        <div className={cx(card, 'flex flex-wrap items-center justify-between gap-3')}>
          <div>
            <p className="type-body-m font-medium">{e.title}</p>
            {e.detail && <p className="type-body-s text-secondary">{e.detail}</p>}
          </div>
          {url && <OpenLive href={url} />}
        </div>
      )
    case 'screenshot':
      return (
        <div className={card}>
          {url && <Thumb src={url} alt={e.title} href={url} className="aspect-[16/10] w-full" />}
          <p className="mt-2 type-body-s font-medium">{e.title}</p>
          {e.detail && <p className="type-body-s text-secondary">{e.detail}</p>}
          <Source e={e} />
        </div>
      )
    case 'replay':
      return (
        <div className={cx(card, 'flex flex-wrap items-center justify-between gap-3')}>
          <div>
            <p className="type-body-m font-medium">{e.title}</p>
            {e.detail && <p className="type-body-s text-secondary">{e.detail}</p>}
          </div>
          {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-border-primary px-4 text-sm font-medium focus-ring hover:bg-background-tertiary"><Icon name="play" size={14} />Watch replay<span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      )
    case 'confirmation':
      return (
        <div className="rounded-24 bg-green-50 p-5">
          <p className="flex items-center gap-1.5 type-label-m text-green-600"><Icon name="check-circle" size={16} />{e.title}</p>
          <p className="mt-2 break-all font-serif text-[2.25rem] leading-none tracking-[-0.03em] [font-variation-settings:'opsz'_48]">{e.detail ?? '—'}</p>
          <div className="mt-3"><Source e={e} /></div>
        </div>
      )
    case 'call_transcript':
      return <Transcript e={e} />
    case 'message':
      return (
        <div className="flex flex-col items-start gap-1">
          <div className="max-w-[85%] rounded-24 rounded-bl-4 bg-background-secondary px-4 py-3 type-body-m whitespace-pre-wrap">{e.detail ?? e.title}</div>
          <p className="flex items-center gap-1.5 pl-2 type-label-s text-tertiary"><Icon name="message" size={12} />{e.title} · {timeAgo(e.at)}</p>
        </div>
      )
    default:
      return <div className={card}><ExternalTitle e={e} className="type-body-m font-medium" /><Source e={e} /></div>
  }
}

export function OpenLive({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-700 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-ring">
      Open live browser <Icon name="external" size={14} /><span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Thumb({ src, alt, href, className }: { src: string; alt: string; href: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cx('block overflow-hidden rounded-12 bg-background-tertiary focus-ring', className)}>
      <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
    </a>
  )
}

function Transcript({ e }: { e: Evidence }) {
  const lines = (e.detail ?? '').split('\n').filter(Boolean)
  return (
    <details className={cx(card, 'group')}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-4 focus-ring">
        <span className="flex items-center gap-2 type-body-m font-medium"><Icon name="phone" size={16} />{e.title}</span>
        <span className="inline-flex items-center gap-1 type-label-s text-secondary">Transcript <Icon name="chevron-down" size={14} className="transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="mt-3 flex flex-col gap-2 border-t border-border-tertiary pt-3">
        {lines.length === 0 && <p className="type-body-s text-secondary">No transcript yet.</p>}
        {lines.map((l, i) => {
          const m = /^([A-Za-z][\w ]{0,20}):\s*(.*)$/.exec(l)
          return <p key={i} className="type-body-s">{m ? <><span className="font-medium">{m[1]}: </span><span className="text-secondary">{m[2]}</span></> : l}</p>
        })}
      </div>
      <div className="mt-3"><Source e={e} /></div>
    </details>
  )
}
