import { brand } from '../brand/brand'
import { cx } from './cx'
import { CaliforniaFlag, USFlag } from './Flags'

// Flag + serif wordmark, like the america.gov header. `showRegion` adds a
// California chip so people know the answers are for California.
export function Logo({
  size = 'md',
  showRegion = true,
  href = '/',
  plain,
  className,
}: {
  size?: 'md' | 'lg'
  showRegion?: boolean
  href?: string
  // Render a <span> so a router link can wrap it
  plain?: boolean
  className?: string
}) {
  const Tag = plain ? 'span' : 'a'
  return (
    <Tag
      href={plain ? undefined : href}
      aria-label={plain ? undefined : `${brand.name} home`}
      className={cx('inline-flex min-w-0 items-center gap-2.5 rounded-8 focus-ring', className)}
    >
      <USFlag width={size === 'lg' ? 36 : 28} />
      <span
        className={cx(
          'font-serif whitespace-nowrap tracking-[-0.04em] text-primary [font-variation-settings:"opsz"_36]',
          size === 'lg' ? 'text-3xl' : 'text-[1.4rem] leading-none',
        )}
      >
        {brand.name}
      </span>
      {showRegion && <RegionChip />}
    </Tag>
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
