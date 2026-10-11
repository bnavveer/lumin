import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon } from './icons'

// america.gov has no forms yet, so these follow its input look: thin
// ink borders, 16px corners, 56px tall, big readable labels.

const fieldBox =
  'h-14 w-full rounded-16 border border-border-secondary bg-background-primary px-4 text-base tracking-tight text-primary ' +
  'placeholder:text-tertiary transition-[border-color,box-shadow] duration-150 outline-none ' +
  'hover:border-border-primary focus:border-primary focus:shadow-[0_0_0_3px_var(--color-background-secondary)] ' +
  'aria-[invalid=true]:border-red-600 disabled:bg-grey-50 disabled:text-tertiary'

function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block type-body-m font-medium">
      {children}
      {optional && <span className="ml-1.5 font-normal text-tertiary">(optional)</span>}
    </label>
  )
}

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={id} className="mt-2 flex items-center gap-1.5 type-body-s text-red-600">
        <Icon name="warning" size={16} />
        {error}
      </p>
    )
  if (hint)
    return (
      <p id={id} className="mt-2 type-body-s text-secondary">
        {hint}
      </p>
    )
  return null
}

export function TextField({
  label,
  hint,
  error,
  optional,
  prefix,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  optional?: boolean
  prefix?: string
}) {
  const id = useId()
  const helpId = `${id}-help`
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-secondary">{prefix}</span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? helpId : undefined}
          className={cx(fieldBox, prefix && 'pl-8')}
          {...props}
        />
      </div>
      <Help id={helpId} error={error} hint={hint} />
    </div>
  )
}

export function SelectField({
  label,
  hint,
  error,
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  error?: string
  options: { value: string; label: string }[]
}) {
  const id = useId()
  const helpId = `${id}-help`
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? helpId : undefined}
          className={cx(fieldBox, 'cursor-pointer appearance-none pr-11')}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-secondary" />
      </div>
      <Help id={helpId} error={error} hint={hint} />
    </div>
  )
}

// Big tappable pills for "pick one" or "pick any" questions.
export function ChoiceGroup({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple,
}: {
  legend: string
  hint?: string
  options: { value: string; label: string; description?: string }[]
  value: string[]
  onChange: (v: string[]) => void
  multiple?: boolean
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-1 type-body-m font-medium">{legend}</legend>
      {hint && <p className="mb-3 type-body-s text-secondary">{hint}</p>}
      <div className={cx('flex flex-wrap gap-2', !hint && 'mt-2')}>
        {options.map((o) => {
          const checked = value.includes(o.value)
          return (
            <label
              key={o.value}
              className={cx(
                'group relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border px-5 py-2.5 transition-colors',
                'has-[:focus-visible]:shadow-[var(--shadow-focus)]',
                checked
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-border-tertiary hover:border-border-secondary hover:bg-background-tertiary',
              )}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                value={o.value}
                checked={checked}
                onChange={() =>
                  onChange(
                    multiple
                      ? checked
                        ? value.filter((v) => v !== o.value)
                        : [...value, o.value]
                      : [o.value],
                  )
                }
                className="sr-only"
              />
              {multiple && (
                <span
                  className={cx(
                    'flex size-5 items-center justify-center rounded-[6px] border',
                    checked ? 'border-white bg-white text-blue-700' : 'border-border-secondary',
                  )}
                >
                  {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
                </span>
              )}
              <span className="type-body-m">
                {o.label}
                {o.description && (
                  <span className={cx('block type-body-s', checked ? 'text-white/75' : 'text-secondary')}>
                    {o.description}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <div className={cx('flex gap-3', className)}>
      <span className="relative mt-0.5 flex size-6 shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer size-6 cursor-pointer appearance-none rounded-8 border border-border-secondary bg-background-primary transition-colors checked:border-blue-700 checked:bg-blue-700 focus-ring hover:border-border-primary"
          {...props}
        />
        <Icon
          name="check"
          size={16}
          strokeWidth={2.5}
          className="pointer-events-none absolute top-1 left-1 text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer type-body-m">
        {label}
        {description && <span className="mt-0.5 block type-body-s text-secondary">{description}</span>}
      </label>
    </div>
  )
}

// "Step 2 of 5" bar for the intake flow.
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div>
      <p className="mb-3 type-body-s text-secondary">
        Step {current + 1} of {steps.length}: <span className="font-medium text-primary">{steps[current]}</span>
      </p>
      <ol className="flex gap-1.5" aria-label="Progress">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? 'step' : undefined}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < current ? 'bg-blue-700' : i === current ? 'bg-blue-600/60' : 'bg-background-secondary',
            )}
          >
            <span className="sr-only">
              {s}
              {i < current ? ' (done)' : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// "Review your answers" list with an edit link on each row.
export function SummaryList({
  rows,
  onEdit,
}: {
  rows: { label: string; value: ReactNode; key: string }[]
  onEdit?: (key: string) => void
}) {
  return (
    <dl className="divide-y divide-border-tertiary border-y border-border-tertiary">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-baseline gap-4 py-4 max-mobile:grid-cols-[1fr_auto]">
          <dt className="type-body-s text-secondary max-mobile:col-span-2">{r.label}</dt>
          <dd className="type-body-m">{r.value}</dd>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(r.key)}
              className="cursor-pointer rounded-4 type-body-s text-link underline underline-offset-[3px] focus-ring"
            >
              Change<span className="sr-only"> {r.label}</span>
            </button>
          )}
        </div>
      ))}
    </dl>
  )
}
