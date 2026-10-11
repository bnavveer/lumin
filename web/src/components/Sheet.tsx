import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './Button'
import { cx } from './cx'

// Modal card over a blurred backdrop. Uses <dialog> for focus trapping and Esc.
// `placement="corner"` is the menu (grows out of the Menu button, top right);
// "center" is for explainers and forms.
//
// Closing animates: clicking outside, Esc, the close button or a link sets
// `open` to false, the card and backdrop play their exit, and only then is
// the dialog actually closed.
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  placement = 'center',
  closeLabel = 'Close',
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  hideTitle?: boolean
  placement?: 'center' | 'corner'
  closeLabel?: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setClosing(false)
      d.showModal()
      return
    }
    if (!open && d.open) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return d.close()
      setClosing(true)
      const done = () => {
        d.close()
        setClosing(false)
      }
      // Fall back in case animationend never fires (tab hidden, etc.)
      const t = setTimeout(done, 400)
      d.addEventListener('animationend', function end(e) {
        if (e.target !== d) return
        d.removeEventListener('animationend', end)
        clearTimeout(t)
        done()
      })
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      data-closing={closing || undefined}
      data-placement={placement}
      onCancel={(e) => {
        // Esc: run the exit animation instead of closing instantly
        e.preventDefault()
        onClose()
      }}
      onClose={() => open && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cx(
        'sheet m-0 max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] overflow-auto rounded-40 bg-background-primary p-0 text-primary shadow-elevation-1',
        'backdrop:bg-background-overlay backdrop:backdrop-blur-[var(--blur-scrim)]',
        placement === 'center'
          ? 'fixed top-1/2 left-1/2 max-w-[27rem] -translate-x-1/2 -translate-y-1/2'
          : 'fixed top-3 right-3 left-auto max-w-[27rem] mobile:top-11 mobile:right-8',
        className,
      )}
    >
      <div className="relative px-10 pt-8 pb-10 max-mobile:px-6">
        <div className="mb-8 flex min-h-9 items-center justify-center">
          <h2 className={cx('type-label-m', hideTitle && 'sr-only')}>{title}</h2>
          <IconButton icon="close" label={closeLabel} size="sm" onClick={onClose} className="absolute top-8 right-8 max-mobile:right-5" />
        </div>
        {children}
      </div>
    </dialog>
  )
}
