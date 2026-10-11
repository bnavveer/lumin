import { useCallback, type ReactNode } from 'react'
import { brand } from '../brand/brand'
import { useAuth } from '../account/auth'
import { AskDock, type ComposerLabels } from '../components/ChatComposer'
import { cx } from '../components/cx'
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
  const { user } = useAuth()
  const items: [string, string][] = [
    [t.home, '/'],
    [user ? 'Dashboard' : 'Sign in / create account', user ? '/dashboard' : '/login'],
    [t.how, '/how-it-works'],
    [t.privacy, '/privacy'],
    [t.about, '/about'],
    [t.soon, '/coming-soon'],
    [t.faq, '/faq'],
    ...(user ? ([['My applications', '/account']] as [string, string][]) : []),
    ['Staff access', '/staff'],
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

export function Header({ className }: { className?: string }) {
  const t = useT()
  return (
    <SiteHeader
      nav={useNav()}
      menuLabel={t.menu.open}
      closeLabel={t.menu.close}
      linkAs={Link}
      className={className}
      note={<>{t.menu.help}.</>}
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
  const links: [string, string][] = [
    [t.menu.how, '/how-it-works'],
    [t.menu.privacy, '/privacy'],
    [t.menu.about, '/about'],
    [t.menu.soon, '/coming-soon'],
    [t.menu.faqLong, '/faq'],
  ]
  return (
    <footer className="mt-20 border-t border-border-tertiary bg-[#F7F9FC] px-6 pt-10 pb-28 max-mobile:mt-14 max-mobile:px-5 max-mobile:pt-8">
      <div className="mx-auto max-w-site">
        <div className="flex flex-wrap justify-between gap-x-16 gap-y-8">
          <div className="max-w-[18rem]">
            <Link href="/" aria-label={`${brand.name} home`} className="inline-flex items-center gap-2.5 rounded-8 focus-ring">
              <span className="font-serif text-[2rem] leading-none tracking-tight">{brand.name}</span>
            </Link>
            <p className="mt-4 type-body-s text-secondary">{t.footer.center}</p>
            <p className="mt-2 text-sm text-secondary">{t.footer.left}</p>
          </div>
          <nav aria-label="Footer" className="max-w-[35rem]">
            <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm max-mobile:gap-x-6">
              {links.map(([label, href]) => <li key={href}><Link href={href} className="rounded-4 hover:underline focus-ring">{label}</Link></li>)}
              <li><button type="button" onClick={openFeedback} className="cursor-pointer rounded-4 text-left hover:underline focus-ring">{t.menu.feedback}</button></li>
            </ul>
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border-tertiary pt-5 text-xs text-secondary">
          <p>{t.footer.right}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/privacy-policy" className="rounded-4 hover:underline focus-ring">{t.footer.privacyPolicy}</Link>
            <Link href="/terms" className="rounded-4 hover:underline focus-ring">{t.footer.terms}</Link>
            <LanguageSelect lang={lang} onChange={setLang} label={t.footer.language} />
          </div>
        </div>
      </div>
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
