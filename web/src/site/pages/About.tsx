import { CaliforniaFlag } from '../../components/Flags'
import { Icon } from '../../components/icons'
import { Photo } from '../../components/Photo'
import { photoById } from '../../data/photos'
import { portals } from '../../data/portals'
import { programs } from '../../data/programs'
import { Prose, Reveal, SectionTitle } from '../blocks'
import { Page } from '../chrome'
import { useLang } from '../lang'
import { categoryName } from '../media'

export function About() {
  const { t } = useLang()
  const [first, every, last] = t.about.title
  return (
    <Page>
      <h1 className="mx-auto max-w-site px-6 pt-28 text-center type-page-heading max-mobile:px-4 max-mobile:pt-16" style={{ fontSize: 'clamp(3.25rem, 10.4vw, 9.5rem)' }}>
        <span className="block">{first}</span>
        <span className="block">
          {every}{' '}
          <CaliforniaFlag width={300} className="!h-[0.62em] !w-[0.93em] align-baseline shadow-[0_0_0_1px_var(--color-border-tertiary)]" />{' '}
          {last}
        </span>
      </h1>
      <Prose className="mt-24">
        {t.about.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Prose>

      <SectionTitle className="mt-48 mb-16 max-mobile:mt-32 max-mobile:mb-10">{t.about.programsTitle}</SectionTitle>
      <div className="mx-auto grid max-w-site grid-cols-5 gap-3 px-12 max-[1180px]:grid-cols-3 max-[760px]:grid-cols-2 max-mobile:px-4 max-[480px]:grid-cols-1">
        {programs.map((p, i) => {
          const portal = portals[p.applyVia[0]]
          return (
            <Reveal key={p.id} delay={i * 70}>
              <a
                href={p.sources[0]?.href ?? portal.url}
                target="_blank"
                rel="noreferrer"
                className="group flex h-full min-h-72 flex-col rounded-32 bg-background-tertiary p-5 transition-colors hover:bg-background-secondary focus-ring"
              >
                <span className="block size-12 overflow-hidden rounded-12">
                  <Photo photo={photoById[p.photo]} sizes="48px" />
                </span>
                <span className="mt-6 type-body-s text-secondary">{categoryName[t.lang === 'es' ? 'es' : 'en'][p.category]}</span>
                <span className="mt-0.5 type-card-title">{p.name}</span>
                <span className="mt-1.5 type-body-s text-secondary">{t.programPlain[p.id] ?? p.plain}</span>
                <span className="mt-auto flex items-center gap-1 pt-6 type-label-s font-medium">
                  {t.about.learnMore}
                  <Icon name="external" size={13} />
                </span>
              </a>
            </Reveal>
          )
        })}
      </div>
    </Page>
  )
}
