import type { ReactNode } from 'react'
import { cx } from '../../components/cx'
import { Grid, PageTitle, pillClass, Prose, Reveal, SectionTitle } from '../blocks'
import { Page } from '../chrome'
import type { Tile } from '../copy'
import { useT } from '../lang'
import { ConsentPreview, LanguagesTile, MicTile, Orb, PhotoFill, QualifyTile, SourcesOnPhoto, StepsPhone, ThumbsTile, TileCaption, TypingTile } from '../media'
import { Link } from '../router'

export function TileGrid({ tiles, media, cols = 2 }: { tiles: Tile[]; media: ReactNode[]; cols?: 2 | 3 }) {
  return (
    <Grid cols={cols}>
      {tiles.map((tile, i) => (
        <Reveal key={tile.lead} as="figure" delay={(i % cols) * 90}>
          {media[i]}
          <figcaption>
            <TileCaption lead={tile.lead} body={tile.body} />
          </figcaption>
        </Reveal>
      ))}
    </Grid>
  )
}

export function MoreComing({ className }: { className?: string }) {
  const t = useT()
  return (
    <Reveal as="section" className={cx('mx-auto mt-48 max-w-[44rem] px-6 text-center max-mobile:mt-32', className)}>
      <h2 className="type-page-heading">{t.home.more.title}</h2>
      <p className="mx-auto mt-6 max-w-[30rem] type-body-m text-secondary">{t.home.more.body}</p>
      <Link href="/coming-soon" className={cx(pillClass, 'mt-8')}>
        {t.home.more.cta}
      </Link>
    </Reveal>
  )
}

export function HowItWorks() {
  const t = useT().how
  return (
    <Page>
      <PageTitle lines={t.title} />
      <Prose>
        {t.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Prose>

      <SectionTitle id="sources" className="mt-48 mb-16 max-mobile:mt-32 max-mobile:mb-10">
        {t.trustTitle}
      </SectionTitle>
      <TileGrid tiles={t.trust} media={[<SourcesOnPhoto key="s" />, <PhotoFill key="p" id="joshua-tree" />, <ConsentPreview key="c" />, <Orb key="o" />]} />

      <SectionTitle className="mt-48 mb-16 max-mobile:mt-32 max-mobile:mb-10">{t.doTitle}</SectionTitle>
      <TileGrid tiles={t.do} media={[<QualifyTile key="q" />, <StepsPhone key="s" />, <LanguagesTile key="l" />, <MicTile key="m" />]} />

      <SectionTitle className="mt-48 mb-16 max-mobile:mt-32 max-mobile:mb-10">{t.bestTitle}</SectionTitle>
      <TileGrid tiles={t.best} media={[<TypingTile key="t" text={t.specificExample} />, <ThumbsTile key="f" />]} />

      <MoreComing />
    </Page>
  )
}
