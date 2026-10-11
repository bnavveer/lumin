import { useState, type CSSProperties, type ReactNode } from 'react'
import { brand } from '../../brand/brand'
import { cx } from '../../components/cx'
import { Icon } from '../../components/icons'
import { useStartChat } from '../chrome'
import { useInView, usePlaying, useReducedMotion } from '../hooks'
import { useLang } from '../lang'
import { Link } from '../router'
import '@fontsource/mrs-saint-delafield/400.css'
import './ApplicationGuide.css'

// Homepage walkthrough, in the manner of america.gov/coming-soon: one large
// atmospheric stage, compact product UI, deliberate motion. A chat on the
// left becomes the application on the right; then documents, review and
// signature, and filing. Everything in the stage is an example (Maria is
// fictional). The person's real applications live at /account.
//
// Timing is pure CSS: each element's resting style is its final state and
// its animation describes how it arrives (fill-mode both, delay via --d).
// So reduced motion and "static" simply drop the animations and show the
// finished scene. The active tab's progress bar ends each scene. It keeps
// playing under the pointer; it only stops off screen or with reduced motion.

type Lang = 'en' | 'es'
type Scene = 'talk' | 'documents' | 'sign' | 'filed'
const scenes: { id: Scene; seconds: number }[] = [
  { id: 'talk', seconds: 9 },
  { id: 'documents', seconds: 8 },
  { id: 'sign', seconds: 7.5 },
  { id: 'filed', seconds: 7 },
]

const words = {
  en: {
    tag: 'Example application',
    tabs: { talk: 'Conversation', documents: 'Documents', sign: 'Review and sign', filed: 'Filed' },
    tabsLabel: 'Walkthrough scenes',
    srIntro: 'Example walkthrough. ',
    sr: {
      talk: 'Maria answers a few questions in a chat with Lumin, and each answer fills in her CalFresh, Medi-Cal and CalWORKs application.',
      documents: 'She sends a photo of her pay stub. Lumin reads it and attaches her pay stub, ID and lease to the application.',
      sign: 'She reviews each section, confirms the information is true, and signs.',
      filed: 'Lumin files the application with Los Angeles County and shows the confirmation number and next steps.',
    },
    heading: 'From a conversation to a filed application.',
    body: 'Tell Lumin about your household. It fills out your CalFresh, Medi-Cal and CalWORKs application, gathers your documents, and files it with your county after you review and sign.',
    start: 'Start my application',
    startPrompt: 'I want to apply for CalFresh, Medi-Cal or CalWORKs.',
    mine: 'My applications',
    county: 'Your county decides eligibility.',
  },
  es: {
    tag: 'Solicitud de ejemplo',
    tabs: { talk: 'Conversación', documents: 'Documentos', sign: 'Revisar y firmar', filed: 'Presentada' },
    tabsLabel: 'Escenas del ejemplo',
    srIntro: 'Ejemplo. ',
    sr: {
      talk: 'Maria contesta unas preguntas en un chat con Lumin, y cada respuesta llena su solicitud de CalFresh, Medi-Cal y CalWORKs.',
      documents: 'Envía una foto de su talón de pago. Lumin la lee y adjunta su talón, su identificación y su contrato de renta.',
      sign: 'Revisa cada sección, confirma que la información es verdadera y firma.',
      filed: 'Lumin presenta la solicitud ante el Condado de Los Ángeles y muestra el número de confirmación y los siguientes pasos.',
    },
    heading: 'De una conversación a una solicitud presentada.',
    body: 'Cuéntale a Lumin sobre tu hogar. Llena tu solicitud de CalFresh, Medi-Cal y CalWORKs, reúne tus documentos y la presenta ante tu condado después de que la revises y firmes.',
    start: 'Empezar mi solicitud',
    startPrompt: 'Quiero solicitar CalFresh, Medi-Cal o CalWORKs.',
    mine: 'Mis solicitudes',
    county: 'Tu condado decide la elegibilidad.',
  },
}

export function ApplicationGuide() {
  const { lang } = useLang()
  const w = words[lang]
  const start = useStartChat()
  const reduced = useReducedMotion()
  const [playing] = usePlaying()
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, margin: '0px' })
  const [index, setIndex] = useState(0)
  const [run, setRun] = useState(0) // bumps to restart a scene's animations
  const scene = scenes[index]
  const live = playing && visible && !reduced

  function go(i: number) {
    setIndex(i)
    setRun((r) => r + 1)
  }

  return (
    <section id="applications" aria-labelledby="applications-heading" className="mx-auto max-w-[70rem] px-6 pt-32 max-mobile:px-4 max-mobile:pt-20">
      <figure>
        <div ref={ref} className="jr" data-paused={!live} data-static={reduced}>
          <Aurora />
          <span className="jr-tag">{w.tag}</span>

          <div key={`${lang}-${scene.id}-${run}`} className="jr-stage" aria-hidden="true">
            <ChatPanel scene={scene.id} lang={lang} />
            <FormPanel scene={scene.id} lang={lang} />
          </div>
          <p className="sr-only" aria-live="polite">
            {w.srIntro}
            {w.sr[scene.id]}
          </p>

          <div className="jr-controls">
            <div role="group" aria-label={w.tabsLabel} className="jr-tabs">
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => go(i)}
                  className={cx('jr-tab focus-ring', i === index && 'is-active')}
                >
                  <span className="jr-tab-label">{w.tabs[s.id]}</span>
                  {i === index && (
                    <span
                      key={run}
                      className="jr-tab-progress"
                      style={{ '--len': `${s.seconds}s` } as CSSProperties}
                      onAnimationEnd={() => go((index + 1) % scenes.length)}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <figcaption className="jr-caption">
          <div className="min-w-0">
            <h2 id="applications-heading" className="jr-heading">
              {w.heading}
            </h2>
            <p className="mt-3 max-w-[36rem] type-body-m text-secondary">{w.body}</p>
            <p className="mt-2 type-body-s text-tertiary">{w.county}</p>
          </div>
          <div className="jr-actions">
            <button type="button" onClick={() => start(w.startPrompt)} className="jr-button is-primary focus-ring">
              {w.start}
            </button>
            <Link href="/account" className="jr-button is-quiet focus-ring">
              {w.mine}
            </Link>
          </div>
        </figcaption>
      </figure>
    </section>
  )
}

/* ── Background ── */

function Aurora() {
  return (
    <div className="jr-aurora" aria-hidden="true">
      <span className="jr-blob jr-blob-a" />
      <span className="jr-blob jr-blob-b" />
      <span className="jr-blob jr-blob-c" />
      <span className="jr-blob jr-blob-d" />
    </div>
  )
}

/* ── Timing helpers ── */

const at = (s: number) => ({ '--d': `${s}s` }) as CSSProperties

function Bubble({ me, d, children, flash }: { me?: boolean; d: number; children: ReactNode; flash?: boolean }) {
  return (
    <div className={cx('jr-bubble', me ? 'is-me' : 'is-lumin', flash && 'jr-flash-out')} style={at(d)}>
      {children}
    </div>
  )
}

/* ── Left: the conversation ── */

function ChatPanel({ scene, lang }: { scene: Scene; lang: Lang }) {
  const es = lang === 'es'
  return (
    <div className="jr-chat">
      <div className="jr-chat-head">
        <span className="jr-avatar">
          <Icon name="message" size={12} />
        </span>
        {brand.name}
      </div>
      <div className="jr-thread">
        {scene === 'talk' && (
          <>
            <Bubble d={0.3}>{es ? '¡Hola! ¿Cómo te llamas y en qué condado vives?' : 'Hi! What’s your first name, and which county do you live in?'}</Bubble>
            <Bubble me d={1.2} flash>{es ? 'Maria, en Los Ángeles.' : 'Maria, in Los Angeles.'}</Bubble>
            <Bubble d={2.7}>{es ? '¿Quién vive y come contigo?' : 'Who lives and eats with you?'}</Bubble>
            <Bubble me d={3.6} flash>{es ? 'Yo y mis dos hijos.' : 'Me and my two kids.'}</Bubble>
            <Bubble d={5}>{es ? '¿Cuánto gana tu hogar al mes, más o menos?' : 'About how much does your household earn a month?'}</Bubble>
            <Bubble me d={5.9} flash>{es ? 'Unos $1,850 de mi trabajo.' : 'About $1,850 from my job.'}</Bubble>
          </>
        )}
        {scene === 'documents' && (
          <>
            <Bubble d={0.3}>{es ? 'Envía una foto de tu talón de pago más reciente.' : 'Send a photo of your most recent pay stub.'}</Bubble>
            <div className="jr-bubble is-me is-photo" style={at(1.2)}>
              <PayStub />
            </div>
            <Bubble d={3.4}>{es ? 'Listo. Dice $1,850 en septiembre, igual a lo que me dijiste.' : 'Got it. It shows $1,850 for September, which matches what you told me.'}</Bubble>
          </>
        )}
        {scene === 'sign' && (
          <>
            <Bubble d={0.3}>{es ? 'Todo está lleno. Revísalo, y si está bien, firma.' : 'Everything is filled in. Look it over, and sign if it’s right.'}</Bubble>
            <Bubble me d={5.1}>{es ? 'Listo, ya firmé.' : 'Done, I signed.'}</Bubble>
          </>
        )}
        {scene === 'filed' && (
          <>
            <Bubble d={0.3}>{es ? 'Presenté tu solicitud ante el Condado de Los Ángeles.' : 'Your application is filed with Los Angeles County.'}</Bubble>
            <Bubble d={2.2}>{es ? 'Te enviaré un mensaje cuando el condado programe tu entrevista.' : 'I’ll text you when the county schedules your interview.'}</Bubble>
            <Bubble me d={3.8}>{es ? '¡Gracias!' : 'Thank you!'}</Bubble>
          </>
        )}
      </div>
      <div className="jr-input">
        <span>{es ? 'Escribe o habla…' : 'Type or talk…'}</span>
        <Icon name="mic" size={14} />
      </div>
    </div>
  )
}

function PayStub() {
  return (
    <span className="jr-stub">
      <span className="jr-stub-paper">
        <span className="jr-stub-line w-[55%] !bg-[#24324d]" />
        <span className="jr-stub-line w-[35%]" />
        <span className="mt-1.5 flex justify-between gap-2">
          <span className="jr-stub-line w-[40%]" />
          <span className="jr-stub-line w-[22%] !bg-[#24324d]" />
        </span>
        <span className="flex justify-between gap-2">
          <span className="jr-stub-line w-[48%]" />
          <span className="jr-stub-line w-[18%]" />
        </span>
        <span className="flex justify-between gap-2">
          <span className="jr-stub-line w-[30%]" />
          <span className="jr-stub-line w-[20%]" />
        </span>
        <span className="jr-scan" style={at(1.7)} />
      </span>
    </span>
  )
}

/* ── Right: the application ── */

function FormPanel({ scene, lang }: { scene: Scene; lang: Lang }) {
  const es = lang === 'es'
  return (
    <div className={cx('jr-form', `is-${scene}`)}>
      <div className="jr-form-head">
        <span className="jr-doc-icon">
          <Icon name="document" size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-medium">{es ? 'Solicitud de beneficios' : 'Benefits application'}</span>
          <span className="mt-1 flex gap-1">
            {['CalFresh', 'Medi-Cal', 'CalWORKs'].map((p) => (
              <span key={p} className="jr-program">
                {p}
              </span>
            ))}
          </span>
        </span>
        <StatusPill scene={scene} es={es} />
      </div>
      <div className="jr-form-body">
        {scene === 'talk' && <TalkForm es={es} />}
        {scene === 'documents' && <DocumentsForm es={es} />}
        {scene === 'sign' && <SignForm es={es} />}
        {scene === 'filed' && <FiledForm es={es} />}
      </div>
    </div>
  )
}

function StatusPill({ scene, es }: { scene: Scene; es: boolean }) {
  if (scene === 'filed')
    return (
      <span className="jr-status is-done" style={at(0.9)}>
        <Icon name="check" size={11} strokeWidth={3} />
        {es ? 'Presentada' : 'Filed'}
      </span>
    )
  return <span className="jr-status">{scene === 'sign' ? (es ? 'Lista para firmar' : 'Ready to sign') : es ? 'Llenando' : 'Filling in'}</span>
}

function Field({ label, value, d }: { label: string; value: string; d?: number }) {
  return (
    <div className="jr-field">
      <span className="jr-field-label">{label}</span>
      <span className="jr-field-value">
        {d !== undefined && <span className="jr-skeleton" style={at(d)} />}
        <span className={cx(d !== undefined && 'jr-fill')} style={d !== undefined ? at(d) : undefined}>
          {value}
        </span>
      </span>
    </div>
  )
}

function SectionTitle({ children, done, d }: { children: ReactNode; done?: boolean; d?: number }) {
  return (
    <p className="jr-section">
      {children}
      {done && (
        <span className={cx('jr-section-check', d !== undefined && 'jr-pop')} style={d !== undefined ? at(d) : undefined}>
          <Icon name="check" size={10} strokeWidth={3} />
        </span>
      )}
    </p>
  )
}

function TalkForm({ es }: { es: boolean }) {
  return (
    <>
      <SectionTitle done d={6.8}>
        {es ? 'Tu hogar' : 'Your household'}
      </SectionTitle>
      <div className="jr-fields">
        <Field label={es ? 'Nombre' : 'First name'} value="Maria" d={1.6} />
        <Field label={es ? 'Condado' : 'County'} value={es ? 'Los Ángeles' : 'Los Angeles'} d={1.8} />
        <Field label={es ? 'Personas en el hogar' : 'People at home'} value={es ? '3, con 2 menores de 18' : '3, with 2 under 18'} d={4} />
        <Field label={es ? 'Ingresos al mes' : 'Monthly income'} value="$1,850" d={6.3} />
      </div>
      <SectionTitle>{es ? 'Documentos' : 'Documents'}</SectionTitle>
      <div className="jr-fields is-muted">
        <span className="jr-skeleton is-static w-[62%]" />
        <span className="jr-skeleton is-static w-[44%]" />
      </div>
    </>
  )
}

function DocRow({ name, detail, d, icon = 'document' }: { name: string; detail: string; d: number; icon?: 'document' | 'user' | 'home' }) {
  return (
    <div className="jr-doc" style={at(d)}>
      <span className="jr-doc-thumb">
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.75rem] font-medium">{name}</span>
        <span className="block truncate text-[0.625rem] text-secondary">{detail}</span>
      </span>
      <span className="jr-doc-state">
        <span className="jr-spin" style={at(d + 0.9)}>
          <Icon name="spinner" size={13} />
        </span>
        <span className="jr-check jr-pop" style={at(d + 0.9)}>
          <Icon name="check" size={10} strokeWidth={3} />
        </span>
      </span>
    </div>
  )
}

function DocumentsForm({ es }: { es: boolean }) {
  return (
    <>
      <SectionTitle done>{es ? 'Tu hogar' : 'Your household'}</SectionTitle>
      <div className="jr-summary">{es ? 'Maria, Los Ángeles, 3 personas, $1,850/mes' : 'Maria, Los Angeles, 3 people, $1,850/mo'}</div>
      <SectionTitle done d={6.4}>
        {es ? 'Documentos' : 'Documents'}
      </SectionTitle>
      <div className="flex flex-col gap-1.5">
        <DocRow name={es ? 'Talón de pago, septiembre' : 'Pay stub, September'} detail={es ? '$1,850 brutos, coinciden' : '$1,850 gross, matches income'} d={2.4} />
        <DocRow icon="user" name={es ? 'Licencia de California' : 'California driver license'} detail={es ? 'Identidad' : 'Proof of identity'} d={4.2} />
        <DocRow icon="home" name={es ? 'Contrato de renta' : 'Lease'} detail={es ? 'Comprobante de domicilio' : 'Proof of address'} d={5.2} />
      </div>
    </>
  )
}

function SignForm({ es }: { es: boolean }) {
  const rows = es
    ? [['Hogar', '3 personas'], ['Ingresos', '$1,850/mes'], ['Documentos', '3 adjuntos']]
    : [['Household', '3 people'], ['Income', '$1,850/mo'], ['Documents', '3 attached']]
  return (
    <>
      <SectionTitle>{es ? 'Revisa tu solicitud' : 'Review your application'}</SectionTitle>
      <div className="jr-review">
        {rows.map(([k, v], i) => (
          <div key={k} className="jr-review-row" style={at(0.5 + i * 0.45)}>
            <span className="text-secondary">{k}</span>
            <span className="font-medium">{v}</span>
            <span className="jr-check jr-pop" style={at(0.8 + i * 0.45)}>
              <Icon name="check" size={10} strokeWidth={3} />
            </span>
          </div>
        ))}
      </div>
      <div className="jr-attest" style={at(2.3)}>
        <span className="jr-box">
          <span className="jr-box-tick jr-pop" style={at(2.7)}>
            <Icon name="check" size={10} strokeWidth={3.25} />
          </span>
        </span>
        <span>{es ? 'Declaro que la información es verdadera y correcta.' : 'I declare that this information is true and correct.'}</span>
      </div>
      <div className="jr-signature" style={at(3)}>
        <span className="jr-sign-x">×</span>
        <svg viewBox="0 0 240 64" className="jr-sign-svg" aria-hidden="true">
          <defs>
            <clipPath id="jr-sign-clip">
              <rect className="jr-sign-reveal" style={at(3.2)} x="0" y="0" width="240" height="64" />
            </clipPath>
          </defs>
          <g clipPath="url(#jr-sign-clip)">
            <text x="14" y="44" className="jr-sign-text">
              Maria Lopez
            </text>
            <path className="jr-ink" style={at(4.55)} pathLength={1} d="M30 52c34 4 92 4 150-2 14-1.5 26-4 34-7" />
          </g>
        </svg>
        <span className="jr-sign-label">
          <span>{es ? 'Firma de Maria' : 'Maria’s signature'}</span>
          <span className="jr-sign-date" style={at(4.9)}>
            {es ? 'Firmado hoy' : 'Signed today'}
          </span>
        </span>
      </div>
      <span className="jr-file-button" style={at(5.4)}>
        {es ? 'Firmar y presentar' : 'Sign and file'}
      </span>
    </>
  )
}

function FiledForm({ es }: { es: boolean }) {
  const steps: [string, string, 'done' | 'next' | 'later'][] = es
    ? [['Presentada', 'Hoy, 2:14 pm', 'done'], ['Entrevista', 'El condado te llamará', 'next'], ['Decisión', 'En unos 30 días', 'later']]
    : [['Filed', 'Today, 2:14 pm', 'done'], ['Interview', 'The county will call you', 'next'], ['Decision', 'In about 30 days', 'later']]
  return (
    <>
      <div className="jr-filed" style={at(0.4)}>
        <span className="jr-filed-check jr-pop" style={at(0.6)}>
          <Icon name="check" size={18} strokeWidth={2.75} />
        </span>
        <span>
          <span className="block text-[0.9375rem] font-medium tracking-tight">{es ? 'Solicitud presentada' : 'Application filed'}</span>
          <span className="block text-[0.6875rem] text-secondary">{es ? 'Condado de Los Ángeles, DPSS' : 'Los Angeles County DPSS'}</span>
        </span>
      </div>
      <div className="jr-receipt" style={at(1.2)}>
        <span className="text-secondary">{es ? 'Confirmación' : 'Confirmation'}</span>
        <span className="font-medium tabular-nums">LA-2610-48213</span>
      </div>
      <ol className="jr-timeline">
        {steps.map(([label, detail, state], i) => (
          <li key={label} className={cx('jr-step', `is-${state}`)} style={at(1.8 + i * 0.5)}>
            <span className="jr-dot">{state === 'done' && <Icon name="check" size={9} strokeWidth={3.25} />}</span>
            <span>
              <span className="block text-[0.75rem] font-medium">{label}</span>
              <span className="block text-[0.625rem] text-secondary">{detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}
