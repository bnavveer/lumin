import { useEffect, useState, type ReactNode } from 'react'
import { brand } from '../brand/brand'
import type { PhotoInfo } from '../data/photos'
import { IconButton } from './Button'
import { ChatComposer } from './ChatComposer'
import { cx } from './cx'
import { Icon } from './icons'
import { Photo, PhotoCredit } from './Photo'

// Home hero: serif headline, gray subline, then the question box on a photo
// card that rotates through `slides` every 6 seconds (pausable).
export function Hero({
  title = brand.heroTitle,
  subtitle = brand.heroSubtitle,
  slides = [],
  onSubmit,
}: {
  title?: string
  subtitle?: string
  slides?: PhotoInfo[]
  onSubmit?: (text: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const count = slides.length
  const [loaded, setLoaded] = useState(() => new Set([0, 1]))

  useEffect(() => {
    if (count === 0) return
    setLoaded((prev) => {
      const near = [index, (index + 1) % count, (index - 1 + count) % count]
      return near.every((n) => prev.has(n)) ? prev : new Set([...prev, ...near])
    })
  }, [index, count])

  useEffect(() => {
    if (!playing || count < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000)
    return () => clearInterval(t)
  }, [playing, count])

  const current = slides[index]
  return (
    <section className="flex flex-col items-center px-4 text-center">
      <h1 className="type-site-hero">{title}</h1>
      <p className="mt-4 max-w-[34rem] type-home-supporting text-secondary">{subtitle}</p>
      <div className="relative mt-10 w-full max-w-[42rem]">
        <div className="relative aspect-[3/2] overflow-hidden rounded-48 bg-grey-50 shadow-elevation-1 max-mobile:aspect-[4/5]">
          {count === 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(120% 80% at 20% 110%, #f4b860 0%, transparent 55%), radial-gradient(90% 70% at 90% 100%, #e0745a 0%, transparent 60%), linear-gradient(180deg, #bcd6ee 0%, #e9eef4 55%, #f6e3c8 100%)',
              }}
            />
          )}
          {slides.map((p, i) => (
            <div
              key={p.id}
              aria-hidden={i !== index}
              className={cx('absolute inset-0 transition-opacity duration-1000 ease-standard', i === index ? 'opacity-100' : 'opacity-0')}
            >
              {/* Load slides as they come up (current, next, previous), then keep them */}
              {loaded.has(i) ? (
                <Photo photo={p} sizes="(max-width: 768px) 100vw, 672px" priority={i === 0} />
              ) : null}
            </div>
          ))}
          <div className="absolute inset-x-3 top-3">
            <ChatComposer variant="hero" onSubmit={onSubmit} />
          </div>
        </div>
        {count > 1 && (
          <div className="mt-8">
            <CarouselControls
              playing={playing}
              onTogglePlay={() => setPlaying((v) => !v)}
              onPrev={() => setIndex((i) => (i - 1 + count) % count)}
              onNext={() => setIndex((i) => (i + 1) % count)}
            />
          </div>
        )}
        {current && <PhotoCredit photo={current} className="mt-4" />}
      </div>
    </section>
  )
}

export function SectionHeading({ children, intro }: { children: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mx-auto mb-14 max-w-site px-6 text-center">
      <h2 className="type-section-heading">{children}</h2>
      {intro && <p className="mx-auto mt-6 max-w-prose text-left type-page-intro text-secondary">{intro}</p>}
    </div>
  )
}

// Big rounded media tile with a "Bold lead. Muted sentence." caption under it.
export function FeatureCard({
  media,
  lead,
  children,
}: {
  media: ReactNode
  lead: string
  children: ReactNode
}) {
  return (
    <figure className="flex flex-col gap-5">
      <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-48 bg-grey-50">{media}</div>
      <figcaption className="px-5 type-body-s text-secondary">
        <span className="text-primary">{lead}</span> {children}
      </figcaption>
    </figure>
  )
}

// The america.gov "Press" card: icon tile, small kicker, title, CTA.
export function LinkCard({
  icon,
  kicker,
  title,
  cta,
  href,
}: {
  icon: ReactNode
  kicker: string
  title: string
  cta: string
  href: string
}) {
  return (
    <a
      href={href}
      className="group flex min-h-56 flex-col rounded-32 bg-background-tertiary p-5 transition-colors hover:bg-background-secondary focus-ring"
    >
      <span className="flex size-11 items-center justify-center rounded-12 bg-blue-900 text-white">{icon}</span>
      <span className="mt-6 type-body-s text-secondary">{kicker}</span>
      <span className="type-body-s font-medium">{title}</span>
      <span className="mt-auto flex items-center gap-1 pt-6 type-label-s font-medium">
        {cta}
        <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

export function Accordion({
  items,
  askAnything,
}: {
  items: { q: string; a: ReactNode }[]
  askAnything?: (text: string) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [ask, setAsk] = useState('')
  return (
    <div className="mx-auto w-full max-w-[35rem]">
      <ul className="divide-y divide-border-tertiary">
        {items.map((item, i) => {
          const isOpen = open === i
          return (
            <li key={item.q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-8 py-3.5 text-left type-faq focus-ring"
                >
                  {item.q}
                  <Icon name="chevron-down" size={18} className={cx('shrink-0 transition-transform duration-300 ease-out-quint', isOpen && 'rotate-180')} />
                </button>
              </h3>
              <div
                id={`faq-${i}`}
                className={cx('grid transition-[grid-template-rows] duration-300 ease-out-quint', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
              >
                <div className="overflow-hidden">
                  <div className="pb-5 type-body-m text-secondary">{item.a}</div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {askAnything && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (ask.trim()) askAnything(ask.trim())
            setAsk('')
          }}
          className="mt-3 flex items-center gap-3 border-b border-border-tertiary py-3"
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask anything else"
            aria-label="Ask anything else"
            className="flex-1 bg-transparent type-faq outline-none placeholder:text-secondary"
          />
          <IconButton type="submit" icon="arrow-right" label="Ask" size="sm" variant={ask.trim() ? 'primary' : 'secondary'} />
        </form>
      )}
    </div>
  )
}

// Prev / pause / next under the home hero carousel.
export function CarouselControls({
  onPrev,
  onNext,
  playing,
  onTogglePlay,
}: {
  onPrev?: () => void
  onNext?: () => void
  playing: boolean
  onTogglePlay?: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <IconButton icon="chevron-left" label="Previous" onClick={onPrev} className="bg-background-secondary/60" />
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay} className="bg-background-secondary/60" />
      <IconButton icon="chevron-right" label="Next" onClick={onNext} className="bg-background-secondary/60" />
    </div>
  )
}

export function SiteFooter({ links }: { links: { label: string; href: string }[] }) {
  return (
    <footer className="mt-32 px-6 pb-40">
      <nav aria-label="Footer">
        <ul className="flex flex-col items-center gap-1 text-center">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="rounded-8 type-footer-link hover:underline focus-ring decoration-2 underline-offset-[6px]">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p
        aria-hidden="true"
        className="mx-auto mt-24 max-w-site text-center font-serif leading-[0.85] tracking-[-0.045em] [font-variation-settings:'opsz'_72]"
        style={{ fontSize: 'clamp(4rem, 15.5vw, 15rem)' }}
      >
        {brand.name}
      </p>
      <div className="mx-auto mt-10 flex max-w-site flex-wrap items-center justify-between gap-x-8 gap-y-4 type-label-s leading-normal">
        <span className="flex items-center gap-2">
          <Icon name="phone" size={16} />
          {brand.help.label}
        </span>
        <span className="font-medium">Made for Californians</span>
        <span className="text-secondary">{brand.banner.short}</span>
      </div>
      <div className="mt-6 flex justify-center gap-4 type-label-s">
        <a href="#privacy" className="hover:underline">Privacy Policy</a>
        <a href="#terms" className="hover:underline">Terms of Use</a>
        <span className="flex items-center gap-1">
          English <Icon name="chevron-down" size={14} />
        </span>
      </div>
    </footer>
  )
}
