// A static, screenshot-style mock of the staff dashboard and an SMS thread.
// Decorative: hidden from assistive tech, the copy beside it carries the meaning.
export function ProductMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[40rem] pb-10 pr-10 max-mobile:pr-0 max-mobile:pb-0">
      <div className="overflow-hidden rounded-24 border border-border-tertiary bg-white shadow-elevation-1">
        <div className="flex items-center gap-1.5 border-b border-border-quaternary bg-grey-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-grey-200" /><span className="size-2.5 rounded-full bg-grey-200" /><span className="size-2.5 rounded-full bg-grey-200" />
          <span className="ml-3 type-label-s text-tertiary">Aid · Staff dashboard</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {[['Active cases', '48'], ['Autopilot actions', '12'], ['Submitted', '91%']].map(([l, v]) => (
              <div key={l} className="rounded-16 bg-background-tertiary p-3">
                <p className="type-label-s text-secondary">{l}</p>
                <p className="font-serif text-[1.75rem] leading-none tracking-[-0.03em]">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-16 bg-accent-soft p-3">
            <p className="type-label-s font-medium text-accent">Median hours to submit</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="h-2 rounded-full bg-blue-700/30" />
              <div className="h-2 w-[6%] rounded-full bg-accent" />
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {[
              ['Interview reminder', 'Maria R. · Thursday 10:30', 'border-l-amber-700 bg-amber-50'],
              ['Ready to submit', 'Dev P. · CalFresh, Medi-Cal', 'border-l-green-600 bg-green-50'],
              ['Document reminder', 'Lan T. · needs a pay stub', 'border-l-blue-500 bg-blue-50'],
            ].map(([k, d, c]) => (
              <li key={k} className={`rounded-12 border-l-4 px-3 py-2 ${c}`}>
                <p className="type-label-s font-medium">{k}</p>
                <p className="type-label-s text-secondary">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-[16rem] rounded-32 border border-border-tertiary bg-white p-4 shadow-elevation-1 max-mobile:relative max-mobile:mt-4 max-mobile:w-full">
        <p className="type-label-s text-tertiary">SMS · Maria R.</p>
        <div className="mt-2 flex flex-col gap-2 type-body-s">
          <p className="max-w-[85%] self-start rounded-16 bg-background-tertiary px-3 py-2">You likely qualify for CalFresh and Medi-Cal. Can you send a photo of a pay stub?</p>
          <p className="max-w-[85%] self-end rounded-16 bg-accent px-3 py-2 text-on-accent">Sent it.</p>
          <p className="max-w-[85%] self-start rounded-16 bg-background-tertiary px-3 py-2">Got it. I’m filing your application now.</p>
        </div>
      </div>
    </div>
  )
}
