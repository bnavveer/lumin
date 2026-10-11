import { Accordion } from '../../components/Marketing'
import { PageTitle } from '../blocks'
import { Page, useStartChat } from '../chrome'
import { useT } from '../lang'

export function Faq() {
  const t = useT().faq
  const start = useStartChat()
  return (
    <Page>
      <PageTitle lines={t.title} className="mb-20 max-mobile:mb-12" />
      <div className="px-6 max-mobile:px-5">
        <Accordion items={t.items} askAnything={start} askLabel={t.askElse} />
      </div>
    </Page>
  )
}
