import type { ApplicationMatch, ApplicationScreening } from '../../../../shared/chat'
import { Icon } from '../../components/icons'
import { Link } from '../router'

export function ProgramMatches({ screening, linked, disabled, lang, onAsk, accountHref }: {
  accountHref: string; screening: ApplicationScreening; linked: boolean; disabled: boolean; lang: 'en' | 'es'; onAsk: (text: string) => void
}) {
  const es = lang === 'es'
  const likely = screening.matches.filter(m => m.status === 'likely').length
  const groups = [
    { title: es ? 'Posibles opciones' : 'Likely matches', matches: screening.matches.filter(m => m.status === 'likely') },
    { title: es ? 'Necesitamos más información' : 'Needs more information', matches: screening.matches.filter(m => m.status === 'needs_info' && m.coverage !== 'referral') },
    { title: es ? 'Otros servicios para explorar' : 'Other services to explore', matches: screening.matches.filter(m => m.coverage === 'referral') },
    { title: es ? 'No coincide con estas reglas' : 'Doesn’t match these rules', matches: screening.matches.filter(m => m.status === 'not_eligible') },
  ].filter(g => g.matches.length)
  return (
    <section aria-label={es ? 'Tus opciones' : 'Your options'} className="mt-10 overflow-hidden rounded-24 bg-[#EFF3F8]">
      <details className="group/options" open={likely > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-24 p-6 focus-ring sm:p-7 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-serif text-[1.875rem] leading-tight tracking-tight">{es ? 'Programas para explorar' : 'Programs to explore'}</span>
            <span className="mt-2 block type-body-s text-secondary" role="status">
              {likely ? (es ? `${likely} posibles opciones según tus respuestas` : `${likely} likely ${likely === 1 ? 'match' : 'matches'} based on your answers`) : (es ? 'Revisa las opciones y qué información falta.' : 'Explore your options and what’s still needed.')}
            </span>
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-primary group-open/options:rotate-180"><Icon name="chevron-down" size={18} /></span>
        </summary>
        <div className="px-6 pb-6 sm:px-7">
          <p className="max-w-[34rem] type-body-s text-secondary">{es ? 'Son sugerencias, no decisiones de aprobación. No hemos enviado ninguna solicitud.' : 'These are suggestions, not approval decisions. No application has been sent.'}</p>
          {linked && <p className="mt-2 type-label-s text-secondary">{es ? 'Las respuestas del chat, los mensajes y las llamadas se actualizan aquí.' : 'Answers from this chat, texts and calls update here.'}</p>}
          {groups.map(group => (
            <section key={group.title} className="mt-6">
              <h2 className="type-label-s font-medium text-secondary">{group.title}</h2>
              <ul className="mt-2 divide-y divide-[#D6DFEA] border-y border-[#D6DFEA]">
                {group.matches.map(match => <Match key={match.program} match={match} es={es} disabled={disabled} onAsk={onAsk} />)}
              </ul>
            </section>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-[#D6DFEA] px-6 py-5 sm:px-7">
        <div className="min-w-0 flex-1 basis-[15rem]">
          <h2 className="type-body-s font-medium">{es ? 'Continúa con tus opciones' : 'Keep your next steps together'}</h2>
          <p className="mt-1 max-w-[24rem] type-body-s text-secondary">{es ? 'Guarda tus respuestas y prepara una solicitud en tu cuenta.' : 'Save your answers and prepare an application in your account.'}</p>
        </div>
        <Link href={accountHref} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-700 px-5 py-3 type-label-m text-white hover:bg-blue-800 focus-ring max-mobile:w-full">
          {es ? 'Guardar mis opciones' : 'Save my options'}
        </Link>
      </div>
    </section>
  )
}

function Match({ match: m, es, disabled, onAsk }: { match: ApplicationMatch; es: boolean; disabled: boolean; onAsk: (s: string) => void }) {
  return (
    <li>
      <details className="group/match py-1">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-4 py-3 type-body-m font-medium focus-ring [&::-webkit-details-marker]:hidden"><span>{m.name}</span><span className="text-secondary group-open/match:rotate-180"><Icon name="chevron-down" size={16} /></span></summary>
        <div className="space-y-3 pb-4 type-body-s text-secondary">
          {es && <p>Los detalles de las reglas están en inglés. Puedes pedir una explicación en español.</p>}
          <p>{m.reason}</p>
          <p>{m.nextStep}</p>
          {m.followUpQuestions.length > 0 && <p><span className="font-medium text-primary">{es ? 'Para continuar: ' : 'To continue: '}</span>{m.followUpQuestions[0]}</p>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
            <button type="button" disabled={disabled} className="cursor-pointer rounded-4 font-medium text-link underline underline-offset-4 focus-ring disabled:cursor-wait disabled:opacity-50"
              onClick={() => onAsk(es ? `Ayúdame a revisar ${m.name}. Explica mis opciones en español y hazme la siguiente pregunta necesaria.` : `Help me check ${m.name}. Use my saved answers and ask me the next question needed.`)}>
              {es ? 'Ayúdame a revisar' : 'Help me check'}
            </button>
            <a href={m.applicationUrl} target="_blank" rel="noreferrer" className="rounded-4 text-link underline underline-offset-4 focus-ring">{es ? 'Ver el sitio oficial' : 'Visit official application site'}</a>
          </div>
        </div>
      </details>
    </li>
  )
}
