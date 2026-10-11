import type { ApplicationReadiness } from '../../../shared/applicationDetails'
import { brand } from '../brand/brand'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { Link } from '../site/router'
import { authPrimary, authQuiet } from './AuthLayout'
import { Skeleton } from './ui'

// "Application details": how much of what a CalFresh / Medi-Cal / CalWORKs
// application needs is already answered, what's left, and two ways to finish:
// answer in the chat, or fill it in yourself.

export function ReadinessCard({ readiness, loading, onAskChat }: { readiness: ApplicationReadiness | null; loading: boolean; onAskChat: () => void }) {
  if (loading && !readiness) return <Skeleton className="h-52" />
  if (!readiness) return null
  const pct = Math.round(readiness.progress * 100)
  const done = readiness.complete
  const next = readiness.missing.slice(0, 4)
  return (
    <section
      aria-labelledby="readiness-title"
      className="overflow-hidden rounded-[2rem] bg-[linear-gradient(160deg,var(--color-fog)_0%,#f6f5f0_55%,var(--color-sand)_120%)] p-7 max-mobile:p-5"
    >
      <div className="flex items-start gap-5 max-mobile:gap-4">
        <Ring pct={pct} done={done} />
        <div className="min-w-0 flex-1">
          <h2 id="readiness-title" className="type-heading-s">
            {done ? 'Your application details are complete' : 'Finish your application details'}
          </h2>
          <p className="mt-1 type-body-s text-secondary">
            {done
              ? `${brand.name} has everything it needs to fill out your application. You still review and sign before it’s sent.`
              : `${brand.name} needs these to fill out your application completely. ${readiness.missing.length} left.`}
          </p>
        </div>
      </div>

      {!done && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {next.map((m) => (
            <li key={m.field} className="rounded-full bg-white/80 px-3 py-1.5 type-body-s ring-1 ring-[#0e21291a]">
              {m.label}
            </li>
          ))}
          {readiness.missing.length > next.length && (
            <li className="rounded-full px-2 py-1.5 type-body-s text-secondary">+{readiness.missing.length - next.length} more</li>
          )}
        </ul>
      )}

      <div className="mt-6 flex gap-3 max-mobile:flex-col">
        {!done && (
          <button type="button" onClick={onAskChat} className={cx(authPrimary, 'h-12 flex-1 text-[0.9375rem] max-mobile:flex-none')}>
            <Icon name="message" size={17} className="mr-2" />
            Answer in the chat
          </button>
        )}
        <Link href="/account/details" className={cx(authQuiet, 'h-12 flex-1 text-[0.9375rem] max-mobile:flex-none')}>
          {done ? 'Review your details' : 'Fill them in myself'}
        </Link>
      </div>
    </section>
  )
}

function Ring({ pct, done }: { pct: number; done: boolean }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex size-16 shrink-0 items-center justify-center" role="img" aria-label={`${pct}% complete`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#0e21291a" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={done ? 'var(--color-green-600)' : 'var(--color-blue-700)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out-quint"
        />
      </svg>
      {done ? <Icon name="check" size={22} strokeWidth={2.5} className="text-green-600" /> : <span className="type-label-m tabular-nums">{pct}%</span>}
    </span>
  )
}
