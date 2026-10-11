import { useState, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from 'react'
import { brand } from '../brand/brand'
import { Button } from './Button'
import { cx } from './cx'
import { CaliforniaFlag } from './Flags'
import { Logo } from './Logo'
import { Sheet } from './Sheet'

// `onSelect` items are buttons (e.g. "Submit feedback" opens a dialog).
export type NavItem = { label: string; href?: string; current?: boolean; onSelect?: () => void }

type LinkComponent = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>

export const defaultNav: NavItem[] = [
  { label: 'Home', href: '#', current: true },
  { label: 'How it works', href: '#how' },
  { label: 'Benefits we cover', href: '#benefits' },
  { label: 'Check my applications', href: '#status' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
]

const PlainLink: LinkComponent = (props) => <a {...props} />

export function SiteHeader({
  nav = defaultNav,
  menuLabel = 'Menu',
  closeLabel,
  note,
  linkAs = PlainLink,
  className,
}: {
  nav?: NavItem[]
  menuLabel?: string
  closeLabel?: string
  note?: ReactNode
  linkAs?: LinkComponent
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const L = linkAs
  return (
    <header
      className={cx(
        'site-header mx-auto grid w-full max-w-site grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-6 max-mobile:p-3',
        className,
      )}
    >
      <L href="/" aria-label={`${brand.name} home`} className="site-home-link justify-self-start rounded-8 focus-ring">
        <Logo plain />
      </L>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog" className="site-menu-trigger backdrop-blur-[var(--blur-frost)]">
        {menuLabel}
      </Button>
      <MenuSheet open={open} onClose={() => setOpen(false)} nav={nav} title={menuLabel} closeLabel={closeLabel} note={note} linkAs={L} />
    </header>
  )
}

export function MenuSheet({
  open,
  onClose,
  nav,
  title = 'Menu',
  closeLabel,
  note,
  linkAs: L = PlainLink,
}: {
  open: boolean
  onClose: () => void
  nav: NavItem[]
  title?: string
  closeLabel?: string
  note?: ReactNode
  linkAs?: LinkComponent
}) {
  const item =
    'rounded-8 text-[2rem] leading-[1.25] font-medium tracking-[-0.04em] decoration-2 underline-offset-4 hover:underline aria-[current=page]:underline focus-ring cursor-pointer'
  return (
    <Sheet open={open} onClose={onClose} title={title} hideTitle placement="corner" closeLabel={closeLabel}>
      <nav aria-label="Main">
        <ul className="flex flex-col items-center gap-1 py-6 text-center">
          {nav.map((n) => (
            <li key={n.label}>
              {n.href ? (
                <L href={n.href} onClick={onClose} aria-current={n.current ? 'page' : undefined} className={item}>
                  {n.label}
                </L>
              ) : (
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    onClose()
                    n.onSelect?.()
                  }}
                >
                  {n.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-24 bg-background-tertiary px-6 py-6 text-center">
        <CaliforniaFlag width={28} className="ring-1 ring-border-tertiary" />
        <p className="type-body-s text-secondary">
          {note ?? (
            <>
              {brand.banner.short}
              <br />
              {brand.help.label}.
            </>
          )}
        </p>
      </div>
    </Sheet>
  )
}
