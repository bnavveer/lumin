import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ChatComposer } from '../../components/ChatComposer'
import { cx } from '../../components/cx'
import { CaliforniaFlag } from '../../components/Flags'
import { Icon } from '../../components/icons'
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

/* ── Hero: golden-hour panel, a wide California photo, the question box docked on it ── */

function HomeHero({ composerRef }: { composerRef: RefObject<HTMLDivElement | null> }) {
  const { t, lang } = useLang()
  const start = useStartChat()
  const { navigate } = useRouter()
  const count = heroPhotos.length
  const [index, setIndex] = useState(0)
  const [playing] = usePlaying()
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const speech = useSpeech(lang, setText)
  const example = t.home.examples[index % t.home.examples.length]

  // Hold the slide while someone is typing or talking.
  const holding = focused || text.length > 0 || speech.listening
  useEffect(() => {
    if (!playing || holding || count < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 7000)
    return () => clearInterval(id)
  }, [playing, holding, count])

  const photo = heroPhotos[index]
  const go = (d: number) => setIndex((i) => (i + d + count) % count)
  return (
    <div className="px-6 max-mobile:px-0">
      <section
        aria-label={t.home.title}
        className="relative isolate mx-auto max-w-[96rem] overflow-hidden rounded-[3rem] bg-[linear-gradient(180deg,var(--color-fog)_0%,#f3f1ea_48%,var(--color-sand)_100%)] pb-6 max-mobile:rounded-[2rem] max-mobile:rounded-t-none max-mobile:pb-3"
      >
        <Header className="!max-w-none px-12 pt-8 max-mobile:px-4 max-mobile:pt-4" />

        <div className="mx-auto grid max-w-[88rem] grid-cols-[minmax(0,1fr)_minmax(0,25rem)] items-end gap-x-12 gap-y-4 px-12 pt-6 pb-8 max-[900px]:grid-cols-1 max-mobile:px-5 max-mobile:pt-2 max-mobile:pb-5">
          <h1 className="type-site-hero">{t.home.title}</h1>
          <p className="type-home-supporting text-secondary max-[900px]:max-w-[34rem]">{t.home.subtitle}</p>
        </div>

        <div className="relative mx-6 aspect-[16/7.2] overflow-hidden rounded-[2.25rem] bg-[#c9d6d4] shadow-[0_30px_80px_-20px_#12323d59] max-[1100px]:aspect-[16/10] max-mobile:mx-3 max-mobile:aspect-[4/5.4] max-mobile:rounded-[1.75rem]">
          <HeroSlides index={index} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#071a20b3] via-[#071a2040] to-transparent" />

          <div
            ref={composerRef}
            className="absolute inset-x-0 bottom-[4.75rem] mx-auto w-[min(46rem,calc(100%-2rem))] max-mobile:bottom-[4.25rem]"
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
              className="!border-white/80 !shadow-[0_20px_50px_-12px_#071a2080]"
            />
            {speech.error && (
              <p role="alert" className="mt-2 text-center type-body-s text-white">
                {speech.error === 'denied' ? t.chat.voiceDenied : t.chat.voiceUnsupported}
              </p>
            )}
          </div>

          <div className="absolute inset-x-6 bottom-5 flex items-end justify-between gap-4 text-white max-mobile:inset-x-4 max-mobile:bottom-4">
            <p className="min-w-0 type-label-s leading-snug text-white/85 [text-shadow:0_1px_8px_#0008]">
              <span className="block text-[0.8125rem] font-medium text-white">{photo.subject}</span>
              <span className="max-mobile:hidden">
                {t.lang === 'es' ? 'Foto' : 'Photo'}:{' '}
                <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {photo.author}
                </a>
                ,{' '}
                <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {photo.license}
                </a>
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex gap-1.5 max-mobile:hidden" aria-hidden="true">
                {heroPhotos.map((p, i) => (
                  <span key={p.id} className={cx('h-1 rounded-full transition-all duration-500 ease-out-quint', i === index ? 'w-6 bg-poppy' : 'w-1.5 bg-white/60')} />
                ))}
              </div>
              <button type="button" onClick={() => go(-1)} aria-label={t.home.carousel.prev} className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-white/35 focus-ring">
                <Icon name="chevron-left" size={18} />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t.home.carousel.next} className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-white/35 focus-ring">
                <Icon name="chevron-right" size={18} />
              </button>
            </div>
          </div>
          <span className="sr-only" aria-live="polite">
            {`${t.composer.example} ${index + 1} ${t.home.carousel.of} ${count}: ${example}`}
          </span>
        </div>
      </section>
    </div>
  )
}

// The photo layer only depends on the slide index, so typing in the box
// (which re-renders the hero) never touches it.
const HeroSlides = memo(function HeroSlides({ index }: { index: number }) {
  const count = heroPhotos.length
  const [loaded, setLoaded] = useState(() => new Set([0, 1]))
  useEffect(() => {
    setLoaded((prev) => {
      const near = [index, (index + 1) % count, (index - 1 + count) % count]
      return near.every((n) => prev.has(n)) ? prev : new Set([...prev, ...near])
    })
  }, [index, count])
  return (
    <>
      {heroPhotos.map((p, i) => (
        <div
          key={p.id}
          aria-hidden={i !== index}
          className={cx('absolute inset-0 transition-opacity duration-1000 ease-standard', i === index ? 'opacity-100' : 'opacity-0')}
        >
          {loaded.has(i) ? (
            <div className={cx('h-full w-full', i === index && 'animate-[kenburns_9s_ease-out_both]')}>
              <Photo photo={p} sizes="(max-width: 768px) 100vw, 1400px" priority={i === 0} />
            </div>
          ) : null}
        </div>
      ))}
    </>
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
