import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { SourcesCard } from '../components/Chat'
import { cx } from '../components/cx'
import { CaliforniaFlag } from '../components/Flags'
import { Icon } from '../components/icons'
import { Photo } from '../components/Photo'
import { photoById } from '../data/photos'
import { programs } from '../data/programs'
import { useAutoStep, useInView, usePlaying } from './hooks'
import { copies } from './copy'
import { useLang } from './lang'

const programPlainEs = copies.es.programPlain

// The animated tiles that sit in america.gov's feature cards. They use
// videos of their product; ours are built from our own components, our
// California photos and plain shapes, so there are no agency seals,
// third-party photos or fonts in them. Every tile can be paused, and they
// stop on their own when off screen or when reduced motion is on.

type L = 'en' | 'es'
const pick = <T,>(lang: L, v: { en: T; es: T }) => v[lang]

export function MediaTile({
  children,
  className,
  pausable = true,
  dark,
  label,
}: {
  children: ReactNode | ((playing: boolean) => ReactNode)
  className?: string
  pausable?: boolean
  dark?: boolean
  label?: string
}) {
  const { lang } = useLang()
  const [playing, setPlaying] = usePlaying()
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, margin: '0px' })
  const live = playing && visible
  return (
    <div
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      data-paused={!live}
      className={cx('media-tile relative isolate aspect-[3/2] w-full overflow-hidden rounded-48 max-mobile:rounded-32', className)}
    >
      {typeof children === 'function' ? children(live) : children}
      {pausable && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={pick(lang, playing ? { en: 'Pause animation', es: 'Pausar animación' } : { en: 'Play animation', es: 'Reproducir animación' })}
          className={cx(
            'absolute right-5 bottom-5 z-20 flex size-9 cursor-pointer items-center justify-center rounded-full backdrop-blur-md transition-colors focus-ring',
            dark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-blue-900/55 text-white hover:bg-blue-900/70',
          )}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
      )}
    </div>
  )
}

// Caption under a tile: "Bold lead. Muted sentence."
export function TileCaption({ lead, body }: { lead: string; body: string }) {
  return (
    <p className="mt-5 px-5 type-body-s text-secondary max-mobile:px-2">
      <span className="text-primary">{lead}</span> {body}
    </p>
  )
}

/* ── Home: the collage of programs and places (america.gov's "29,000 websites") ── */

export const categoryName = {
  en: { food: 'Food', health: 'Health', cash: 'Cash' },
  es: { food: 'Comida', health: 'Salud', cash: 'Efectivo' },
} as const

const mosaicPhotos = ['golden-gate', 'farmers-market-apricots', 'cable-car', 'palm-street-la', 'lake-tahoe', 'ferndale-main-street', 'salinas-farm-tractor', 'joshua-tree', 'bixby-bridge', 'venice-palms-sunset', 'la-skyline-sunset']

export function ProgramMosaic() {
  const { lang } = useLang()
  const cols = [0, 1, 2].map((c) => {
    const items: ReactNode[] = []
    for (let i = 0; i < 6; i++) {
      const k = c * 6 + i
      if ((k + c) % 2 === 0) {
        const id = mosaicPhotos[k % mosaicPhotos.length]
        items.push(
          <div key={k} className="aspect-[4/3] overflow-hidden rounded-12">
            <Photo photo={photoById[id]} sizes="200px" />
          </div>,
        )
      } else {
        const p = programs[k % programs.length]
        items.push(
          <div key={k} className="rounded-12 bg-white p-3.5 text-left text-primary">
            <p className="text-[0.625rem] leading-tight text-secondary">{categoryName[lang][p.category]}</p>
            <p className="mt-1 font-serif text-[1.35rem] leading-none tracking-[-0.03em]">{p.name}</p>
            <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-snug text-secondary">{lang === 'es' ? (programPlainEs[p.id] ?? p.plain) : p.plain}</p>
            <span className="mt-3 inline-flex rounded-full bg-blue-700 px-2.5 py-1 text-[0.625rem] font-medium text-white">
              {pick(lang, { en: 'Apply', es: 'Solicitar' })}
            </span>
          </div>,
        )
      }
    }
    return items
  })
  return (
    <MediaTile className="aspect-square bg-blue-900" dark>
      <div className="absolute inset-[-20%] flex rotate-[-10deg] gap-3" aria-hidden="true">
        {cols.map((items, c) => (
          <div key={c} className="flex-1 overflow-hidden">
            <div className="flex flex-col gap-3" style={{ animation: `marquee-y ${38 + c * 9}s linear infinite ${c % 2 ? 'reverse' : ''}` }}>
              {items}
              {items}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_50%,transparent,#000c1f99)]" />
    </MediaTile>
  )
}

/* ── Stars with a lock (privacy) ── */

const stars = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 37.7) % 100,
  y: (i * 61.3 + (i % 7) * 9) % 100,
  s: i % 9 === 0 ? 2 : 1,
  d: (i % 5) * 0.8,
}))

function Stars() {
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animation: `twinkle 3.2s ease-in-out ${s.d}s infinite` }}
        />
      ))}
    </>
  )
}

export function NightLock() {
  return (
    <MediaTile className="aspect-square bg-[linear-gradient(180deg,#000814_0%,#061a44_60%,#0b2a6b_100%)]" dark>
      {(playing) => (
        <>
          <Stars />
          <LockBadge playing={playing} />
        </>
      )}
    </MediaTile>
  )
}

function LockBadge({ playing }: { playing: boolean }) {
  const [tug, setTug] = useState(0)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setTug((n) => n + 1), 3200)
    return () => clearInterval(t)
  }, [playing])
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="flex aspect-square w-[30%] items-center justify-center rounded-full bg-white/90 text-blue-900 shadow-[0_20px_60px_#0008]">
        <Padlock tug={tug} className="size-11" />
      </span>
    </div>
  )
}

// A padlock that stays locked. Bump `tug` to replay a short "it's locked" jiggle.
export function Padlock({ tug = 0, className, hole = '#ffffff' }: { tug?: number; className?: string; hole?: string }) {
  return (
    <svg
      key={tug}
      viewBox="0 0 24 24"
      className={cx(className, tug > 0 && 'animate-[lock-shake_.5s_var(--ease-out-quint)]')}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" className={cx(tug > 0 && 'animate-[lock-tug_.5s_var(--ease-out-quint)]')} />
      <rect x="5" y="11" width="14" height="9.5" rx="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.3" r="1.5" fill={hole} stroke="none" />
    </svg>
  )
}

/* ── Home: the private document vault ── */

export function DocumentVault() {
  const { lang } = useLang()
  const t = pick(lang, {
    en: {
      title: 'Maria’s documents',
      sub: 'Only you can see these',
      docs: [
        ['Pay stub', 'September, $1,850'],
        ['Driver license', 'Proof of identity'],
        ['Lease', 'Proof of address'],
      ],
      next: 'Next step',
      nextBody: 'CalFresh interview, Oct 21',
      locked: 'Your documents are locked',
    },
    es: {
      title: 'Documentos de Maria',
      sub: 'Solo tú puedes verlos',
      docs: [
        ['Talón de pago', 'Septiembre, $1,850'],
        ['Licencia de manejo', 'Identidad'],
        ['Contrato de renta', 'Domicilio'],
      ],
      next: 'Siguiente paso',
      nextBody: 'Entrevista de CalFresh, 21 de oct.',
      locked: 'Tus documentos están protegidos',
    },
  })
  return (
    <MediaTile className="aspect-square bg-[linear-gradient(180deg,#000814_0%,#061a44_60%,#0b2a6b_100%)]" dark>
      {(playing) => (
        <>
          <Stars />
          <Vault t={t} playing={playing} />
        </>
      )}
    </MediaTile>
  )
}

type VaultText = { title: string; sub: string; docs: string[][]; next: string; nextBody: string; locked: string }
const docIcons = ['document', 'user', 'home'] as const

function Vault({ t, playing }: { t: VaultText; playing: boolean }) {
  // Each loop remounts the card so the arrivals replay; the lock closes when the last document lands.
  const [loop, setLoop] = useState(0)
  const [tug, setTug] = useState(0)
  useEffect(() => {
    if (!playing) return
    const next = setTimeout(() => setLoop((n) => n + 1), 9000)
    return () => clearTimeout(next)
  }, [playing, loop])
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[11%]">
      <div key={loop} className="relative w-full max-w-[19rem]">
        <div className="rounded-[1.6rem] bg-white p-4 text-primary shadow-[0_30px_80px_#0009]">
          <div className="flex items-center gap-3 pb-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-serif text-[1.1rem] text-blue-700">M</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.875rem] font-medium tracking-tight">{t.title}</span>
              <span className="block text-[0.6875rem] text-secondary">{t.sub}</span>
            </span>
            <button
              type="button"
              aria-label={t.locked}
              onClick={() => setTug((n) => n + 1)}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-700 text-white transition-transform active:scale-95 focus-ring"
            >
              <Padlock tug={tug} className="size-[18px]" hole="#002664" />
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {t.docs.map(([name, detail], i) => (
              <li key={name} className="relative flex items-center gap-3 rounded-[0.9rem] bg-[#f4f6fa] p-2">
                <span
                  className="vault-doc flex h-10 w-8 shrink-0 items-center justify-center rounded-[6px] bg-white text-blue-700 shadow-[0_2px_6px_#23365c26]"
                  style={{ '--d': `${0.5 + i * 1.1}s`, '--fx': `${[-120, 110, -90][i]}%`, '--fy': `${[-260, -320, 220][i]}%`, '--fr': `${[-14, 12, -8][i]}deg` } as CSSProperties}
                >
                  <Icon name={docIcons[i]} size={15} />
                </span>
                <span className="vault-text min-w-0 flex-1" style={{ '--d': `${1.05 + i * 1.1}s` } as CSSProperties}>
                  <span className="block truncate text-[0.75rem] font-medium">{name}</span>
                  <span className="block truncate text-[0.625rem] text-secondary">{detail}</span>
                </span>
                <span className="vault-check flex size-4 items-center justify-center rounded-full bg-blue-600 text-white" style={{ '--d': `${1.25 + i * 1.1}s` } as CSSProperties}>
                  <Icon name="check" size={10} strokeWidth={3} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="vault-next mt-3 flex items-center gap-3 rounded-full bg-white/12 py-2 pr-4 pl-2 text-white ring-1 ring-white/20 backdrop-blur-md" style={{ '--d': '4.9s' } as CSSProperties}>
          <span className="flex size-7 items-center justify-center rounded-full bg-white text-blue-900">
            <Icon name="clock" size={14} />
          </span>
          <span className="text-[0.6875rem] leading-tight">
            <span className="block text-white/70">{t.next}</span>
            <span className="block font-medium">{t.nextBody}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Badges for the sources we use (typographic, not real seals) ── */

// Real seals and logos are shown where a public-domain copy exists (web/public/marks,
// sources in design/BRANDING.md). Agency seals carry legal limits on commercial use and
// can imply endorsement (e.g. California Government Code §402 for the Great Seal).
// Set USE_REAL_MARKS = false to go back to the typographic badges.
const USE_REAL_MARKS = true

type Badge = { mark: string; sub: string; tone: string; img?: string; fit?: 'seal' | 'logo' }
const badges: Badge[] = [
  { mark: 'CDSS', sub: 'Social Services', tone: 'text-blue-700', img: '/marks/calfresh-logo.webp', fit: 'logo' },
  { mark: 'DHCS', sub: 'Health Care Services', tone: 'text-[#0b6b4f]' },
  { mark: 'CPUC', sub: 'Public Utilities', tone: 'text-[#8a5a00]', img: '/marks/cpuc-seal.webp', fit: 'seal' },
  { mark: 'CDPH', sub: 'Public Health', tone: 'text-[#7b1e3a]', img: '/marks/cdph-logo.webp', fit: 'logo' },
  { mark: 'LA', sub: 'Los Angeles County', tone: 'text-blue-700', img: '/marks/la-county-seal.webp', fit: 'seal' },
  { mark: 'SF', sub: 'San Francisco', tone: 'text-[#0b6b4f]', img: '/marks/sf-seal.webp', fit: 'seal' },
  { mark: '211', sub: 'Local help', tone: 'text-[#7b1e3a]' },
  { mark: 'CA', sub: 'State of California', tone: 'text-[#8a5a00]', img: '/marks/ca-seal.webp', fit: 'seal' },
]

function Badge({ mark, sub, tone, img, fit }: Badge) {
  const real = USE_REAL_MARKS && img
  return (
    <span className="relative flex aspect-square w-[24cqw] shrink-0 flex-col items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_8px_24px_#010e2414] ring-1 ring-border-quaternary">
      {real ? (
        <img
          src={img}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={fit === 'seal' ? 'h-[88%] w-[88%] object-contain' : 'w-[74%] object-contain'}
        />
      ) : (
        <>
          <span className={cx('absolute inset-[6%] rounded-full border border-dashed opacity-35', tone)} style={{ borderColor: 'currentColor' }} />
          <span className={cx('font-serif text-[6.2cqw] leading-none font-semibold tracking-[-0.02em]', tone)}>{mark}</span>
          <span className="mt-[1cqw] max-w-[72%] text-center text-[1.55cqw] leading-tight font-medium tracking-wide text-secondary uppercase">{sub}</span>
        </>
      )}
    </span>
  )
}

export function SourceBadges() {
  const row = (offset: number, reverse: boolean, speed: number) => {
    const set = [...badges.slice(offset), ...badges.slice(0, offset)]
    return (
      <div className="flex w-max gap-[3cqw]" style={{ animation: `marquee-x ${speed}s linear infinite ${reverse ? 'reverse' : ''}` }}>
        {[...set, ...set].map((b, i) => (
          <Badge key={i} {...b} />
        ))}
      </div>
    )
  }
  return (
    <MediaTile className="aspect-square bg-grey-50">
      <div className="absolute inset-0 flex flex-col justify-center gap-[3cqw] [container-type:inline-size]" aria-hidden="true">
        <div className="-ml-[6cqw]">{row(0, false, 60)}</div>
        <div className="-ml-[19cqw]">{row(3, true, 70)}</div>
        <div className="-ml-[10cqw]">{row(5, false, 64)}</div>
      </div>
    </MediaTile>
  )
}

/* ── A text-message thread: summary, YES, results ── */

export function TextThread({ className, compact }: { className?: string; compact?: boolean }) {
  const { lang } = useLang()
  const msgs = pick(lang, {
    en: [
      { me: false, text: 'Here’s what you told us: 3 people in Los Angeles, about $1,850 a month, 2 kids. Reply YES if that’s right.' },
      { me: true, text: 'YES' },
      { me: false, text: 'Thanks, Maria. You likely qualify for CalFresh and Medi-Cal. Want help applying?' },
    ],
    es: [
      { me: false, text: 'Esto nos dijiste: 3 personas en Los Ángeles, unos $1,850 al mes, 2 hijos. Responde SÍ si está bien.' },
      { me: true, text: 'SÍ' },
      { me: false, text: 'Gracias, Maria. Probablemente calificas para CalFresh y Medi-Cal. ¿Te ayudamos a solicitar?' },
    ],
  })
  return (
    <MediaTile className={cx('bg-[linear-gradient(160deg,#dbe8fb,#f4f7fc)]', className)}>
      {(playing) => <Thread msgs={msgs} playing={playing} compact={compact} />}
    </MediaTile>
  )
}

function Thread({ msgs, playing, compact }: { msgs: { me: boolean; text: string }[]; playing: boolean; compact?: boolean }) {
  const [step] = useAutoStep(msgs.length + 2, 1700, playing)
  const shown = playing ? Math.min(step + 1, msgs.length) : msgs.length
  return (
    <div className="absolute inset-0 flex items-end justify-center px-[12%] pb-[8%]">
      <div className={cx('flex w-full max-w-[22rem] flex-col gap-2.5 rounded-t-[2.25rem] bg-white px-5 pt-5 pb-6 shadow-elevation-1', compact ? 'h-[82%]' : 'h-[86%]')}>
        <div className="mb-2 flex items-center justify-center gap-2 border-b border-border-quaternary pb-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-blue-700 text-white">
            <Icon name="message" size={14} />
          </span>
          <span className="text-xs font-medium">Lumin</span>
        </div>
        {msgs.slice(0, shown).map((m, i) => (
          <p
            key={i}
            className={cx(
              'max-w-[85%] animate-[bubble-in_.45s_var(--ease-out-quint)] rounded-[1.1rem] px-3.5 py-2 text-[0.8125rem] leading-snug',
              m.me ? 'self-end bg-blue-600 text-white' : 'self-start bg-[#eef0f3] text-primary',
            )}
          >
            {m.text}
          </p>
        ))}
      </div>
    </div>
  )
}

/* ── how-it-works: sources card on a sky ── */

export function SourcesOnPhoto() {
  const { lang } = useLang()
  return (
    <MediaTile pausable={false} className="bg-blue-50">
      <Photo photo={photoById['lake-tahoe']} sizes="(max-width: 768px) 100vw, 50vw" className="scale-105 blur-[2px]" />
      <div className="absolute inset-0 bg-white/10" />
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <SourcesCard
          title={pick(lang, { en: 'Sources', es: 'Fuentes' })}
          countLabel={(n) => pick(lang, { en: `${n} source${n > 1 ? 's' : ''}`, es: `${n} fuente${n > 1 ? 's' : ''}` })}
          className="animate-[float_7s_ease-in-out_infinite] shadow-[0_20px_60px_#010e2433]"
          sources={[
            { domain: 'cdss.ca.gov', title: pick(lang, { en: 'CalFresh eligibility', es: 'Quién califica para CalFresh' }), href: 'https://www.cdss.ca.gov/inforesources/calfresh' },
            { domain: 'cdss.ca.gov', title: pick(lang, { en: 'CalFresh contacts', es: 'Contactos de CalFresh' }), href: 'https://www.cdss.ca.gov/inforesources/CalFresh/Contacts' },
            { domain: 'benefitscal.com', title: pick(lang, { en: 'Apply on BenefitsCal', es: 'Solicita en BenefitsCal' }), href: 'https://benefitscal.com' },
          ]}
        />
      </div>
    </MediaTile>
  )
}

export function PhotoFill({ id, className }: { id: string; className?: string }) {
  return (
    <MediaTile pausable={false} className={className}>
      <Photo photo={photoById[id]} sizes="(max-width: 768px) 100vw, 50vw" />
    </MediaTile>
  )
}

/* ── "Send it?" card ── */

export function ConsentPreview({ className }: { className?: string }) {
  const { lang } = useLang()
  const t = pick(lang, {
    en: { kicker: 'Ready to apply', title: 'Send your CalFresh application to Los Angeles County?', rows: [['Name', 'Maria L.'], ['Household', '3 people'], ['Income', '$1,850/mo']], yes: 'Yes, send it', review: 'Review first' },
    es: { kicker: 'Lista para enviar', title: '¿Enviar tu solicitud de CalFresh al Condado de Los Ángeles?', rows: [['Nombre', 'Maria L.'], ['Hogar', '3 personas'], ['Ingresos', '$1,850/mes']], yes: 'Sí, envíala', review: 'Revisar' },
  })
  return (
    <MediaTile className={cx('bg-[linear-gradient(150deg,#eef2f8,#f7f7f7)]', className)}>
      {(playing) => <ConsentAnim t={t} playing={playing} />}
    </MediaTile>
  )
}

function ConsentAnim({ t, playing }: { t: { kicker: string; title: string; rows: string[][]; yes: string; review: string }; playing: boolean }) {
  const [step] = useAutoStep(3, 1800, playing)
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[8%]">
      <div className="w-full max-w-[21rem] animate-[float_8s_ease-in-out_infinite] rounded-32 bg-white p-6 shadow-[0_20px_60px_#010e241f]">
        <p className="text-[0.6875rem] font-medium tracking-wide text-secondary uppercase">{t.kicker}</p>
        <p className="mt-2 text-[1.05rem] leading-snug font-medium tracking-tight">{t.title}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[0.8125rem]">
          {t.rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-secondary">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex gap-2">
          <span
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-700 px-4 text-[0.8125rem] font-medium text-white transition-transform duration-200',
              step === 1 && 'scale-[.96] bg-blue-800',
            )}
          >
            {step === 2 ? <Icon name="check" size={15} strokeWidth={2.5} /> : null}
            {t.yes}
          </span>
          <span className="inline-flex h-9 items-center rounded-full border border-border-primary px-4 text-[0.8125rem] font-medium">{t.review}</span>
        </div>
      </div>
    </div>
  )
}

/* ── Iridescent orb with an arrow (no account required) ── */

export function Orb({ className }: { className?: string }) {
  return (
    <MediaTile pausable={false} className={cx('bg-grey-50', className)}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="relative flex aspect-square w-[24%] items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#7fb2ff_0%,#2f6bff_35%,#0b2a8f_70%,#061a5c_100%)] text-white shadow-[0_30px_60px_#0b2a8f40]">
          <span className="absolute inset-0 animate-[spin_9s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,#ffb3e680_80deg,transparent_160deg,#b3d4ff80_250deg,transparent_330deg)] mix-blend-screen blur-md" />
          <Icon name="arrow-right" size={44} strokeWidth={2} className="relative" />
        </span>
      </div>
    </MediaTile>
  )
}

/* ── Steps on a phone ── */

export function StepsPhone() {
  const { lang } = useLang()
  const cf = programs[0]
  const t = pick(lang, {
    en: { h1: 'What to bring', h2: 'Where to apply', apply: 'Apply online at benefitscal.com, or call 1-877-847-3663.', h3: 'What happens next', next: ['The county calls you for a short interview.', 'Answer calls from numbers you don’t know.', 'You get a decision within 30 days.'] },
    es: { h1: 'Qué llevar', h2: 'Dónde solicitar', apply: 'Solicita en línea en benefitscal.com, o llama al 1-877-847-3663.', h3: 'Qué pasa después', next: ['El condado te llama para una entrevista corta.', 'Contesta llamadas de números que no conoces.', 'Recibes una decisión en 30 días.'] },
  })
  const bring = lang === 'es' ? ['Identificación con foto', 'Talones de pago de los últimos 30 días', 'Recibos de renta y servicios', 'Números de Seguro Social de quienes solicitan'] : cf.bring.slice(0, 4)
  const body = (
    <div className="flex flex-col gap-4 px-5 pb-5 text-[0.8125rem] leading-snug">
      <section>
        <p className="font-semibold">1. {t.h1}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {bring.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
      <section>
        <p className="font-semibold">2. {t.h2}</p>
        <p className="mt-1.5">
          {t.apply.split('benefitscal.com')[0]}
          <span className="text-link underline">benefitscal.com</span>
          {t.apply.split('benefitscal.com')[1]}
        </p>
      </section>
      <section>
        <p className="font-semibold">3. {t.h3}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {t.next.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>
    </div>
  )
  return (
    <MediaTile className="bg-black" dark>
      <div className="absolute top-[8%] left-1/2 h-[120%] w-[46%] min-w-[15rem] -translate-x-1/2 rounded-[2.6rem] border-[6px] border-[#2a2c30] bg-white shadow-[0_0_0_2px_#55585e]">
        <div className="absolute inset-0 overflow-hidden rounded-[2.2rem]">
          <div className="flex flex-col" style={{ animation: 'marquee-y 22s linear infinite' }}>
            <div className="pt-6">{body}</div>
            <div>{body}</div>
          </div>
        </div>
      </div>
    </MediaTile>
  )
}

/* ── What you likely qualify for ── */

export function QualifyTile() {
  const { lang } = useLang()
  const rows = pick(lang, {
    en: [['CalFresh', 'Up to $1,023/mo'], ['Medi-Cal', '$0 premium'], ['CalWORKs', 'Need more info']],
    es: [['CalFresh', 'Hasta $1,023/mes'], ['Medi-Cal', 'Sin costo'], ['CalWORKs', 'Falta información']],
  })
  const label = pick(lang, { en: 'Example: family of 4', es: 'Ejemplo: familia de 4' })
  return (
    <MediaTile className="bg-[linear-gradient(160deg,#f1f5fb,#e6eefb)]">
      {(playing) => <QualifyAnim rows={rows} label={label} playing={playing} lang={lang} />}
    </MediaTile>
  )
}

function QualifyAnim({ rows, label, playing, lang }: { rows: string[][]; label: string; playing: boolean; lang: L }) {
  const [step] = useAutoStep(rows.length + 3, 1100, playing)
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[8%]">
      <div className="w-full max-w-[21rem] rounded-32 bg-white p-6 shadow-[0_20px_60px_#010e241a]">
        <p className="text-[0.6875rem] font-medium tracking-wide text-secondary uppercase">{label}</p>
        <ul className="mt-3 divide-y divide-border-quaternary">
          {rows.map(([name, value], i) => {
            const on = !playing || step > i
            const maybe = i === rows.length - 1
            return (
              <li key={name} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[0.9375rem] font-medium">{name}</span>
                <span
                  className={cx(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] font-medium transition-all duration-500 ease-out-quint',
                    on ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
                    maybe ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-600',
                  )}
                >
                  <Icon name={maybe ? 'info' : 'check-circle'} size={14} strokeWidth={2} />
                  {value}
                </span>
              </li>
            )
          })}
        </ul>
        <p className={cx('mt-3 text-[0.75rem] text-tertiary transition-opacity duration-500', !playing || step > rows.length ? 'opacity-100' : 'opacity-0')}>
          {lang === 'es' ? 'El condado toma la decisión final.' : 'The county makes the final decision.'}
        </p>
      </div>
    </div>
  )
}

/* ── English and Spanish ── */

export function LanguagesTile() {
  return (
    <MediaTile pausable={false} className="bg-[#1f4fff]">
      <div className="absolute top-[9%] left-[7%] font-serif text-[clamp(2rem,4.4vw,3.6rem)] leading-[1] tracking-[-0.04em] text-white [font-variation-settings:'opsz'_72]">
        <p lang="en">Benefits</p>
        <p lang="es">Beneficios</p>
        <p lang="en" className="opacity-60">Help</p>
        <p lang="es" className="opacity-60">Ayuda</p>
      </div>
    </MediaTile>
  )
}

/* ── Microphone ── */

export function MicTile() {
  return (
    <MediaTile className="bg-grey-50">
      <div className="absolute inset-0 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute aspect-square w-[17%] rounded-full bg-blue-600/15"
            style={{ animation: `ring-out 2.7s var(--ease-standard) ${i * 0.9}s infinite` }}
          />
        ))}
        <span className="relative flex aspect-square w-[17%] items-center justify-center rounded-full bg-white shadow-[0_20px_50px_#010e241f]">
          <Icon name="mic" size={52} strokeWidth={1.75} />
        </span>
      </div>
    </MediaTile>
  )
}

/* ── Be specific: a question typing itself ── */

export function TypingTile({ text }: { text: string }) {
  return (
    <MediaTile className="bg-[#cfe3fb]">
      {(playing) => <Typing text={text} playing={playing} />}
    </MediaTile>
  )
}

function Typing({ text, playing }: { text: string; playing: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setN((v) => (v >= text.length + 40 ? 0 : v + 1)), 45)
    return () => clearInterval(t)
  }, [playing, text.length])
  const shown = playing ? text.slice(0, n) : text
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[10%]">
      <div className="flex min-h-[55%] w-full max-w-[24rem] flex-col rounded-24 bg-white p-5 shadow-[0_20px_50px_#010e241a]">
        <p className="flex-1 text-[0.9375rem] leading-snug tracking-tight">
          {shown}
          <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-[caret_1s_steps(1)_infinite] bg-primary" />
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Icon name="mic" size={18} />
          <span className="flex size-8 items-center justify-center rounded-full bg-blue-700 text-white">
            <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Thumbs up / down ── */

export function ThumbsTile({ light }: { light?: boolean }) {
  return (
    <MediaTile className={light ? 'bg-[#cfe3fb]' : 'bg-[#1f4fff]'} dark={!light}>
      {(playing) => <Thumbs playing={playing} light={light} />}
    </MediaTile>
  )
}

function Thumbs({ playing, light }: { playing: boolean; light?: boolean }) {
  const [step] = useAutoStep(4, 1300, playing)
  const up = step === 1
  const down = step === 3
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={cx('flex items-center gap-1 rounded-full p-1.5 shadow-[0_20px_50px_#010e2433] backdrop-blur-xl', light ? 'bg-white/70' : 'bg-white/25')}>
        {[
          { icon: 'thumb-up' as const, on: up },
          { icon: 'thumb-down' as const, on: down },
        ].map((b) => (
          <span
            key={b.icon}
            className={cx(
              'flex size-16 items-center justify-center rounded-full transition-all duration-300 ease-out-quint',
              b.on ? 'scale-105 bg-white text-blue-900 shadow-soft-md' : light ? 'text-blue-900/60' : 'text-white/80',
            )}
          >
            <Icon name={b.icon} size={28} strokeWidth={2} />
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Privacy: only the questions we need ── */

export function FieldsTile() {
  const { lang } = useLang()
  const fields = pick(lang, {
    en: ['First name', 'County', 'Household size', 'Monthly income', 'Kids under 18', 'Pregnancy', 'Age', 'Immigration status (optional)', 'Kids’ citizenship'],
    es: ['Nombre', 'Condado', 'Personas en el hogar', 'Ingresos al mes', 'Hijos menores de 18', 'Embarazo', 'Edad', 'Estatus migratorio (opcional)', 'Ciudadanía de los hijos'],
  })
  return (
    <MediaTile className="bg-blue-900" dark>
      <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-2 p-[9%]">
        {fields.map((f, i) => (
          <span
            key={f}
            className="rounded-full bg-white/10 px-3.5 py-2 text-[0.8125rem] text-white ring-1 ring-white/15 backdrop-blur"
            style={{ animation: `float ${6 + (i % 3)}s ease-in-out ${i * 0.35}s infinite` }}
          >
            {f}
          </span>
        ))}
      </div>
    </MediaTile>
  )
}

/* ── Privacy: the gradient lock ── */

export function GlowLock() {
  return (
    <MediaTile pausable={false} className="bg-[linear-gradient(180deg,#05070b_0%,#05070b_55%,#8d9097_78%,#05070b_100%)]">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 120" className="w-[30%] drop-shadow-[0_10px_40px_#ff9ad566]" aria-hidden="true">
          <defs>
            <linearGradient id="lock-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8ef0ff" />
              <stop offset=".35" stopColor="#ff9ad5" />
              <stop offset=".7" stopColor="#ffb86b" />
              <stop offset="1" stopColor="#8b7dff" />
            </linearGradient>
          </defs>
          <path d="M28 50V34a22 22 0 0 1 44 0v16" fill="none" stroke="url(#lock-g)" strokeWidth="12" strokeLinecap="round" />
          <rect x="12" y="48" width="76" height="64" rx="16" fill="url(#lock-g)" />
          <circle cx="50" cy="76" r="7" fill="#05070b" opacity=".35" />
          <rect x="47" y="78" width="6" height="16" rx="3" fill="#05070b" opacity=".35" />
        </svg>
      </div>
    </MediaTile>
  )
}

/* ── Privacy: "Prefer not to say" ── */

export function PreferNotTile() {
  const { lang } = useLang()
  const opts = pick(lang, {
    en: ['U.S. citizen', 'Green card', 'Other status', 'Prefer not to say'],
    es: ['Ciudadano de EE. UU.', 'Tarjeta verde', 'Otro estatus', 'Prefiero no decir'],
  })
  const q = pick(lang, { en: 'Immigration status (optional)', es: 'Estatus migratorio (opcional)' })
  return (
    <MediaTile className="bg-[linear-gradient(160deg,#eef2f8,#f7f7f7)]">
      {(playing) => <PreferAnim q={q} opts={opts} playing={playing} />}
    </MediaTile>
  )
}

function PreferAnim({ q, opts, playing }: { q: string; opts: string[]; playing: boolean }) {
  const [step] = useAutoStep(3, 1500, playing)
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[8%]">
      <div className="w-full max-w-[20rem] rounded-32 bg-white p-5 shadow-[0_20px_60px_#010e241a]">
        <p className="text-[0.875rem] font-medium">{q}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {opts.map((o, i) => {
            const on = i === opts.length - 1 && (!playing || step > 0)
            return (
              <li
                key={o}
                className={cx(
                  'flex items-center gap-2.5 rounded-16 border px-3.5 py-2.5 text-[0.8125rem] transition-colors duration-300',
                  on ? 'border-blue-700 bg-blue-50' : 'border-border-tertiary',
                )}
              >
                <span className={cx('flex size-4 items-center justify-center rounded-full border transition-colors', on ? 'border-blue-700' : 'border-border-secondary')}>
                  {on && <span className="size-2 rounded-full bg-blue-700" />}
                </span>
                {o}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function FlagInline({ className }: { className?: string }) {
  return <CaliforniaFlag width={120} className={cx('inline-block h-auto ring-1 ring-border-tertiary', className)} />
}
