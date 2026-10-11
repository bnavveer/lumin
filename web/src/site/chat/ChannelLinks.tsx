import { useEffect, useState } from 'react'
import type { PublicChannelConfig } from '../../../../shared/chat'

export function ChannelLinks({ lang }: { lang: 'en' | 'es' }) {
  const [phone, setPhone] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/config', { signal: controller.signal }).then(r => r.ok ? r.json() : null)
      .then((c: PublicChannelConfig | null) => { if (c?.phone && /^\+1\d{10}$/.test(c.phone)) setPhone(c.phone) }).catch(() => {})
    return () => controller.abort()
  }, [])
  if (!phone) return null
  const es = lang === 'es'
  return (
    <div className="mb-6 type-body-s text-secondary">
      <p className="flex flex-wrap gap-x-4 gap-y-2">
        <span>{es ? '¿Prefieres usar tu teléfono?' : 'Prefer your phone?'}</span>
        <a className="rounded-4 text-link underline underline-offset-4 focus-ring" href={`sms:${phone}`}>{es ? 'Enviar un mensaje a Lumin' : 'Text Lumin'}</a>
        <a className="rounded-4 text-link underline underline-offset-4 focus-ring" href={`tel:${phone}`}>{es ? 'Llamar a Lumin' : 'Call Lumin'}</a>
      </p>
      <p className="mt-2 type-label-s">{es ? 'Confirma por mensaje de texto para vincular tus respuestas con este chat.' : 'Confirm by text to link your answers with this chat.'}</p>
    </div>
  )
}
