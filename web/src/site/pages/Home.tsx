import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TransitionEvent } from 'react'
import { ChatComposer } from '../../components/ChatComposer'
import { cx } from '../../components/cx'
import { CaliforniaFlag } from '../../components/Flags'
import { Icon } from '../../components/icons'
import { Photo } from '../../components/Photo'
import { heroPhotos } from '../../data/photos'
import { setPendingAttach } from '../chat/useChat'
import { useSpeech } from '../chat/useSpeech'
import { Collage } from '../collage'
import { composerLabels, Footer, Header, SkipLink, useStartChat } from '../chrome'
import type { Chip, Statement as StatementTokens } from '../copy'
import { pillClass, Reveal } from '../blocks'
import { usePlaying, useReducedMotion } from '../hooks'
import { useLang } from '../lang'
import { DocumentVault, Padlock, ProgramMosaic, SourceBadges, TextThread } from '../media'
import { Link, useRouter } from '../router'
import { ApplicationGuide } from './ApplicationGuide'

export function Home() {
  const { t } = useLang()
  return (
    <>
      <SkipLink />
      <main id="main" tabIndex={-1} className="outline-none">
        <HomeHero />
        <ApplicationGuide />
        <Statement tokens={t.home.statement} />
        <Features />
        <More />
      </main>
      <Footer />
    </>
  )
}

/* ── Hero: golden-hour panel, a wide California photo, the question box docked on it ── */

function HomeHero() {
  const { t, lang } = useLang()
  const start = useStartChat()
  const { navigate } = useRouter()
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const speech = useSpeech(lang, setText)
  const example = t.home.examples[index % t.home.examples.length]
  // Hold the slide while someone is typing or talking.
  const holding = focused || text.length > 0 || speech.listening
  const { slot, bar, docked } = useDockOnScroll()

  return (
    <div className="px-6 max-mobile:px-0">
      <section
        aria-label={t.home.title}
        className="relative mx-auto max-w-[96rem] overflow-hidden rounded-[3rem] bg-[linear-gradient(180deg,var(--color-fog)_0%,#f3f1ea_48%,var(--color-sand)_100%)] pb-6 max-mobile:rounded-[2rem] max-mobile:rounded-t-none max-mobile:pb-3"
      >
        <Header className="!max-w-none px-12 pt-8 max-mobile:px-4 max-mobile:pt-4" />

        <div className="mx-auto grid max-w-[88rem] grid-cols-[minmax(0,1fr)_minmax(0,25rem)] items-end gap-x-12 gap-y-4 px-12 pt-6 pb-8 max-[900px]:grid-cols-1 max-mobile:px-5 max-mobile:pt-2 max-mobile:pb-5">
          <h1 className="type-site-hero">{t.home.title}</h1>
          <p className="type-home-supporting text-secondary max-[900px]:max-w-[34rem]">{t.home.subtitle}</p>
        </div>

        <div className="relative mx-6 aspect-[16/7.2] overflow-hidden rounded-[2.25rem] bg-[#c9d6d4] shadow-[0_30px_80px_-20px_#12323d59] max-[1100px]:aspect-[16/10] max-mobile:mx-3 max-mobile:aspect-[4/5.4] max-mobile:rounded-[1.75rem]">
          <HeroStage holding={holding} onIndex={setIndex} prevLabel={t.home.carousel.prev} nextLabel={t.home.carousel.next} />

          {/* The slot keeps the bar's place in the photo; the bar itself docks to the top of the screen */}
          <div ref={slot} className="absolute inset-x-0 bottom-[5rem] mx-auto w-[min(46rem,calc(100%-2rem))] max-mobile:bottom-[4.5rem]">
          <div
            ref={bar}
            className={cx(docked ? 'fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-[70] mx-auto w-[min(46rem,calc(100%-2rem))]' : 'relative')}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <ChatComposer
              variant="hero"
              placeholder={`${t.composer.tryPrefix} ‘${example}’`}
              submitEmpty={example}
              value={text}
              onValueChange={setText}
              onSubmit={start}
              onVoice={speech.toggle}
              listening={speech.listening}
              onAttach={() => {
                setPendingAttach()
                navigate('/chat')
              }}
              labels={composerLabels(t)}
              className={cx(
                'transition-[border-color,box-shadow] duration-500',
                docked
                  ? '!border-[#0e212926] !shadow-[0_22px_60px_-14px_#071a2066]'
                  : '!border-white/80 !shadow-[0_20px_50px_-12px_#071a2080]',
              )}
            />
            {speech.error && (
              <p role="alert" className={cx('mt-2 text-center type-body-s', docked ? 'text-secondary' : 'text-white')}>
                {speech.error === 'denied' ? t.chat.voiceDenied : t.chat.voiceUnsupported}
              </p>
            )}
          </div>
          </div>
          <div
            aria-hidden="true"
            className={cx(
              'pointer-events-none fixed inset-x-0 top-0 z-[69] h-28 bg-gradient-to-b from-white via-white/75 to-transparent transition-opacity duration-500',
              docked ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span className="sr-only" aria-live="polite">
            {`${t.composer.example} ${index + 1} ${t.home.carousel.of} ${heroPhotos.length}: ${example}`}
          </span>
        </div>
      </section>
    </div>
  )
}

// Once the hero's chat bar scrolls off the top, the same bar (with whatever was
// typed) slides down into a docked spot at the top of the screen, above
// everything else on the page; scrolling back up returns it to the photo. FLIP: measure where it was, let it move,
// then animate from the old spot to the new one.
function useDockOnScroll() {
  const slot = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [docked, setDocked] = useState(false)
  const first = useRef<DOMRect | null>(null)

  useEffect(() => {
    const el = slot.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      const next = !e.isIntersecting && e.boundingClientRect.top < 0
      setDocked((d) => {
        if (d !== next && bar.current) first.current = bar.current.getBoundingClientRect()
        return next
      })
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = bar.current
    const from = first.current
    first.current = null
    if (!el || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // While docked the slot needs the bar's height so the photo layout holds.
    const to = el.getBoundingClientRect()
    el.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, opacity: docked ? 0.6 : 1 }, { transform: 'none', opacity: 1 }],
      { duration: docked ? 650 : 500, easing: 'cubic-bezier(.22, 1, .36, 1)' },
    )
  }, [docked])

  useLayoutEffect(() => {
    const s = slot.current
    const b = bar.current
    if (s && b) s.style.height = docked ? `${b.offsetHeight}px` : ''
  }, [docked])

  return { slot, bar, docked }
}

// The photo strip. Drag or swipe it sideways to change photos (it follows
// your pointer, then settles), or use the arrows. It loops both ways using a
// copy of the last photo before the first and the first after the last.
// Memoized, so typing in the box above it never re-renders the photos.
const HeroStage = memo(function HeroStage({
  holding,
  onIndex,
  prevLabel,
  nextLabel,
}: {
  holding: boolean
  onIndex: (i: number) => void
  prevLabel: string
  nextLabel: string
}) {
  const count = heroPhotos.length
  const [playing] = usePlaying()
  const [slot, setSlot] = useState(1) // position in the track, 1..count are the real photos
  const [animate, setAnimate] = useState(true)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; t: number; id: number; w: number } | null>(null)
  const index = (slot - 1 + count) % count
  const [loaded, setLoaded] = useState(() => new Set([0, 1, count - 1]))

  useEffect(() => onIndex(index), [index, onIndex])
  useEffect(() => {
    setLoaded((prev) => {
      const near = [index, (index + 1) % count, (index - 1 + count) % count]
      return near.every((n) => prev.has(n)) ? prev : new Set([...prev, ...near])
    })
  }, [index, count])

  const go = useCallback((d: number) => {
    setAnimate(true)
    setSlot((s) => s + d)
  }, [])

  useEffect(() => {
    if (!playing || holding || dragging || count < 2) return
    const id = setInterval(() => go(1), 7000)
    return () => clearInterval(id)
  }, [playing, holding, dragging, count, go, slot])

  // After sliding onto a copy, jump (without animating) to the real photo.
  function onSettled(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (slot === 0 || slot === count + 1) {
      setAnimate(false)
      setSlot(slot === 0 ? count : 1)
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as Element).closest('button, a, form')) return
    drag.current = { x: e.clientX, t: performance.now(), id: e.pointerId, w: e.currentTarget.clientWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
    setAnimate(false)
    setDragging(true)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== e.pointerId) return
    setDx(e.clientX - drag.current.x)
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const moved = e.clientX - d.x
    const speed = Math.abs(moved) / Math.max(1, performance.now() - d.t)
    setDragging(false)
    setDx(0)
    setAnimate(true)
    if (Math.abs(moved) > d.w * 0.18 || (Math.abs(moved) > 50 && speed > 0.5)) setSlot((s) => s + (moved < 0 ? 1 : -1))
  }

  const track = [heroPhotos[count - 1], ...heroPhotos, heroPhotos[0]]
  return (
    <div
      className={cx('absolute inset-0 touch-pan-y select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="flex h-full will-change-transform"
        style={{
          transform: `translate3d(calc(${-slot * 100}% + ${dx}px), 0, 0)`,
          transition: animate ? 'transform .75s cubic-bezier(.22, 1, .36, 1)' : 'none',
        }}
        onTransitionEnd={onSettled}
      >
        {track.map((p, i) => {
          const real = (i - 1 + count) % count
          const active = i === slot
          return (
            <div key={`${p.id}-${i}`} aria-hidden={!active} className="relative h-full w-full shrink-0 overflow-hidden">
              {loaded.has(real) ? (
                <div className={cx('h-full w-full', active && !dragging && 'animate-[kenburns_9s_ease-out_both]')}>
                  <Photo photo={p} sizes="(max-width: 768px) 100vw, 1400px" priority={real === 0} />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#071a20b3] via-[#071a2040] to-transparent" />
      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-3 max-mobile:bottom-4">
        <button type="button" onClick={() => go(-1)} aria-label={prevLabel} className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-[background-color,scale] hover:bg-white/35 active:scale-95 focus-ring">
          <Icon name="chevron-left" size={18} />
        </button>
        <button type="button" onClick={() => go(1)} aria-label={nextLabel} className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-[background-color,scale] hover:bg-white/35 active:scale-95 focus-ring">
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </div>
  )
})

/* ── The big statement that sharpens as you scroll ── */

// Chips sit on the x-height so they read as part of the sentence. The arrow
// opens the chat; the lock stays locked and jiggles; the flag waves.
const chipBase =
  'mx-[0.08em] inline-flex h-[0.86em] -translate-y-[0.04em] items-center justify-center overflow-hidden rounded-full align-middle'

function ChipIcon({ chip, label }: { chip: Chip; label: string }) {
  const start = useStartChat()
  const [tug, setTug] = useState(0)
  const [waves, setWaves] = useState(0)
  if (chip === 'flag')
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => setWaves((n) => n + 1)}
        className={cx(
          'mx-[0.08em] inline-flex h-[0.86em] w-[1.24em] -translate-y-[0.04em] cursor-pointer items-center justify-center overflow-hidden rounded-[0.16em] bg-white p-[0.06em] align-middle ring-1 ring-border-tertiary transition-transform duration-300 ease-out-quint hover:scale-105 focus-ring',
        )}
      >
        <span key={waves} className={cx('block h-[0.74em] w-[1.11em] shrink-0 overflow-hidden rounded-[0.1em]', waves > 0 && 'animate-[flag-wave_.9s_var(--ease-out-quint)]')}>
          <CaliforniaFlag width={96} className="!block !h-full !w-full" />
        </span>
      </button>
    )
  if (chip === 'lock')
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => setTug((n) => n + 1)}
        className={cx(
          chipBase,
          'w-[0.86em] cursor-pointer bg-[radial-gradient(circle_at_30%_30%,#ecf8f5,#a9ddd5_50%,#6fb8bf)] text-[#0b4a5e] transition-transform duration-300 ease-out-quint hover:scale-105 active:scale-95 focus-ring',
        )}
      >
        <Padlock tug={tug} className="h-[0.5em] w-[0.5em]" hole="#c9ebe6" />
      </button>
    )
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => start('')}
      className={cx(
        chipBase,
        'group w-[0.86em] cursor-pointer bg-[radial-gradient(circle_at_30%_25%,#ffc27a,#f2741f_55%,#b8451a)] text-white shadow-[0_8px_24px_#f2741f40] transition-[scale,box-shadow] duration-300 ease-out-quint hover:scale-105 hover:shadow-[0_10px_30px_#f2741f66] active:scale-95 focus-ring',
      )}
    >
      <Icon name="arrow-right" size={28} strokeWidth={2.25} className="h-[0.42em] w-[0.42em] transition-transform duration-300 ease-out-quint group-hover:translate-x-[0.06em]" />
    </button>
  )
}

function Statement({ tokens }: { tokens: StatementTokens }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const reduced = useReducedMotion()
  const [progress, setProgress] = useState(reduced ? 1 : 0)

  // Split into words; chips count as one word each.
  const words: ({ w: string } | { chip: Chip; label: string })[] = []
  for (const tok of tokens) {
    if (typeof tok === 'string') tok.split(' ').filter(Boolean).forEach((w) => words.push({ w }))
    else words.push({ chip: tok.chip, label: tok.label })
  }

  useEffect(() => {
    if (reduced) return setProgress(1)
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = innerHeight
      // 0 when the top reaches 85% of the screen, 1 when the bottom reaches 45%
      const p = (vh * 0.85 - r.top) / (r.height + vh * 0.4)
      setProgress(Math.max(0, Math.min(1, p)))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  return (
    <section className="mx-auto max-w-[62rem] px-6 pt-48 pb-40 max-mobile:px-5 max-mobile:pt-28 max-mobile:pb-24">
      <p
        ref={ref}
        className="text-center font-serif text-[clamp(2.25rem,5.4vw,4.25rem)] leading-[1.08] tracking-[-0.04em] [font-variation-settings:'opsz'_72] text-balance"
      >
        {words.map((w, i) => {
          // Each word fades in over the span of three words of scrolling
          const local = Math.max(0, Math.min(1, (progress * (words.length + 3) - i) / 3))
          const style = { opacity: 0.12 + 0.88 * local, filter: local < 1 ? `blur(${(1 - local) * 6}px)` : undefined }
          return (
            <span key={i} style={style} className="transition-[opacity,filter] duration-150">
              {'chip' in w ? <ChipIcon chip={w.chip} label={w.label} /> : w.w}{' '}
            </span>
          )
        })}
      </p>
    </section>
  )
}

/* ── Feature rows: tile on the left, text on the right ── */

function Features() {
  const { t } = useLang()
  const media = [<ProgramMosaic key="m" />, <DocumentVault key="v" />, <SourceBadges key="s" />, <TextThread key="t" className="aspect-square" />]
  return (
    <section className="mx-auto flex max-w-[60rem] flex-col gap-28 px-6 max-mobile:gap-20 max-mobile:px-5">
      {t.home.features.map((f, i) => (
        <Reveal key={f.title} className="grid grid-cols-[minmax(0,27rem)_minmax(0,1fr)] items-center gap-x-20 gap-y-8 max-[860px]:grid-cols-1">
          <div className="w-full max-w-[27rem] max-[860px]:mx-auto">{media[i]}</div>
          <div className="max-w-[20rem] max-[860px]:mx-auto max-[860px]:max-w-[27rem] max-[860px]:px-2">
            <h2 className="type-feature-heading text-balance">{f.title}</h2>
            <p className="mt-4 type-body-m text-secondary">{f.body}</p>
            <Link href={f.href} className="group mt-6 inline-flex items-center gap-1.5 rounded-4 type-body-s font-medium focus-ring">
              {f.link}
              <Icon name="arrow-right" size={15} className="transition-transform duration-300 ease-out-quint group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      ))}
    </section>
  )
}

/* ── More coming ── */

function More() {
  const { t } = useLang()
  return (
    <section className="mt-48 max-mobile:mt-32">
      <Reveal className="mx-auto max-w-[44rem] px-6 text-center">
        <h2 className="type-page-heading">{t.home.more.title}</h2>
        <p className="mx-auto mt-6 max-w-[30rem] type-body-m text-secondary">{t.home.more.body}</p>
        <Link href="/coming-soon" className={cx(pillClass, 'mt-8')}>
          {t.home.more.cta}
        </Link>
      </Reveal>
      <Collage />
    </section>
  )
}
