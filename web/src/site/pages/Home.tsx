import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChatComposer } from '../../components/ChatComposer'
import { cx } from '../../components/cx'
import { CaliforniaFlag } from '../../components/Flags'
import { Icon } from '../../components/icons'
import { CarouselControls } from '../../components/Marketing'
import { Photo } from '../../components/Photo'
import { heroPhotos } from '../../data/photos'
import { setPendingAttach } from '../chat/useChat'
import { useSpeech } from '../chat/useSpeech'
import { Collage } from '../collage'
import { composerLabels, Dock, Footer, Header, SkipLink, useStartChat } from '../chrome'
import type { Chip, Statement as StatementTokens } from '../copy'
import { pillClass, Reveal } from '../blocks'
import { useInView, usePlaying, useReducedMotion } from '../hooks'
import { useLang } from '../lang'
import { DocumentVault, Padlock, ProgramMosaic, SourceBadges, TextThread } from '../media'
import { Link, useRouter } from '../router'
import { ApplicationGuide } from './ApplicationGuide'

export function Home() {
  const { t } = useLang()
  const [heroRef, heroVisible] = useInView<HTMLDivElement>({ once: false, margin: '0px' })
  return (
    <>
      <SkipLink />
      <main id="main" tabIndex={-1} className="outline-none">
        <HomeHero composerRef={heroRef} />
        <ApplicationGuide />
        <Statement tokens={t.home.statement} />
        <Features />
        <More />
      </main>
      <Footer />
      <Dock visible={!heroVisible} />
    </>
  )
}

/* ── Hero: rounded panel, rotating photo, example question in the box ── */

function HomeHero({ composerRef }: { composerRef: RefObject<HTMLDivElement | null> }) {
  const { t, lang } = useLang()
  const start = useStartChat()
  const { navigate } = useRouter()
  const slides = heroPhotos
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = usePlaying()
  const [loaded, setLoaded] = useState(() => new Set([0, 1]))
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const speech = useSpeech(lang, setText)
  const example = t.home.examples[index % t.home.examples.length]

  // Hold the slide while someone is typing or talking, like america.gov.
  const holding = focused || text.length > 0 || speech.listening
  useEffect(() => {
    if (!playing || holding || count < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6000)
    return () => clearInterval(id)
  }, [playing, holding, count])

  useEffect(() => {
    setLoaded((prev) => {
      const near = [index, (index + 1) % count, (index - 1 + count) % count]
      return near.every((n) => prev.has(n)) ? prev : new Set([...prev, ...near])
    })
  }, [index, count])

  return (
    <div className="px-8 max-mobile:px-0">
      <section
        aria-label={t.home.title}
        className="relative isolate mx-auto flex min-h-[min(46rem,calc(100svh-4.5rem))] max-w-[90rem] flex-col overflow-hidden rounded-[3rem] bg-grey-50 pb-16 max-mobile:rounded-[2.5rem] max-mobile:rounded-t-none max-mobile:pb-10"
      >
        {/* Ambient wash taken from the current photo */}
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          {slides.map((p, i) =>
            loaded.has(i) ? (
              <img
                key={p.id}
                src={`/photos/${p.id}-800.webp`}
                alt=""
                className={cx(
                  'absolute inset-0 h-full w-full scale-125 object-cover blur-[90px] saturate-[.8] transition-opacity duration-[1500ms] ease-standard',
                  i === index ? 'opacity-35' : 'opacity-0',
                )}
              />
            ) : null,
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/20 to-white/60" />
        </div>

        <Header className="px-12 pt-10 max-mobile:px-4 max-mobile:pt-4" />

        <div className="flex flex-1 flex-col items-center justify-center px-4 pt-4 text-center">
          <h1 className="type-site-hero">{t.home.title}</h1>
          <p className="mt-4 max-w-[36rem] type-home-supporting text-secondary">{t.home.subtitle}</p>

          <div className="relative mt-10 w-full max-w-[43rem] max-mobile:mt-8">
            <div className="relative aspect-[3/2] overflow-hidden rounded-[3rem] bg-grey-200 shadow-[0_30px_80px_#010e2426] max-mobile:aspect-[4/5] max-mobile:rounded-[2.25rem]">
              {slides.map((p, i) => (
                <div
                  key={p.id}
                  aria-hidden={i !== index}
                  className={cx('absolute inset-0 transition-opacity duration-1000 ease-standard', i === index ? 'opacity-100' : 'opacity-0')}
                >
                  {loaded.has(i) ? (
                    <div className={cx('h-full w-full', i === index && playing && !holding && 'animate-[kenburns_7s_ease-out_both]')}>
                      <Photo photo={p} sizes="(max-width: 768px) 100vw, 688px" priority={i === 0} />
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={composerRef} className="absolute inset-x-3 top-3" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
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
                />
              </div>
              <span className="sr-only" aria-live="polite">
                {`${t.composer.example} ${index + 1} ${t.home.carousel.of} ${count}: ${example}`}
              </span>
            </div>
            {speech.error && (
              <p role="alert" className="mt-4 type-body-s text-secondary">
                {speech.error === 'denied' ? t.chat.voiceDenied : t.chat.voiceUnsupported}
              </p>
            )}
            <div className="mt-8">
              <CarouselControls
                playing={playing}
                onTogglePlay={() => setPlaying((v) => !v)}
                onPrev={() => setIndex((i) => (i - 1 + count) % count)}
                onNext={() => setIndex((i) => (i + 1) % count)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ── The big statement that sharpens as you scroll ── */

// Chips sit on the x-height so they read as part of the sentence. The arrow
// opens the chat; the lock opens and closes; the flag waves.
const chipBase =
  'mx-[0.08em] inline-flex h-[0.86em] -translate-y-[0.04em] items-center justify-center overflow-hidden rounded-full align-middle'

function ChipIcon({ chip, label }: { chip: Chip; label: string }) {
  const start = useStartChat()
  const [open, setOpen] = useState(false)
  const [waves, setWaves] = useState(0)
  if (chip === 'flag')
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => setWaves((n) => n + 1)}
        className={cx(chipBase, 'w-[1.3em] cursor-pointer bg-white ring-1 ring-border-tertiary transition-transform duration-300 ease-out-quint hover:scale-105 focus-ring')}
      >
        <span key={waves} className={cx('h-full w-full', waves > 0 && 'animate-[flag-wave_.9s_var(--ease-out-quint)]')}>
          <CaliforniaFlag width={64} className="h-full w-full scale-[1.15] object-cover" />
        </span>
      </button>
    )
  if (chip === 'lock')
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          chipBase,
          'w-[0.86em] cursor-pointer bg-[radial-gradient(circle_at_30%_30%,#ffe0f2,#ffb3d9_45%,#c9b8ff)] text-[#7b2a5a] transition-transform duration-300 ease-out-quint hover:scale-105 active:scale-95 focus-ring',
        )}
      >
        <Padlock open={open} className="h-[0.5em] w-[0.5em]" hole="#ffd3ea" />
      </button>
    )
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => start('')}
      className={cx(
        chipBase,
        'group w-[0.86em] cursor-pointer bg-[radial-gradient(circle_at_30%_25%,#8fb8ff,#2f6bff_55%,#0b2a8f)] text-white shadow-[0_8px_24px_#2f6bff40] transition-[scale,box-shadow] duration-300 ease-out-quint hover:scale-105 hover:shadow-[0_10px_30px_#2f6bff66] active:scale-95 focus-ring',
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
