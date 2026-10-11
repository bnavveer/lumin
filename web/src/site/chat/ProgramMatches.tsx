import type { ApplicationMatch, ApplicationScreening } from '../../../../shared/chat'

export function ProgramMatches({ screening, linked, disabled, lang, onAsk }: {
  screening: ApplicationScreening; linked: boolean; disabled: boolean; lang: 'en' | 'es'; onAsk: (text: string) => void
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
    <details className="mt-8 rounded-24 border border-border-tertiary bg-background-primary p-5 sm:p-6" open={likely > 0}>
      <summary className="cursor-pointer rounded-4 focus-ring">
        <span className="type-heading-s">{es ? 'Programas para explorar' : 'Programs to explore'}</span>
        <span className="mt-1 block type-body-s text-secondary" role="status">
          {likely ? (es ? `${likely} posibles opciones según tus respuestas` : `${likely} likely ${likely === 1 ? 'match' : 'matches'} based on your answers`) : (es ? 'Ve qué información falta' : 'See what information is still needed')}
        </span>
      </summary>
      <p className="mt-4 type-body-s text-secondary">{es ? 'Son sugerencias, no decisiones de aprobación. No hemos enviado ninguna solicitud.' : 'These are suggestions, not approval decisions. No application has been sent.'}</p>
      {linked && <p className="mt-2 type-label-s text-secondary">{es ? 'Las respuestas del chat, los mensajes y las llamadas se actualizan aquí.' : 'Answers from this chat, texts and calls update here.'}</p>}
      {groups.map(group => (
        <section key={group.title} className="mt-6">
          <h2 className="type-label-m font-medium text-secondary">{group.title}</h2>
          <ul className="mt-2 divide-y divide-border-tertiary">
            {group.matches.map(match => <Match key={match.program} match={match} es={es} disabled={disabled} onAsk={onAsk} />)}
          </ul>
        </section>
      ))}
    </details>
  )
}

function Match({ match: m, es, disabled, onAsk }: { match: ApplicationMatch; es: boolean; disabled: boolean; onAsk: (s: string) => void }) {
  return (
    <li>
      <details className="py-3">
        <summary className="cursor-pointer rounded-4 type-body-m font-medium focus-ring">{m.name}</summary>
        <div className="mt-3 space-y-3 pl-4 type-body-s text-secondary">
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
