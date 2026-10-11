import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../components/cx'
import { Icon, type IconName } from '../components/icons'
import { Photo } from '../components/Photo'
import { photoById } from '../data/photos'
import { Page } from '../site/chrome'

// Sign in, create account, signed-out and "check your email" share this layout:
// a California photo panel with what an account is for, and the form beside it.
// On phones the photo becomes a short band above the form.

const perks: { icon: IconName; title: string; body: string }[] = [
  { icon: 'document', title: 'Saved answers', body: 'Pick up where you left off, in chat or by text.' },
  { icon: 'lock', title: 'Private documents', body: 'Pay stubs and IDs stay in your own vault.' },
  { icon: 'clock', title: 'Next steps', body: 'See what each application needs from you, and when.' },
]

export function AuthLayout({
  title,
  intro,
  children,
  photo = 'lake-tahoe',
  showPerks = true,
}: {
  title: ReactNode
  intro?: ReactNode
  children: ReactNode
  photo?: string
  showPerks?: boolean
}) {
  return (
    <Page dock={false}>
      <div className="mx-auto grid max-w-[78rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-6 px-6 pt-8 max-[900px]:grid-cols-1 max-mobile:px-3 max-mobile:pt-2">
        <aside className="relative min-h-[36rem] overflow-hidden rounded-[2.25rem] bg-[#c9d6d4] max-[900px]:min-h-[13rem] max-mobile:rounded-[1.75rem]" aria-hidden="true">
          <Photo photo={photoById[photo]} sizes="(max-width: 900px) 100vw, 40vw" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071a20cc] via-[#071a2033] to-transparent" />
          {showPerks && (
            <ul className="absolute inset-x-6 bottom-6 flex flex-col gap-2 max-[900px]:hidden">
              {perks.map((p, i) => (
                <li
                  key={p.title}
                  className="flex animate-[rise_.7s_var(--ease-out-quint)_both] items-start gap-3 rounded-[1.25rem] bg-white/14 p-3.5 text-white ring-1 ring-white/20 backdrop-blur-md"
                  style={{ animationDelay: `${150 + i * 110}ms` }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-blue-700">
                    <Icon name={p.icon} size={17} />
                  </span>
                  <span>
                    <span className="block text-[0.9375rem] font-medium tracking-tight">{p.title}</span>
                    <span className="block text-[0.8125rem] text-white/80">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex flex-col justify-center rounded-[2.25rem] bg-[linear-gradient(180deg,var(--color-fog)_0%,#f6f5f0_60%,var(--color-sand)_130%)] px-14 py-14 max-[1100px]:px-10 max-mobile:rounded-[1.75rem] max-mobile:px-5 max-mobile:py-9">
          <div className="mx-auto w-full max-w-[26rem]">
            <h1 className="font-serif text-[clamp(2.25rem,3.6vw,3.25rem)] leading-[1.04] tracking-[-0.035em] text-balance [font-variation-settings:'opsz'_72]">{title}</h1>
            {intro && <p className="mt-4 type-body-m text-secondary">{intro}</p>}
            <div className="mt-9">{children}</div>
          </div>
        </section>
      </div>
    </Page>
  )
}

const inputClass =
  'h-14 w-full rounded-16 border border-[#0e212933] bg-white px-4 text-base tracking-tight text-primary outline-none transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-tertiary hover:border-[#0e212966] focus:border-blue-700 focus:shadow-[0_0_0_4px_#0b4a5e1f]'

export function AuthField({
  label,
  hint,
  optional,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; optional?: boolean }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between type-body-s font-medium">
        {label}
        {optional && <span className="font-normal text-tertiary">Optional</span>}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="mt-2 type-body-s text-secondary">
          {hint}
        </p>
      )}
    </div>
  )
}

export function PasswordField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-2 block type-body-s font-medium">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} aria-describedby={hint ? `${id}-hint` : undefined} className={cx(inputClass, 'pr-14')} {...props} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-secondary transition-colors hover:bg-background-tertiary hover:text-primary focus-ring"
        >
          <Icon name={shown ? 'eye-off' : 'eye'} size={19} />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-2 type-body-s text-secondary">
          {hint}
        </p>
      )}
    </div>
  )
}

export const authButton =
  'inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-full px-6 text-base font-medium tracking-tight transition-[background-color,scale,box-shadow] duration-200 ease-out-quint active:scale-[.98] focus-ring disabled:cursor-default disabled:opacity-60'
export const authPrimary = `${authButton} bg-blue-700 text-white shadow-[0_10px_24px_-12px_#0b4a5e] hover:bg-blue-800`
export const authQuiet = `${authButton} bg-white text-primary ring-1 ring-[#0e21291f] hover:bg-background-tertiary`
