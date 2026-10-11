import { brand } from '../brand/brand'
import { cx } from './cx'
import { CaliforniaFlag } from './Flags'

// Flag + serif wordmark, like the america.gov header. `showRegion` adds a
// California chip so people know the answers are for California.
export function Logo({
  size = 'md',
  showRegion = false,
  href = '#/',
  className,
}: {
  size?: 'md' | 'lg'
  showRegion?: boolean
  href?: string
  className?: string
}) {
  return (
    <a
      href={href}
      aria-label={`${brand.name} home`}
      className={cx('inline-flex min-w-0 items-center gap-2.5 rounded-8 focus-ring', className)}
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" width={size === 'lg' ? 36 : 28} height={size === 'lg' ? 36 : 28} className="shrink-0">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <path d="M9 23 16 8l7 15M12 18.5h8" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-on-accent" />
        <circle cx="23.5" cy="9" r="2.2" className="fill-on-accent" />
      </svg>
      <span
        className={cx(
          'font-serif whitespace-nowrap tracking-[-0.04em] text-primary [font-variation-settings:"opsz"_36]',
          size === 'lg' ? 'text-3xl' : 'text-[1.4rem] leading-none',
        )}
      >
        {brand.name}
      </span>
      {showRegion && <RegionChip />}
    </a>
  )
}

export function RegionChip({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full bg-background-tertiary py-1 pl-1.5 pr-2.5 type-label-s font-medium text-secondary',
        className,
      )}
    >
      <CaliforniaFlag width={18} className="rounded-[2px] ring-1 ring-border-tertiary" />
      {brand.region}
    </span>
  )
}
