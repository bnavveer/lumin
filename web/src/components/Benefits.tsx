import { useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

export type Status =
  | 'likely'
  | 'maybe'
  | 'unlikely'
  | 'drafting'
  | 'submitted'
  | 'action'
  | 'approved'
  | 'denied'

const statusStyles: Record<Status, { label: string; className: string; icon: IconName }> = {
  likely: { label: 'Likely eligible', className: 'bg-green-50 text-green-600', icon: 'check-circle' },
  maybe: { label: 'Need more info', className: 'bg-amber-50 text-amber-700', icon: 'info' },
  unlikely: { label: 'Over the limit', className: 'bg-grey-50 text-secondary', icon: 'info' },
  drafting: { label: 'Drafting', className: 'bg-background-tertiary text-secondary', icon: 'edit' },
  submitted: { label: 'Submitted', className: 'bg-blue-50 text-blue-600', icon: 'clock' },
  action: { label: 'Action needed', className: 'bg-amber-50 text-amber-700', icon: 'warning' },
  approved: { label: 'Approved', className: 'bg-green-50 text-green-600', icon: 'check-circle' },
  denied: { label: 'Denied', className: 'bg-[#fdf2f3] text-red-600', icon: 'warning' },
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = statusStyles[status]
  return (
    <span className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 type-label-s font-medium whitespace-nowrap', s.className)}>
      <Icon name={s.icon} size={14} strokeWidth={2} />
      {label ?? s.label}
    </span>
  )
}

export type Benefit = {
  id: string
  name: string
  plain: string // what it is, in plain words
  agency: string
  status: Status
  value?: string // "Up to $306/mo"
  reason?: string
}

// One program in the results list. Gray card, 32px corners, like the
// america.gov press cards.
export function BenefitCard({
  benefit,
  action,
  className,
}: {
  benefit: Benefit
  action?: ReactNode
  className?: string
}) {
  return (
    <article className={cx('flex flex-col rounded-32 bg-background-tertiary p-6 max-mobile:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="type-label-s text-secondary">{benefit.agency}</p>
          <h3 className="mt-1.5 type-card-title">{benefit.name}</h3>
        </div>
        <StatusBadge status={benefit.status} />
      </div>
      <p className="mt-2 type-body-s text-secondary">{benefit.plain}</p>
      {benefit.value && <p className="mt-5 font-serif text-[2rem] leading-none tracking-[-0.03em] [font-variation-settings:'opsz'_48]">{benefit.value}</p>}
      {benefit.reason && <p className="mt-3 type-body-s">{benefit.reason}</p>}
      {action && <div className="mt-auto pt-6">{action}</div>}
    </article>
  )
}

// Headline number at the top of the results.
export function BenefitsTotal({ amount, count, note }: { amount: string; count: number; note?: string }) {
  return (
    <div className="text-center">
      <p className="type-body-m text-secondary">You may qualify for {count} programs worth about</p>
      <p className="mt-2 type-site-hero">{amount}</p>
      {note && <p className="mx-auto mt-3 max-w-prose type-body-s text-tertiary">{note}</p>}
    </div>
  )
}

export type TimelineStep = { label: string; detail?: string; date?: string; state: 'done' | 'current' | 'todo' }

// Where an application is: submitted → interview → decision.
export function ApplicationTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cx('absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full', s.state === 'done' ? 'bg-blue-700' : 'bg-background-secondary')}
            />
          )}
          <span
            className={cx(
              'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full',
              s.state === 'done' && 'bg-blue-700 text-white',
              s.state === 'current' && 'bg-white text-blue-700 ring-2 ring-blue-700',
              s.state === 'todo' && 'bg-background-secondary',
            )}
          >
            {s.state === 'done' && <Icon name="check" size={16} strokeWidth={2.5} />}
            {s.state === 'current' && <span className="size-2.5 rounded-full bg-blue-700" />}
          </span>
          <div className="pt-0.5">
            <p className={cx('type-body-m', s.state === 'todo' ? 'text-secondary' : 'font-medium')}>
              {s.label}
              {s.date && <span className="ml-2 font-normal type-body-s text-tertiary">{s.date}</span>}
            </p>
            {s.detail && <p className="mt-0.5 type-body-s text-secondary">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export type DocItem = { name: string; why: string; done?: boolean }

export function DocumentChecklist({ items }: { items: DocItem[] }) {
  return (
    <ul className="divide-y divide-border-tertiary">
      {items.map((d) => (
        <li key={d.name} className="flex items-start gap-3 py-4">
          <span
            className={cx(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
              d.done ? 'bg-green-600 text-white' : 'border border-dashed border-border-secondary text-tertiary',
            )}
          >
            {d.done ? <Icon name="check" size={14} strokeWidth={2.5} /> : <Icon name="document" size={14} />}
          </span>
          <div className="flex-1">
            <p className="type-body-m">{d.name}</p>
            <p className="type-body-s text-secondary">{d.why}</p>
          </div>
          {d.done && <span className="type-label-s text-green-600">Added</span>}
        </li>
      ))}
    </ul>
  )
}

// Upload area for pay stubs, IDs, letters. Files stay in the browser here.
export function DocumentDropZone({ onFiles }: { onFiles?: (files: File[]) => void }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onFiles?.([...e.dataTransfer.files])
      }}
      className={cx(
        'flex flex-col items-center gap-3 rounded-32 border-2 border-dashed px-6 py-10 text-center transition-colors',
        over ? 'border-blue-600 bg-blue-600/10' : 'border-border-tertiary bg-grey-50',
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-white shadow-soft-sm">
        <Icon name="paperclip" />
      </span>
      <div>
        <p className="type-body-m font-medium">Drop a photo or PDF here</p>
        <p className="type-body-s text-secondary">Pay stubs, ID, rent receipts, benefit letters</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        Choose files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => onFiles?.([...(e.target.files ?? [])])}
      />
    </div>
  )
}
