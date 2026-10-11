import { Icon } from '../../components/icons'
import { PageTitle, Reveal } from '../blocks'
import { Page } from '../chrome'
import { useT } from '../lang'
import { ConsentPreview, FieldsTile, GlowLock, PreferNotTile, TextThread, ThumbsTile } from '../media'
import { Link } from '../router'
import { TileGrid } from './HowItWorks'

export function Privacy() {
  const t = useT().privacy
  return (
    <Page>
      <PageTitle lines={[t.title]} className="mb-36 max-mobile:mb-16" />
      <TileGrid
        cols={3}
        tiles={t.tiles}
        media={[
          <FieldsTile key="f" />,
          <TextThread key="t" />,
          <GlowLock key="g" />,
          <PreferNotTile key="p" />,
          <ConsentPreview key="c" />,
          <ThumbsTile key="th" light />,
        ]}
      />
      <Reveal as="section" className="mx-auto mt-40 max-w-[35rem] px-6 max-mobile:mt-28">
        <h2 className="type-feature-heading">{t.keepTitle}</h2>
        <ul className="mt-8 flex flex-col divide-y divide-border-tertiary">
          {t.keep.map((k) => (
            <li key={k} className="flex gap-4 py-5 type-body-m text-secondary">
              <Icon name="check-circle" size={20} className="mt-0.5 shrink-0 text-primary" />
              {k}
            </li>
          ))}
        </ul>
        <Link href="/privacy-policy" className="group mt-6 inline-flex items-center gap-1.5 rounded-4 type-body-s font-medium focus-ring">
          {t.keepLink}
          <Icon name="arrow-right" size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </Reveal>
    </Page>
  )
}
