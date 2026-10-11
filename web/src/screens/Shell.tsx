import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { brand } from '../brand/brand'
import { canViewStaff, useAuth } from '../lib/auth'
import { goSection, Link, navigate } from '../lib/router'
import { Loading, Page } from './ui'

export function PrototypePill() {
  return (
    <span className="inline-flex h-7 items-center rounded-full bg-accent-soft px-3 type-label-s font-medium text-accent">
      {brand.banner.short}
    </span>
  )
}

const navLink = 'rounded-full px-3 py-2 type-body-s hover:bg-background-tertiary focus-ring'
const sections = [
  { label: 'Product', id: 'product' },
  { label: 'How it works', id: 'how' },
  { label: 'For health plans', id: 'plans' },
  { label: 'Pricing', id: 'pricing' },
]

// Public marketing header: wordmark, product nav, Sign in, primary CTA.
export function PublicHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-20 border-b border-border-quaternary bg-white/85 backdrop-blur-[var(--blur-frost)]">
      <div className="mx-auto flex w-full max-w-site items-center justify-between gap-3 px-6 py-3 max-mobile:px-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {sections.map((s) => (
            <a key={s.id} href="#/" onClick={(e) => { e.preventDefault(); goSection(s.id) }} className={navLink}>{s.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/staff/login" className={`${navLink} max-mobile:hidden`}>Sign in</Link>
          <Button size="sm" onClick={() => navigate('/setup')}>Start a pilot</Button>
          <button type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}
            className="rounded-full px-3 py-2 type-body-s hover:bg-background-tertiary focus-ring lg:hidden">Menu</button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col border-t border-border-quaternary px-4 py-2 lg:hidden">
          {sections.map((s) => (
            <a key={s.id} href="#/" onClick={(e) => { e.preventDefault(); setOpen(false); goSection(s.id) }} className={navLink}>{s.label}</a>
          ))}
          <Link to="/staff/login" onClick={() => setOpen(false)} className={navLink}>Sign in</Link>
        </nav>
      )}
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="mt-24 border-t border-border-tertiary px-6 py-12 max-mobile:px-4">
      <div className="mx-auto grid max-w-site gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs type-body-s text-secondary">The AI caseworker for clinics, health plans and nonprofits.</p>
        </div>
        <FooterCol title="Product" links={[['Eligibility check', '#/screen'], ['Staff dashboard', '#/staff'], ['Set up a pilot', '#/setup']]} />
        <FooterCol title="Company" links={[['Sign in', '#/staff/login'], ['Contact', 'mailto:pilot@aid.example']]} />
        <FooterCol title="Demo" links={[['County intake mock', '#/county'], ['UI kit', '#/kit']]} />
      </div>
      <div className="mx-auto mt-10 flex max-w-site flex-wrap items-center justify-between gap-3 border-t border-border-quaternary pt-6">
        <span className="type-label-s text-secondary">Aid is a software company. It is not a government agency.</span>
        <PrototypePill />
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <p className="type-body-s font-medium">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map(([l, h]) => (
          <li key={l}><a href={h} className="rounded-4 type-body-s text-secondary hover:text-primary hover:underline focus-ring">{l}</a></li>
        ))}
      </ul>
    </nav>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
      <PublicFooter />
    </>
  )
}

export function NotFound({ message = 'Check the address, or start from the home page.' }: { message?: string }) {
  return (
    <PublicShell>
      <Page width="max-w-prose">
        <div className="py-24 text-center">
          <h1 className="type-page-heading">That page doesn’t exist</h1>
          <p className="mt-3 type-body-m text-secondary">{message}</p>
          <Button className="mt-6" onClick={() => navigate('/')}>Go home</Button>
        </div>
      </Page>
    </PublicShell>
  )
}

// Staff pages: header with nav and sign-out; redirects to login when not allowed in.
export function StaffShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const auth = useAuth()
  const allowed = canViewStaff(auth)
  // Server in demo mode accepts unauthenticated requests; others need sign-in.
  const open = allowed || (auth.ready && auth.demoMode)
  useEffect(() => {
    if (auth.ready && !open) navigate('/staff/login')
  }, [auth.ready, open])

  return (
    <>
      <header className="mx-auto flex w-full max-w-[84rem] flex-wrap items-center justify-between gap-3 px-6 py-4 max-mobile:px-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <Logo />
          <nav aria-label="Staff" className="flex items-center gap-1">
            <Link to="/staff" className={navLink}>Dashboard</Link>
            <Link to="/staff/settings" className={navLink}>Settings</Link>
            <Link to="/county" className={navLink}>County portal</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <PrototypePill />
          {auth.session && <Button size="sm" variant="outline" onClick={() => void auth.signOut().then(() => navigate('/'))}>Sign out</Button>}
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full px-6 pb-24 max-mobile:px-4 ${wide ? 'max-w-[84rem]' : 'max-w-site'}`}>
        {auth.ready && open ? children : <Loading label="Checking sign-in" />}
      </main>
    </>
  )
}
