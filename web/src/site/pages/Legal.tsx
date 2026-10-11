import { PageTitle } from '../blocks'
import { Page } from '../chrome'
import { useT } from '../lang'
import { Link } from '../router'

export function Legal({ which }: { which: 'privacy' | 'terms' }) {
  const t = useT().legal
  const sections = which === 'privacy' ? t.privacy : t.terms
  return (
    <Page>
      <PageTitle lines={[which === 'privacy' ? t.privacyTitle : t.termsTitle]} />
      <p className="mt-6 text-center type-body-s text-tertiary">{t.draft}</p>
      <div className="mx-auto mt-20 flex max-w-[35rem] flex-col gap-10 px-6">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="type-heading-s">{s.h}</h2>
            <p className="mt-3 type-body-m text-secondary">{s.p}</p>
          </section>
        ))}
      </div>
    </Page>
  )
}

export function NotFound() {
  const t = useT().notFound
  return (
    <Page>
      <PageTitle lines={[t.title]} />
      <p className="mt-6 text-center type-page-intro text-secondary">{t.body}</p>
      <p className="mt-10 text-center">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-blue-700 px-5 type-label-m text-white hover:bg-blue-800 focus-ring">
          {t.home}
        </Link>
      </p>
    </Page>
  )
}
