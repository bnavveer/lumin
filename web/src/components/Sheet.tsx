import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import { cx } from './cx'

// Modal card over a blurred backdrop. Uses <dialog> for focus trapping and Esc.
// `placement="corner"` is the america.gov menu (top right); "center" is the
// gov-banner explainer.
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  placement = 'center',
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  hideTitle?: boolean
  placement?: 'center' | 'corner'
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cx(
        'm-0 max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] overflow-auto rounded-40 bg-background-primary p-0 text-primary shadow-elevation-1',
        'backdrop:bg-background-overlay backdrop:backdrop-blur-[var(--blur-scrim)]',
        'open:animate-[sheet-in_.3s_var(--ease-drawer)]',
        placement === 'center'
          ? 'fixed top-1/2 left-1/2 max-w-[27rem] -translate-x-1/2 -translate-y-1/2'
          : 'fixed top-3 right-3 left-auto max-w-[27rem] mobile:top-11 mobile:right-8',
        className,
      )}
    >
      <div className="relative px-10 pt-8 pb-10 max-mobile:px-6">
        <div className="mb-8 flex min-h-9 items-center justify-center">
          <h2 className={cx('type-label-m', hideTitle && 'sr-only')}>{title}</h2>
          <IconButton icon="close" label="Close" size="sm" onClick={onClose} className="absolute top-8 right-8 max-mobile:right-5" />
        </div>
        {children}
      </div>
    </dialog>
  )
}
