import { brand } from '../brand/brand'
import { Button } from '../components/Button'
import { Accordion } from '../components/Marketing'
import { navigate } from '../lib/router'
import { PublicShell } from '../screens/Shell'
import { Audiences, Band, faqs, Features, HowItWorks, Outcomes, Pricing, Security, WhyNow } from '../screens/landing/Sections'
import { ProductMock } from '../screens/landing/ProductMock'

export function Landing() {
  return (
    <PublicShell>
      <main id="main" tabIndex={-1}>
        <section className="mx-auto grid max-w-site items-center gap-12 px-6 pt-16 pb-20 max-mobile:px-4 max-mobile:pt-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="type-site-hero">{brand.heroTitle}</h1>
            <p className="mt-5 max-w-[36rem] type-home-supporting text-secondary">{brand.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" iconRight="arrow-right" onClick={() => navigate('/setup')}>Start a pilot</Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/staff')}>See it live</Button>
            </div>
            <p className="mt-5 type-body-s text-secondary">
              Curious how it screens people?{' '}
              <a href="#/screen" className="rounded-4 text-link underline underline-offset-[3px] focus-ring">Try the eligibility check</a>.
            </p>
          </div>
          <ProductMock />
        </section>

        <HowItWorks />
        <Outcomes />
        <WhyNow />
        <Features />
        <Audiences />
        <Pricing />
        <Security />
        <Band id="faq" title="Questions, answered" tint>
          <Accordion items={faqs} />
        </Band>
      </main>
    </PublicShell>
  )
}
