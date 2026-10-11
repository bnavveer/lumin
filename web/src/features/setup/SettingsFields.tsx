import { Checkbox, TextField } from '../../components/Form'
import { cx } from '../../components/cx'
import { NUDGE_OPTIONS, PROGRAM_OPTIONS, type OrgSettings, type Program } from './types'

interface Props {
  value: OrgSettings
  onChange: (next: OrgSettings) => void
  disabled?: boolean
}

export function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-24 border border-border-tertiary bg-background-primary p-5 shadow-soft-sm sm:p-7">
      <h2 className="type-card-title">{title}</h2>
      {intro && <p className="mt-1 mb-5 type-body-s text-secondary">{intro}</p>}
      {!intro && <div className="h-4" />}
      {children}
    </section>
  )
}

export function AutopilotFields({ value, onChange, disabled }: Props) {
  const { autopilot } = value
  const setAutopilot = (patch: Partial<OrgSettings['autopilot']>) => onChange({ ...value, autopilot: { ...autopilot, ...patch } })
  return (
    <div className="space-y-6">
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-16 bg-background-tertiary px-4 py-3">
        <span>
          <span className="block type-body-m font-medium">Autopilot is {autopilot.enabled ? 'on' : 'paused'}</span>
          <span className="block type-body-s text-secondary">Aid follows up with patients on its own. Pause to review every message first.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={autopilot.enabled}
          disabled={disabled}
          onChange={(e) => setAutopilot({ enabled: e.target.checked })}
          className="size-6 shrink-0 accent-blue-700 focus-ring"
        />
      </label>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="mb-3 type-body-m font-medium">What Aid does automatically</legend>
        {NUDGE_OPTIONS.map((n) => (
          <Checkbox
            key={n.key}
            label={n.label}
            description={n.description}
            checked={autopilot.nudges[n.key]}
            onChange={(e) => setAutopilot({ nudges: { ...autopilot.nudges, [n.key]: e.target.checked } })}
          />
        ))}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-1 type-body-m font-medium">Quiet hours</legend>
        <p className="mb-3 type-body-s text-secondary">Aid will not text or call during this window (patient local time).</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="From" type="time" value={autopilot.quietHours.start} onChange={(e) => setAutopilot({ quietHours: { ...autopilot.quietHours, start: e.target.value } })} />
          <TextField label="Until" type="time" value={autopilot.quietHours.end} onChange={(e) => setAutopilot({ quietHours: { ...autopilot.quietHours, end: e.target.value } })} />
        </div>
      </fieldset>

      <TextField
        label="Hand off to a person after"
        type="number"
        min={1}
        max={10}
        inputMode="numeric"
        disabled={disabled}
        value={String(value.escalateAfterNoAnswers)}
        hint="Unanswered calls before the case lands in a caseworker’s queue."
        onChange={(e) => onChange({ ...value, escalateAfterNoAnswers: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
      />
    </div>
  )
}

export function ProgramFields({ value, onChange, disabled }: Props) {
  const toggle = (p: Program, on: boolean) => {
    const next = on ? [...value.programs, p] : value.programs.filter((x) => x !== p)
    onChange({ ...value, programs: next })
  }
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">Programs to screen for</legend>
      {PROGRAM_OPTIONS.map((p) => (
        <Checkbox key={p.value} label={p.label} description={p.description} checked={value.programs.includes(p.value)} onChange={(e) => toggle(p.value, e.target.checked)} />
      ))}
      {value.programs.length === 0 && <p className="text-red-600 type-body-s sm:col-span-2" role="alert">Pick at least one program.</p>}
    </fieldset>
  )
}

export function ErrorNote({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null
  return (
    <p role="alert" className={cx('rounded-12 bg-red-600/10 px-4 py-3 type-body-s text-red-600', className)}>
      {message}
    </p>
  )
}
