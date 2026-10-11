import { useState } from 'react'
import { brand } from '../brand/brand'
import { Button } from './Button'
import { cx } from './cx'
import { CaliforniaFlag } from './Flags'
import { Logo } from './Logo'
import { Sheet } from './Sheet'

export type NavItem = { label: string; href: string; current?: boolean }

export const defaultNav: NavItem[] = [
  { label: 'Home', href: '#', current: true },
  { label: 'How it works', href: '#how' },
  { label: 'Benefits we cover', href: '#benefits' },
  { label: 'Check my applications', href: '#status' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
]

export function SiteHeader({ nav = defaultNav, className }: { nav?: NavItem[]; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header
      className={cx(
        'mx-auto grid w-full max-w-site grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-6 max-mobile:p-3',
        className,
      )}
    >
      <Logo />
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog" className="backdrop-blur-[var(--blur-frost)]">
        Menu
      </Button>
      <MenuSheet open={open} onClose={() => setOpen(false)} nav={nav} />
    </header>
  )
}

export function MenuSheet({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavItem[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Menu" hideTitle placement="corner">
      <nav aria-label="Main">
        <ul className="flex flex-col items-center gap-1 py-6 text-center">
          {nav.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                onClick={onClose}
                aria-current={item.current ? 'page' : undefined}
                className="rounded-8 text-[2rem] leading-[1.25] font-medium tracking-[-0.04em] hover:underline aria-[current=page]:underline focus-ring decoration-2 underline-offset-4"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-24 bg-background-tertiary px-6 py-6 text-center">
        <CaliforniaFlag width={28} className="ring-1 ring-border-tertiary" />
        <p className="type-body-s text-secondary">
          {brand.banner.short}
          <br />
          {brand.help.label}.
        </p>
      </div>
    </Sheet>
  )
}
