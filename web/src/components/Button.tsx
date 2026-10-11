import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-medium tracking-tight leading-none rounded-full focus-ring ' +
  'transition-[color,background-color,border-color,box-shadow,scale] duration-200 ease-out-quint active:scale-[.98] ' +
  'disabled:pointer-events-none disabled:bg-background-tertiary disabled:text-disabled'

const variants: Record<Variant, string> = {
  // america.gov "Menu" button
  primary: 'bg-blue-700 text-white hover:bg-blue-800',
  // carousel controls, close buttons
  secondary: 'bg-background-tertiary text-primary hover:bg-background-secondary',
  outline: 'border border-border-primary text-primary hover:bg-background-tertiary',
  ghost: 'text-primary hover:bg-background-tertiary',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-base pb-0.5',
  lg: 'h-14 px-7 text-lg pb-0.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  children?: ReactNode
}) {
  return (
    <button type="button" className={cx(base, variants[variant], sizes[size], className)} {...props}>
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
    </button>
  )
}

const iconSizes = { sm: 'size-8', md: 'size-10', lg: 'size-12' }

// Round icon-only button: send, close, carousel prev/pause/next
export function IconButton({
  icon,
  label,
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
  variant?: Variant
  size?: Size
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(base, variants[variant], iconSizes[size], className)}
      {...props}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  )
}

export function TextLink({
  href,
  children,
  external,
  className,
}: {
  href: string
  children: ReactNode
  external?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={cx(
        'rounded-4 text-link underline decoration-1 underline-offset-[3px] hover:decoration-2 focus-ring',
        className,
      )}
    >
      {children}
    </a>
  )
}
