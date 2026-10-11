import type { ReactNode } from 'react'
import { cx } from '../components/cx'
import { useInView } from './hooks'

// Layout pieces shared by the marketing pages, sized like america.gov's.

export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'li' | 'figure' }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <Tag ref={ref as never} data-in={inView} className={cx('reveal', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}

// Big serif page heading. Each entry in `lines` is its own line, as on america.gov.
export function PageTitle({ lines, children, className }: { lines?: ReactNode[]; children?: ReactNode; className?: string }) {
  return (
    <h1 className={cx('mx-auto max-w-site px-6 pt-28 text-center type-page-heading max-mobile:px-4 max-mobile:pt-16', className)}>
      {lines
        ? lines.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))
        : children}
    </h1>
  )
}

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto mt-20 flex max-w-[28rem] flex-col gap-6 px-6 type-page-intro text-secondary max-mobile:mt-12 max-mobile:px-5', className)}>{children}</div>
}

export function SectionTitle({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cx('mx-auto max-w-site scroll-mt-10 px-6 text-center type-section-heading max-mobile:px-4', className)}>
      {children}
    </h2>
  )
}

export function Grid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3; className?: string }) {
  return (
    <div
      className={cx(
        'mx-auto grid max-w-site gap-x-4 gap-y-16 px-12 max-mobile:gap-y-12 max-mobile:px-4',
        cols === 2 ? 'grid-cols-2 max-[860px]:grid-cols-1' : 'grid-cols-3 max-[1000px]:grid-cols-2 max-[680px]:grid-cols-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

// Light gray pill button ("See what's ahead", "Share what you want to see next")
export const pillClass =
  'inline-flex h-11 cursor-pointer items-center rounded-full bg-background-tertiary px-5 text-[0.9375rem] font-medium tracking-tight transition-[background-color,scale] duration-200 ease-out-quint hover:bg-background-secondary active:scale-[.98] focus-ring'
