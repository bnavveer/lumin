import { cx } from '../../components/cx'
import { Icon } from '../../components/icons'
import { PageTitle, pillClass, Reveal } from '../blocks'
import { Page } from '../chrome'
import { useOpenFeedback } from '../feedback'
import { useAutoStep, useInView, usePlaying } from '../hooks'
import { useLang } from '../lang'

// america.gov/coming-soon: each future service is a looping walkthrough in a
// soft gradient card. Ours walk through what the agent will do next. The
// people and numbers in them are examples.

type Step =
  | { kind: 'share'; title: string; manual: string; sources: string[]; checking: string; done: string; cta: string }
  | { kind: 'confirm'; title: string; rows: [string, string][]; no: string; yes: string }
  | { kind: 'choice'; title: string; options: string[]; pick: number; cta: string }
  | { kind: 'consent'; title: string; body: string; yes: string }
  | { kind: 'done'; title: string; body: string; rows: [string, string][] }
  | { kind: 'track'; title: string; steps: [string, string, 'done' | 'current' | 'todo'][] }
  | { kind: 'text'; from: string; body: string; reply: string }

type Flow = { steps: Step[]; wash: string }

function flows(lang: 'en' | 'es'): Flow[] {
  const es = lang === 'es'
  return [
    {
      wash: 'bg-[radial-gradient(60%_70%_at_75%_20%,#c9c3ff_0%,transparent_60%),radial-gradient(60%_60%_at_15%_85%,#ffe1b8_0%,transparent_60%),linear-gradient(160deg,#f3f4f8,#eceef3)]',
      steps: [
        {
          kind: 'share',
          title: es ? 'Comparte tu información' : 'Share your information',
          manual: es ? 'O escríbela tú' : 'Or enter it yourself',
          sources: es ? ['Tu caso de CalFresh', 'Tu caso de Medi-Cal'] : ['Your CalFresh case', 'Your Medi-Cal case'],
          checking: es ? 'Revisando' : 'Checking',
          done: es ? 'Encontrado' : 'Found',
          cta: es ? 'Continuar' : 'Continue',
        },
        {
          kind: 'confirm',
          title: es ? '¿Esta información es correcta?' : 'Is this information correct?',
          rows: es
            ? [['Nombre', 'Maria Lopez'], ['Dirección', '1420 W 7th St, Los Ángeles'], ['Personas en el hogar', '3'], ['Recibe CalFresh', 'Sí']]
            : [['Name', 'Maria Lopez'], ['Address', '1420 W 7th St, Los Angeles'], ['People at home', '3'], ['Gets CalFresh', 'Yes']],
          no: es ? 'No, algo está mal' : 'No, something’s wrong',
          yes: es ? 'Sí, continuar' : 'Yes, continue',
        },
        {
          kind: 'consent',
          title: es ? '¿Enviar tu inscripción a CARE a PG&E?' : 'Send your CARE enrollment to PG&E?',
          body: es ? 'Calificas porque alguien en tu casa recibe CalFresh.' : 'You qualify because someone at home gets CalFresh.',
          yes: es ? 'Sí, envíala' : 'Yes, send it',
        },
        {
          kind: 'done',
          title: es ? 'Tu inscripción está en proceso' : 'Your enrollment is processing',
          body: es ? 'PG&E está revisando tu solicitud de CARE.' : 'PG&E is reviewing your CARE application.',
          rows: es ? [['Programa', 'CARE'], ['Compañía', 'PG&E'], ['Estado', 'En revisión']] : [['Program', 'CARE'], ['Utility', 'PG&E'], ['Status', 'In review']],
        },
      ],
    },
    {
      wash: 'bg-[radial-gradient(70%_60%_at_20%_95%,#b9c6f5_0%,transparent_60%),linear-gradient(170deg,#f6f5f1,#ecebe6)]',
      steps: [
        {
          kind: 'choice',
          title: es ? '¿Con qué compañía tienes tu teléfono?' : 'Which phone company do you use?',
          options: es ? ['Compañía A', 'Compañía B', 'Compañía C', 'Ayúdame a elegir'] : ['Carrier A', 'Carrier B', 'Carrier C', 'Help me choose'],
          pick: 1,
          cta: es ? 'Continuar' : 'Continue',
        },
        {
          kind: 'confirm',
          title: es ? '¿Esta información es correcta?' : 'Is this information correct?',
          rows: es
            ? [['Nombre', 'James Carter'], ['Fecha de nacimiento', '3 de abril de 1974'], ['Teléfono', '(323) 555-0143'], ['Califica por', 'Medi-Cal']]
            : [['Name', 'James Carter'], ['Date of birth', 'April 3, 1974'], ['Phone', '(323) 555-0143'], ['Qualifies through', 'Medi-Cal']],
          no: es ? 'No, algo está mal' : 'No, something’s wrong',
          yes: es ? 'Sí, continuar' : 'Yes, continue',
        },
        {
          kind: 'text',
          from: 'California LifeLine',
          body: es ? 'Tu solicitud llegó. Termina tu registro respondiendo a este mensaje.' : 'We got your application. Finish signing up by replying to this message.',
          reply: es ? 'Listo' : 'Done',
        },
        {
          kind: 'done',
          title: es ? 'Solicitud enviada' : 'Application sent',
          body: es ? 'El administrador de LifeLine revisará tu solicitud.' : 'The LifeLine administrator will review your application.',
          rows: es ? [['Programa', 'California LifeLine'], ['Estado', 'Pendiente']] : [['Program', 'California LifeLine'], ['Status', 'Pending']],
        },
      ],
    },
    {
      wash: 'bg-[radial-gradient(60%_70%_at_20%_15%,#9fb3ff_0%,transparent_60%),radial-gradient(60%_60%_at_90%_90%,#c7d3cf_0%,transparent_65%),linear-gradient(160deg,#e9edf3,#dfe4ea)]',
      steps: [
        {
          kind: 'choice',
          title: es ? '¿Alguien está embarazada o tiene menos de 5 años?' : 'Is anyone pregnant or under 5?',
          options: es ? ['Sí, estoy embarazada', 'Sí, un niño menor de 5', 'No'] : ['Yes, I’m pregnant', 'Yes, a child under 5', 'No'],
          pick: 0,
          cta: es ? 'Continuar' : 'Continue',
        },
        {
          kind: 'choice',
          title: es ? 'Elige una oficina de WIC' : 'Choose a WIC office',
          options: es ? ['Oficina de WIC · Centro', 'Oficina de WIC · Este', 'Oficina de WIC · Sur'] : ['WIC office · Downtown', 'WIC office · Eastside', 'WIC office · South'],
          pick: 1,
          cta: es ? 'Elegir hora' : 'Pick a time',
        },
        {
          kind: 'done',
          title: es ? 'Tu cita está lista' : 'Your appointment is booked',
          body: es ? 'Lleva tu identificación y un comprobante de ingresos.' : 'Bring your ID and proof of income.',
          rows: es ? [['Cuándo', 'Martes, 10:30 am'], ['Dónde', 'Oficina de WIC · Este']] : [['When', 'Tuesday, 10:30 am'], ['Where', 'WIC office · Eastside']],
        },
      ],
    },
    {
      wash: 'bg-[radial-gradient(70%_70%_at_10%_10%,#a8b8f8_0%,transparent_55%),linear-gradient(150deg,#e3e7ee,#d5dbe3)]',
      steps: [
        {
          kind: 'track',
          title: es ? 'Solicitud de CalFresh' : 'CalFresh application',
          steps: es
            ? [['Enviada', '2 de oct.', 'done'], ['Entrevista', '21 de oct., 10 am', 'current'], ['Decisión', 'Antes del 1 de nov.', 'todo']]
            : [['Submitted', 'Oct 2', 'done'], ['Interview', 'Oct 21, 10 am', 'current'], ['Decision', 'By Nov 1', 'todo']],
        },
        {
          kind: 'text',
          from: 'Lumin',
          body: es ? 'Tu entrevista de CalFresh es mañana a las 10 am. El condado te va a llamar. Responde 1 para cambiarla.' : 'Your CalFresh interview is tomorrow at 10 am. The county will call you. Reply 1 to reschedule.',
          reply: 'OK',
        },
        {
          kind: 'track',
          title: es ? 'Solicitud de CalFresh' : 'CalFresh application',
          steps: es
            ? [['Enviada', '2 de oct.', 'done'], ['Entrevista', 'Lista', 'done'], ['Decisión', 'Antes del 1 de nov.', 'current']]
            : [['Submitted', 'Oct 2', 'done'], ['Interview', 'Done', 'done'], ['Decision', 'By Nov 1', 'current']],
        },
      ],
    },
  ]
}

export function ComingSoon() {
  const { t, lang } = useLang()
  const openFeedback = useOpenFeedback()
  const fl = flows(lang)
  return (
    <Page>
      <PageTitle lines={[t.soon.title]} />
      <p className="mx-auto mt-8 max-w-[34rem] px-6 text-center type-page-intro text-secondary">{t.soon.intro}</p>
      <div className="mx-auto mt-28 flex max-w-[40rem] flex-col gap-28 px-6 max-mobile:mt-16 max-mobile:gap-20 max-mobile:px-4">
        {t.soon.flows.map((f, i) => (
          <Reveal key={f.title} as="figure">
            <FlowDemo flow={fl[i]} tag={f.tag} pauseLabel={t.soon.pause} playLabel={t.soon.play} />
            <figcaption className="mt-5 px-5 max-mobile:px-2">
              <p className="type-body-m font-medium">{f.title}</p>
              <p className="type-body-m text-secondary">{f.body}</p>
            </figcaption>
          </Reveal>
        ))}
      </div>
      <Reveal as="section" className="mt-48 text-center max-mobile:mt-32">
        <h2 className="type-page-heading">
          {t.soon.moreTitle.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </h2>
        <button type="button" onClick={openFeedback} className={cx(pillClass, 'mt-10')}>
          {t.soon.moreCta}
        </button>
      </Reveal>
    </Page>
  )
}

function FlowDemo({ flow, tag, pauseLabel, playLabel }: { flow: Flow; tag: string; pauseLabel: string; playLabel: string }) {
  const [playing, setPlaying] = usePlaying()
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, margin: '0px' })
  const [i] = useAutoStep(flow.steps.length, 3200, playing, visible)
  const step = flow.steps[i]
  return (
    <div ref={ref} className={cx('relative aspect-[3/2] overflow-hidden rounded-48 max-mobile:aspect-[4/5] max-mobile:rounded-32', flow.wash)}>
      <span className="absolute top-4 left-4 z-10 rounded-full bg-white px-3.5 py-1.5 type-body-s font-medium shadow-soft-sm">{tag}</span>
      <div className="absolute inset-0 flex items-center justify-center p-6 pt-16">
        <div key={i} aria-hidden="true" className="w-full max-w-[18.5rem] animate-[step-in_.55s_var(--ease-out-quint)] rounded-[1.6rem] bg-white p-4 text-[0.75rem] shadow-[0_24px_60px_#010e2426]">
          <StepCard step={step} />
          <div className="mt-4 flex items-center justify-between">
            <span className={cx('flex size-7 items-center justify-center rounded-full bg-background-tertiary', i === 0 && 'opacity-0')}>
              <Icon name="chevron-left" size={14} />
            </span>
            <span className="flex gap-1">
              {flow.steps.map((_, k) => (
                <span key={k} className={cx('h-1 rounded-full transition-all duration-300', k === i ? 'w-4 bg-blue-700' : 'w-1 bg-background-secondary')} />
              ))}
            </span>
            <span className="size-7" />
          </div>
        </div>
      </div>
      <div className="absolute right-4 bottom-4 flex gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? pauseLabel : playLabel}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/70 text-primary backdrop-blur transition-colors hover:bg-white focus-ring"
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
      </div>
    </div>
  )
}

function Primary({ children }: { children: string }) {
  return <span className="mt-4 flex h-9 items-center justify-center rounded-full bg-blue-700 font-medium text-white">{children}</span>
}

function StepCard({ step }: { step: Step }) {
  switch (step.kind) {
    case 'share':
      return (
        <>
          <p className="text-[0.8125rem] font-medium">{step.title}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {step.sources.map((s, k) => (
              <li key={s} className="flex items-center gap-2.5 rounded-12 border border-border-tertiary p-2.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Icon name="building" size={14} />
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{s}</span>
                  <span className="relative block h-4 overflow-hidden text-secondary">
                    <span className="absolute inset-0 animate-[vt-out_.3s_both]" style={{ animationDelay: `${0.9 + k * 0.5}s` }}>
                      {step.checking}…
                    </span>
                    <span className="absolute inset-0 flex items-center gap-1 text-green-600 opacity-0 animate-[rise_.4s_both]" style={{ animationDelay: `${1 + k * 0.5}s` }}>
                      <Icon name="check" size={12} strokeWidth={3} />
                      {step.done}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-center text-link underline decoration-dotted underline-offset-2">{step.manual}</p>
          <Primary>{step.cta}</Primary>
        </>
      )
    case 'confirm':
      return (
        <>
          <p className="text-[0.8125rem] font-medium">{step.title}</p>
          <dl className="mt-3 divide-y divide-border-quaternary rounded-12 border border-border-tertiary px-3">
            {step.rows.map(([k, v]) => (
              <div key={k} className="py-2">
                <dt className="text-[0.6875rem] text-secondary">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <span className="flex h-9 items-center justify-center rounded-full border border-border-primary text-center leading-tight font-medium">{step.no}</span>
            <span className="flex h-9 items-center justify-center rounded-full bg-blue-700 font-medium text-white">{step.yes}</span>
          </div>
        </>
      )
    case 'choice':
      return (
        <>
          <p className="text-[0.8125rem] font-medium">{step.title}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {step.options.map((o, k) => (
              <li
                key={o}
                className={cx(
                  'flex items-center gap-2 rounded-12 border px-3 py-2.5 transition-colors',
                  k === step.pick ? 'animate-[pick_.4s_.8s_both] border-border-tertiary' : 'border-border-tertiary',
                )}
              >
                <span className="flex size-3.5 items-center justify-center rounded-full border border-border-secondary">
                  {k === step.pick && <span className="size-2 rounded-full bg-blue-700 opacity-0 animate-[rise_.3s_.9s_both]" />}
                </span>
                {o}
              </li>
            ))}
          </ul>
          <Primary>{step.cta}</Primary>
        </>
      )
    case 'consent':
      return (
        <>
          <p className="text-[0.625rem] font-medium tracking-wide text-secondary uppercase">PG&E · CARE</p>
          <p className="mt-1.5 text-[0.9375rem] leading-snug font-medium">{step.title}</p>
          <p className="mt-2 text-secondary">{step.body}</p>
          <Primary>{step.yes}</Primary>
        </>
      )
    case 'done':
      return (
        <>
          <span className="flex size-9 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon name="check" size={18} strokeWidth={2.5} />
          </span>
          <p className="mt-3 text-[0.9375rem] leading-snug font-medium">{step.title}</p>
          <p className="mt-1 text-secondary">{step.body}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-12 bg-background-tertiary p-3">
            {step.rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-secondary">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )
    case 'track':
      return (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-blue-900 text-white">
              <Icon name="document" size={15} />
            </span>
            <p className="text-[0.8125rem] font-medium">{step.title}</p>
          </div>
          <ol className="mt-4 flex flex-col">
            {step.steps.map(([label, date, state], k) => (
              <li key={label} className="relative flex gap-3 pb-4 last:pb-0">
                {k < step.steps.length - 1 && (
                  <span className={cx('absolute top-5 bottom-0 left-[9px] w-0.5 rounded-full', state === 'done' ? 'bg-blue-700' : 'bg-background-secondary')} />
                )}
                <span
                  className={cx(
                    'relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full',
                    state === 'done' && 'bg-blue-700 text-white',
                    state === 'current' && 'bg-white ring-2 ring-blue-700',
                    state === 'todo' && 'bg-background-secondary',
                  )}
                >
                  {state === 'done' && <Icon name="check" size={11} strokeWidth={3} />}
                  {state === 'current' && <span className="size-2 rounded-full bg-blue-700" />}
                </span>
                <span>
                  <span className={cx('block font-medium', state === 'todo' && 'text-secondary')}>{label}</span>
                  <span className="block text-[0.6875rem] text-tertiary">{date}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )
    case 'text':
      return (
        <>
          <div className="flex items-center gap-2 border-b border-border-quaternary pb-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-blue-700 text-white">
              <Icon name="message" size={12} />
            </span>
            <span className="font-medium">{step.from}</span>
          </div>
          <p className="mt-3 max-w-[90%] rounded-[1rem] bg-[#eef0f3] px-3 py-2 leading-snug">{step.body}</p>
          <p className="mt-2 ml-auto w-fit rounded-[1rem] bg-blue-600 px-3 py-2 text-white opacity-0 animate-[bubble-in_.45s_1.2s_both]">{step.reply}</p>
        </>
      )
  }
}
