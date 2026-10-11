import { useCallback, useEffect, useRef, useState } from 'react'

// Dictation with the browser's Web Speech API, like the microphone in
// america.gov's message box. The words go into the box; the person still
// presses send.

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function ctor(): (new () => Recognition) | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined
}

export type SpeechError = 'unsupported' | 'denied' | null

export function useSpeech(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<SpeechError>(null)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback(() => {
    const C = ctor()
    if (!C) return setError('unsupported')
    setError(null)
    const r = new C()
    r.lang = lang === 'es' ? 'es-US' : 'en-US'
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      cb.current((finalText + interim).trim())
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('denied')
    }
    r.onend = () => {
      setListening(false)
      rec.current = null
    }
    rec.current = r
    setListening(true)
    r.start()
  }, [lang])

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop])

  useEffect(() => () => rec.current?.stop(), [])

  return { listening, error, toggle, clearError: () => setError(null) }
}
