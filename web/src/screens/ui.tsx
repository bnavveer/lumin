import type { ReactNode } from 'react'
import { Button } from '../components/Button'
import { cx } from '../components/cx'
import { Icon, type IconName } from '../components/icons'

// Shared loading / empty / error states so every screen degrades the same way.

export function ErrorCard({ title = 'Couldn’t load this', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-24 border border-red-600/30 bg-[#fdf2f3] p-5">
      <p className="flex items-center gap-2 type-body-m font-medium">
        <Icon name="warning" size={18} className="text-red-600" />
        {title}
      </p>
      <p className="type-body-s text-secondary break-words">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ icon = 'info', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-24 border border-dashed border-border-tertiary px-5 py-8 text-center">
      <Icon name={icon} size={22} className="text-tertiary" />
      <p className="type-body-m font-medium">{title}</p>
      {children && <p className="max-w-prose type-body-s text-secondary">{children}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-16 bg-background-tertiary', className)} />
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  )
}

export function Chip({ children, className, icon }: { children: ReactNode; className?: string; icon?: IconName }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 type-label-s font-medium whitespace-nowrap', className)}>
      {icon && <Icon name={icon} size={12} strokeWidth={2} />}
      {children}
    </span>
  )
}

// Page container shared by public screens.
export function Page({ children, width = 'max-w-site' }: { children: ReactNode; width?: string }) {
  return <main id="main" tabIndex={-1} className={cx('mx-auto w-full px-6 max-mobile:px-4', width)}>{children}</main>
}
