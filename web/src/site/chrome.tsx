import { useCallback, type ReactNode } from 'react'
import { brand } from '../brand/brand'
import { AskDock, type ComposerLabels } from '../components/ChatComposer'
import { cx } from '../components/cx'
import { CaliforniaFlag } from '../components/Flags'
import { GovBanner } from '../components/GovBanner'
import { Icon } from '../components/icons'
import { SiteHeader, type NavItem } from '../components/SiteHeader'
import { setPendingQuestion } from './chat/useChat'
import type { Copy, Lang } from './copy'
import { useOpenFeedback } from './feedback'
import { useLang, useT } from './lang'
import { Link, useRouter } from './router'

// Shared page chrome: banner, header, footer and the docked question box.

export function useStartChat() {
  const { navigate } = useRouter()
  return useCallback(
    (q: string) => {
      setPendingQuestion(q)
      navigate('/chat')
    },
    [navigate],
  )
}

export function composerLabels(t: Copy): ComposerLabels {
  const c = t.composer
  return { label: c.label, send: c.send, sending: c.sending, attach: c.attach, voice: c.voice, stopVoice: c.stopVoice, listening: c.listening }
}

function useNav(): NavItem[] {
  const t = useT().menu
  const { path } = useRouter()
  const openFeedback = useOpenFeedback()
  const items: [string, string][] = [
    [t.home, '/'],
    [t.how, '/how-it-works'],
    [t.privacy, '/privacy'],
    [t.about, '/about'],
    [t.soon, '/coming-soon'],
    [t.faq, '/faq'],
  ]
  return [...items.map(([label, href]) => ({ label, href, current: path === href })), { label: t.feedback, onSelect: openFeedback }]
}

export function SkipLink() {
  const t = useT()
  return (
    <a
      href="#main"
      className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-blue-700 px-5 py-3 type-label-m text-white transition-transform focus:translate-y-0 focus-ring"
    >
      {t.skip}
    </a>
  )
}

export function Banner({ className }: { className?: string }) {
  const t = useT()
  return <GovBanner content={t.banner} closeLabel={t.menu.close} className={className} />
}

export function Header({ className }: { className?: string }) {
  const t = useT()
  return (
    <SiteHeader
      nav={useNav()}
      menuLabel={t.menu.open}
      closeLabel={t.menu.close}
      linkAs={Link}
      className={className}
      note={
        <>
          {t.banner.short}
          <br />
          {t.menu.help}.
        </>
      }
    />
  )
}

export function Dock({ visible = true }: { visible?: boolean }) {
  const t = useT()
  const start = useStartChat()
  return <AskDock onSubmit={start} placeholder={t.composer.ask} labels={composerLabels(t)} visible={visible} />
}

// Standard marketing page: banner, header, content, footer, docked box.
export function Page({ children, dock = true }: { children: ReactNode; dock?: boolean }) {
  return (
    <>
      <SkipLink />
      <Banner />
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer />
      {dock && <Dock />}
    </>
  )
}

export function Footer() {
  const t = useT()
  const { lang, setLang } = useLang()
  const openFeedback = useOpenFeedback()
  const link = 'rounded-8 type-footer-link decoration-2 underline-offset-[6px] hover:underline focus-ring cursor-pointer'
  const links: [string, string][] = [
    [t.menu.how, '/how-it-works'],
    [t.menu.privacy, '/privacy'],
    [t.menu.about, '/about'],
    [t.menu.soon, '/coming-soon'],
    [t.menu.faqLong, '/faq'],
  ]
  return (
    <footer className="mt-40 px-6 pb-40 max-mobile:mt-28 max-mobile:px-4 max-mobile:pb-36">
      <nav aria-label="Footer">
        <ul className="flex flex-col items-center gap-0.5 text-center">
          {links.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className={link}>
                {label}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={openFeedback} className={link}>
              {t.menu.feedback}
            </button>
          </li>
        </ul>
      </nav>
      <p
        aria-hidden="true"
        className="mx-auto mt-28 max-w-site text-center font-serif leading-[0.9] tracking-[-0.05em] whitespace-nowrap [font-variation-settings:'opsz'_72] max-mobile:mt-20"
        style={{ fontSize: 'clamp(3.5rem, 15.4vw, 15.5rem)' }}
      >
        {brand.name}
      </p>
      <div className="mx-auto mt-10 grid max-w-site grid-cols-[1fr_auto_1fr] items-center gap-6 type-label-s leading-normal max-[900px]:grid-cols-1 max-[900px]:justify-items-center max-[900px]:text-center">
        <span className="flex items-center gap-2.5 justify-self-start max-[900px]:justify-self-center">
          <span className="flex size-8 items-center justify-center rounded-full ring-1 ring-border-tertiary">
            <CaliforniaFlag width={20} className="rounded-[2px]" />
          </span>
          {t.footer.left}
        </span>
        <span className="flex items-center gap-3 font-medium">
          <Laurel className="h-14 text-primary" />
          <span className="max-w-[13rem] text-center">{t.footer.center}</span>
          <Laurel className="h-14 -scale-x-100 text-primary" />
        </span>
        <span className="justify-self-end max-[900px]:justify-self-center">{t.footer.right}</span>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 type-label-s">
        <Link href="/privacy-policy" className="rounded-4 hover:underline focus-ring">
          {t.footer.privacyPolicy}
        </Link>
        <Link href="/terms" className="rounded-4 hover:underline focus-ring">
          {t.footer.terms}
        </Link>
        <LanguageSelect lang={lang} onChange={setLang} label={t.footer.language} />
      </div>
      <p className="mt-6 text-center type-label-s text-tertiary">{t.banner.short}</p>
    </footer>
  )
}

const languages: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
]

export function LanguageSelect({ lang, onChange, label, className }: { lang: Lang; onChange: (l: Lang) => void; label: string; className?: string }) {
  return (
    <label className={cx('relative inline-flex items-center gap-1 rounded-4 focus-within:shadow-focus', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value as Lang)}
        className="cursor-pointer appearance-none bg-transparent pr-5 type-label-s outline-none"
      >
        {languages.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-0" />
    </label>
  )
}

// One laurel branch (left side). Mirror it with -scale-x-100 for the right.
// Leaves sit in pairs along a curved stem and shrink toward the tip.
const P0 = [25, 62], P1 = [1, 38], P2 = [17, 3]
const leaves = Array.from({ length: 8 }, (_, i) => {
  const t = 0.1 + i * 0.115
  const u = 1 - t
  const x = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0]
  const y = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]
  const dx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0])
  const dy = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])
  const along = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  return { x, y, along, s: 1 - i * 0.06 }
})

export function Laurel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 66" className={className} aria-hidden="true" fill="currentColor">
      <path d={`M${P0} Q${P1} ${P2}`} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) scale(${l.s.toFixed(2)})`}>
          <ellipse cx="0" cy="-4.2" rx="1.7" ry="4.2" transform={`rotate(${(l.along - 38).toFixed(1)})`} />
          <ellipse cx="0" cy="-3.8" rx="1.5" ry="3.8" transform={`rotate(${(l.along + 34).toFixed(1)})`} />
        </g>
      ))}
      <ellipse cx="0" cy="-3.6" rx="1.5" ry="3.6" transform={`translate(${P2[0]} ${P2[1] + 1}) rotate(${(leaves[7].along).toFixed(1)}) scale(.8)`} />
    </svg>
  )
}
