import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../components/cx'
import { CaliforniaFlag } from '../components/Flags'
import { Icon } from '../components/icons'
import { Photo } from '../components/Photo'
import { photoById } from '../data/photos'
import { useReducedMotion } from './hooks'
import { useLang } from './lang'

// The spread of floating previews under "More coming soon" on the home page
// (america.gov shows campgrounds, passports and job matches). Ours preview
// what the agent will do next. The stage is laid out at 1400×660 and scaled
// to fit, so the composition holds on every screen size.

const W = 1400
const H = 660

type Text = Record<string, string>
const words: { en: Text; es: Text } = {
  en: {
    calfresh: 'Money for groceries every month.',
    consentK: 'Ready to apply',
    consentT: 'Send your CARE enrollment to PG&E?',
    yes: 'Yes, send it',
    review: 'Review first',
    track: 'CalFresh application',
    submitted: 'Submitted',
    interview: 'Interview',
    decision: 'Decision',
    drop: 'Drop your pay stub anywhere',
    sms: 'Your CalFresh interview is tomorrow at 10 am. Reply 1 to reschedule.',
    totalK: 'You may qualify for',
    total: '$1,023/mo',
    totalN: 'CalFresh, family of 4',
    lifeline: 'California LifeLine',
    lifelineB: 'Phone discount',
    enrolled: 'Enrolled',
    wic: 'WIC office near you',
    wicB: 'Open today until 5 pm',
    book: 'Book',
    county: 'Los Angeles County',
  },
  es: {
    calfresh: 'Dinero para comida cada mes.',
    consentK: 'Lista para enviar',
    consentT: '¿Enviar tu inscripción a CARE a PG&E?',
    yes: 'Sí, envíala',
    review: 'Revisar',
    track: 'Solicitud de CalFresh',
    submitted: 'Enviada',
    interview: 'Entrevista',
    decision: 'Decisión',
    drop: 'Suelta tu talón de pago aquí',
    sms: 'Tu entrevista de CalFresh es mañana a las 10 am. Responde 1 para cambiarla.',
    totalK: 'Podrías calificar para',
    total: '$1,023/mes',
    totalN: 'CalFresh, familia de 4',
    lifeline: 'California LifeLine',
    lifelineB: 'Descuento de teléfono',
    enrolled: 'Inscrito',
    wic: 'Oficina de WIC cerca de ti',
    wicB: 'Abierta hoy hasta las 5 pm',
    book: 'Reservar',
    county: 'Condado de Los Ángeles',
  },
}

function Card({ x, y, w, depth, delay = 0, children, className, shift }: { x: number; y: number; w: number; depth: number; delay?: number; children: ReactNode; className?: string; shift: number }) {
  const style: CSSProperties = { left: x, top: y, width: w, transform: `translate3d(0, ${shift * depth}px, 0)` }
  return (
    <div className="absolute will-change-transform" style={style}>
      <div className={cx('rounded-[1.75rem] bg-white shadow-[0_24px_60px_#010e241f] ring-1 ring-border-quaternary', className)} style={{ animation: `float ${7 + (delay % 3)}s ease-in-out ${delay}s infinite` }}>
        {children}
      </div>
    </div>
  )
}

export function Collage() {
  const { lang } = useLang()
  const t = words[lang]
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [shift, setShift] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.5, Math.min(1, e.contentRect.width / W))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Gentle parallax: -1 when the stage enters, +1 when it leaves.
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const update = () => {
      raf = 0
      const el = wrap.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const p = (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight
      setShift(Math.max(-1, Math.min(1, p)) * -40)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', on, { passive: true })
    return () => {
      removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  const s = shift
  return (
    <div ref={wrap} aria-hidden="true" className="relative mx-auto mt-20 w-full max-w-[1400px] overflow-hidden" style={{ height: H * scale + 60 }}>
      <div className="absolute top-8 left-1/2 origin-top" style={{ width: W, height: H, transform: `translateX(-50%) scale(${scale})` }}>
        {/* Program card with photo */}
        <Card x={10} y={60} w={250} depth={0.6} delay={0.2} shift={s} className="overflow-hidden">
          <div className="h-36 overflow-hidden rounded-t-[1.75rem]">
            <Photo photo={photoById['farmers-market-apricots']} sizes="250px" />
          </div>
          <div className="p-4">
            <p className="font-serif text-[1.6rem] leading-none tracking-[-0.03em]">CalFresh</p>
            <p className="mt-1.5 text-[0.8125rem] text-secondary">{t.calfresh}</p>
          </div>
        </Card>

        {/* Consent */}
        <Card x={300} y={150} w={290} depth={1} delay={1.1} shift={s} className="p-5">
          <p className="text-[0.625rem] font-medium tracking-wide text-secondary uppercase">{t.consentK}</p>
          <p className="mt-2 text-[0.9375rem] leading-snug font-medium">{t.consentT}</p>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-blue-700 px-3.5 py-2 text-[0.75rem] font-medium text-white">{t.yes}</span>
            <span className="rounded-full border border-border-primary px-3.5 py-2 text-[0.75rem] font-medium">{t.review}</span>
          </div>
        </Card>

        {/* Total */}
        <Card x={640} y={40} w={250} depth={0.4} delay={0.6} shift={s} className="p-5 text-center">
          <p className="text-[0.75rem] text-secondary">{t.totalK}</p>
          <p className="mt-1 font-serif text-[2.6rem] leading-none tracking-[-0.04em]">{t.total}</p>
          <p className="mt-2 text-[0.6875rem] text-tertiary">{t.totalN}</p>
        </Card>

        {/* Tracking */}
        <Card x={1080} y={70} w={300} depth={0.8} delay={1.6} shift={s} className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-12 bg-blue-900 text-white">
              <Icon name="document" size={18} />
            </span>
            <div>
              <p className="text-[0.8125rem] font-medium">{t.track}</p>
              <p className="text-[0.6875rem] text-tertiary">{t.county}</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-white">
              <Icon name="check" size={12} strokeWidth={3} />
            </span>
            <span className="h-0.5 flex-1 rounded-full bg-blue-600" />
            <span className="size-5 rounded-full border-[5px] border-blue-600 bg-white" />
            <span className="h-0.5 flex-1 rounded-full bg-background-secondary" />
            <span className="size-2 rounded-full bg-background-secondary" />
          </div>
          <div className="mt-2 flex justify-between text-[0.625rem] text-secondary">
            <span>{t.submitted}</span>
            <span>{t.interview}</span>
            <span>{t.decision}</span>
          </div>
        </Card>

        {/* Pay stub drop */}
        <Card x={40} y={380} w={300} depth={0.9} delay={2.1} shift={s} className="bg-blue-50/80 p-2 shadow-none ring-0">
          <div className="relative flex h-36 items-center justify-center rounded-[1.4rem] border-2 border-dashed border-blue-600/60 text-[0.8125rem] font-medium text-blue-600">
            {t.drop}
            <span className="absolute -right-6 -bottom-5 flex items-center gap-1.5 rounded-full bg-blue-600 py-1 pr-3 pl-1 text-[0.6875rem] font-medium text-white shadow-soft-md">
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[0.5625rem] font-bold">PDF</span>
              paystub_sept.pdf
            </span>
            <svg viewBox="0 0 24 24" className="absolute -right-3 -bottom-12 size-7 drop-shadow" aria-hidden="true">
              <path d="M5 3l14 8-6 1.5L10 19 5 3Z" fill="#000c1f" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
        </Card>

        {/* Reminder text */}
        <Card x={420} y={360} w={300} depth={0.5} delay={0.9} shift={s} className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-blue-700 text-white">
              <Icon name="message" size={12} />
            </span>
            <span className="text-[0.6875rem] font-medium">Aid</span>
          </div>
          <p className="rounded-[1rem] bg-[#eef0f3] px-3 py-2 text-[0.8125rem] leading-snug">{t.sms}</p>
        </Card>

        {/* WIC office */}
        <Card x={770} y={300} w={260} depth={1.1} delay={1.4} shift={s} className="overflow-hidden">
          <div className="h-32 overflow-hidden rounded-t-[1.75rem]">
            <Photo photo={photoById['ferndale-main-street']} sizes="260px" />
          </div>
          <div className="flex items-end justify-between gap-2 p-4">
            <div>
              <p className="text-[0.8125rem] font-medium text-link">{t.wic}</p>
              <p className="mt-0.5 text-[0.6875rem] text-secondary">{t.wicB}</p>
            </div>
            <span className="rounded-full bg-background-tertiary px-3 py-1.5 text-[0.6875rem] font-medium">{t.book}</span>
          </div>
        </Card>

        {/* LifeLine */}
        <Card x={1090} y={330} w={260} depth={0.7} delay={2.4} shift={s} className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon name="phone" size={18} />
          </span>
          <div className="flex-1">
            <p className="text-[0.8125rem] font-medium">{t.lifeline}</p>
            <p className="text-[0.6875rem] text-secondary">{t.lifelineB}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[0.625rem] font-medium text-green-600">
            <Icon name="check" size={11} strokeWidth={3} />
            {t.enrolled}
          </span>
        </Card>

        {/* California chip */}
        <Card x={1130} y={500} w={170} depth={0.3} delay={0.4} shift={s} className="flex items-center justify-center gap-2 rounded-full px-4 py-3">
          <CaliforniaFlag width={24} className="rounded-[2px] ring-1 ring-border-tertiary" />
          <span className="text-[0.8125rem] font-medium">BenefitsCal</span>
        </Card>
      </div>
    </div>
  )
}
