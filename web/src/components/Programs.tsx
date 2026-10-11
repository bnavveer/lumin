import { useState } from 'react'
import { photoById } from '../data/photos'
import { portals, type Portal } from '../data/portals'
import type { Program } from '../data/programs'
import { Button, TextLink } from './Button'
import { cx } from './cx'
import { Icon } from './icons'
import { Photo } from './Photo'

const categoryLabel = { food: 'Food', health: 'Health', cash: 'Cash' } as const

// One program we can apply for: photo, what it is, how much, where we apply.
// "Details" opens who qualifies, what to bring, tips and sources.
export function ProgramCard({ program, onApply }: { program: Program; onApply?: (p: Program) => void }) {
  const [open, setOpen] = useState(false)
  const photo = photoById[program.photo]
  const via = program.applyVia.map((id) => portals[id].name).join(', ')
  return (
    <article className="flex flex-col overflow-hidden rounded-32 bg-background-tertiary">
      <div className="relative aspect-[4/3] overflow-hidden rounded-32">
        {photo && <Photo photo={photo} sizes="(max-width: 768px) 100vw, 33vw" />}
        <span className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1.5 type-label-s font-medium backdrop-blur-[var(--blur-frost)]">
          {categoryLabel[program.category]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6 max-mobile:p-5">
        <h3 className="type-feature-heading">{program.name}</h3>
        <p className="mt-2 type-body-m text-secondary">{program.plain}</p>
        <p className="mt-5 type-body-m font-medium">
          {program.amount.text}
          {program.amount.unconfirmed && <Unconfirmed />}
        </p>
        <p className="mt-1 type-body-s text-secondary">{program.timing.text}</p>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-5 flex cursor-pointer items-center gap-1 self-start rounded-8 type-body-s font-medium focus-ring"
        >
          {open ? 'Hide details' : 'Details'}
          <Icon name="chevron-down" size={16} className={cx('transition-transform duration-300', open && 'rotate-180')} />
        </button>
        <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out-quint', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-5 pt-4 type-body-s">
              <DetailList title="Who qualifies" items={program.whoQualifies.map((f) => ({ text: f.text, unconfirmed: f.unconfirmed }))} />
              <DetailList title="What to bring" items={program.bring.map((text) => ({ text }))} />
              <DetailList title="Good to know" items={program.tips.map((text) => ({ text }))} />
              <DetailList title="Other ways to apply" items={program.otherWays.map((text) => ({ text }))} />
              <div>
                <p className="mb-1.5 font-medium">Sources</p>
                <ul className="flex flex-col gap-1">
                  {program.sources.map((s) => (
                    <li key={s.href}>
                      <TextLink href={s.href} external>
                        {s.title}
                      </TextLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
          <span className="type-label-s text-secondary">Applies through {via}</span>
          <Button size="sm" iconRight="arrow-right" onClick={() => onApply?.(program)}>
            Apply for me
          </Button>
        </div>
      </div>
    </article>
  )
}

function DetailList({ title, items }: { title: string; items: { text: string; unconfirmed?: boolean }[] }) {
  return (
    <div>
      <p className="mb-1.5 font-medium">{title}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-secondary">
        {items.map((i) => (
          <li key={i.text}>
            {i.text}
            {i.unconfirmed && <Unconfirmed />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Unconfirmed() {
  return (
    <span title="Not yet checked on an official page" className="ml-1.5 inline-flex rounded-full bg-amber-50 px-1.5 align-middle text-[0.6875rem] font-medium text-amber-700">
      check
    </span>
  )
}

// A website the agent applies through, and the programs it covers.
export function PortalCard({ portal, programs }: { portal: Portal; programs: Program[] }) {
  return (
    <article className="flex flex-col gap-6 rounded-32 border border-border-tertiary p-8 max-mobile:p-6 md:flex-row md:items-start md:justify-between">
      <div className="max-w-[34rem]">
        <p className="type-label-s text-secondary">Where we apply</p>
        <h3 className="mt-2 type-section-heading !text-[2.5rem]">{portal.name}</h3>
        <p className="mt-3 type-body-m text-secondary">{portal.summary}</p>
        <p className="mt-2 type-body-s text-tertiary">Run by {portal.runBy}.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {programs.map((p) => (
            <span key={p.id} className="rounded-full bg-background-tertiary px-3 py-1.5 type-label-s font-medium">
              {p.name}
            </span>
          ))}
        </div>
        {portal.notes && (
          <ul className="mt-5 flex flex-col gap-1.5 type-body-s text-secondary">
            {portal.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-tertiary" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-3 md:items-end">
        <a
          href={portal.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 type-label-m text-white transition-colors hover:bg-blue-800 focus-ring"
        >
          {portal.url.replace('https://', '')}
          <Icon name="external" size={16} />
        </a>
        {portal.phone && (
          <a href={`tel:${portal.phone.number}`} className="flex items-center gap-2 rounded-8 type-body-m focus-ring">
            <Icon name="phone" size={18} />
            <span>
              {portal.phone.number}
              <span className="block type-label-s text-tertiary">{portal.phone.label}</span>
            </span>
          </a>
        )}
      </div>
    </article>
  )
}
