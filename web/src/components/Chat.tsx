import { useState, type ReactNode } from 'react'
import { Button, IconButton, TextLink } from './Button'
import { cx } from './cx'
import { Icon } from './icons'

export function ChatThread({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="log" aria-live="polite" className={cx('mx-auto flex w-full max-w-chat flex-col gap-8', className)}>
      {children}
    </div>
  )
}

// Light blue-grey bubble, right aligned (as on america.gov/chat).
export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-24 bg-background-tertiary px-5 py-3.5 type-body-m whitespace-pre-wrap">
        {children}
      </div>
    </div>
  )
}

// Assistant replies sit on the page with no bubble.
export function AssistantMessage({
  children,
  sources,
  footer,
}: {
  children: ReactNode
  sources?: Source[]
  footer?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-none text-[1.0625rem] leading-[1.6] tracking-tight [&_p+p]:mt-4 [&_strong]:font-medium [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
      {sources && sources.length > 0 && <SourceChips sources={sources} />}
      {footer}
    </div>
  )
}

export function TypingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-secondary" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-primary"
            style={{ animation: `dot-pulse 1.2s ${i * 0.15}s infinite var(--ease-standard)` }}
          />
        ))}
      </span>
      <span className="type-body-s">{label}…</span>
    </div>
  )
}

export type Source = { domain: string; title: string; href: string }

// Compact row under an answer: "dss.ca.gov +2". Opens the full list.
export function SourceChips({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  const domains = [...new Set(sources.map((s) => s.domain))]
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-background-tertiary pr-3 pl-1.5 type-label-s font-medium text-secondary transition-colors hover:bg-background-secondary hover:text-primary focus-ring"
      >
        <SealDot />
        {domains[0]}
        {sources.length > 1 && <span className="text-tertiary">+{sources.length - 1}</span>}
      </button>
      {open && <SourcesCard sources={sources} onClose={() => setOpen(false)} className="mt-3" />}
    </div>
  )
}

// The "Sources" popover from america.gov/how-it-works.
export function SourcesCard({
  sources,
  onClose,
  className,
}: {
  sources: Source[]
  onClose?: () => void
  className?: string
}) {
  const byDomain = Object.entries(
    sources.reduce<Record<string, Source[]>>((acc, s) => {
      ;(acc[s.domain] ??= []).push(s)
      return acc
    }, {}),
  )
  return (
    <div className={cx('w-full max-w-[22rem] rounded-24 bg-background-primary p-5 shadow-elevation-1 ring-1 ring-border-quaternary', className)}>
      <div className="relative mb-4 flex items-center justify-center">
        <h3 className="type-label-m">Sources</h3>
        {onClose && <IconButton icon="close" label="Close sources" size="sm" onClick={onClose} className="absolute right-0" />}
      </div>
      <ul className="flex flex-col gap-5">
        {byDomain.map(([domain, items]) => (
          <li key={domain}>
            <div className="mb-2 flex items-center gap-3">
              <SealDot size={32} />
              <div>
                <p className="type-body-s font-medium leading-tight">{domain}</p>
                <p className="type-label-s text-tertiary">
                  {items.length} source{items.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 pl-11">
              {items.map((s) => (
                <li key={s.href} className="type-body-s">
                  <TextLink href={s.href} external>
                    {s.title}
                  </TextLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Stand-in for an agency seal: we don't reuse real agency seals.
function SealDot({ size = 22 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-border-tertiary"
      style={{ width: size, height: size }}
    >
      <Icon name="building" size={size * 0.6} />
    </span>
  )
}

const noticeTones = {
  error: { icon: 'warning', className: 'text-primary', iconClass: 'text-red-600' },
  warning: { icon: 'warning', className: 'text-primary', iconClass: 'text-amber-700' },
  info: { icon: 'info', className: 'text-primary', iconClass: 'text-blue-600' },
  success: { icon: 'check-circle', className: 'text-primary', iconClass: 'text-green-600' },
} as const

// "Something went wrong. Try again" sits on top of the composer on america.gov.
export function ChatNotice({
  tone = 'error',
  title,
  children,
  action,
}: {
  tone?: keyof typeof noticeTones
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  const t = noticeTones[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex flex-col gap-2', t.className)}>
      <p className="flex items-center gap-2 type-body-m font-medium">
        <Icon name={t.icon} size={18} className={t.iconClass} />
        {title}
      </p>
      {children && <div className="type-body-s text-secondary">{children}</div>}
      {action}
    </div>
  )
}

// Composer with a notice sitting on top of it, inside one rounded shell.
export function ComposerShell({ notice, children }: { notice?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('rounded-40', !!notice && 'bg-background-primary shadow-elevation-1 ring-1 ring-border-quaternary')}>
      {notice && <div className="px-7 pt-6 pb-5">{notice}</div>}
      {children}
    </div>
  )
}

export function QuickReplies({ options, onPick }: { options: string[]; onPick?: (o: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick?.(o)}
          className="h-10 cursor-pointer rounded-full border border-border-tertiary px-4 type-body-s font-medium transition-colors hover:border-border-secondary hover:bg-background-tertiary focus-ring"
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function AiDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('text-center type-label-s leading-normal text-tertiary', className)}>
      Answers are written by AI and can be wrong. We always show you an application before it’s sent.
    </p>
  )
}

// The agent asks permission before it submits anything. Nothing is sent
// until the person presses the primary button.
export function ConsentCard({
  program,
  agency,
  fields,
  onApprove,
  onReview,
}: {
  program: string
  agency: string
  fields: { label: string; value: string }[]
  onApprove?: () => void
  onReview?: () => void
}) {
  return (
    <div className="rounded-32 bg-background-tertiary p-6 max-mobile:p-5">
      <p className="type-label-s font-medium tracking-normal text-secondary uppercase">Ready to apply</p>
      <h3 className="mt-2 type-heading-s">
        Send your {program} application to {agency}?
      </h3>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 type-body-s">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-secondary">{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={onApprove} iconRight="arrow-right">
          Yes, send it
        </Button>
        <Button variant="outline" onClick={onReview} icon="edit">
          Review first
        </Button>
      </div>
    </div>
  )
}
