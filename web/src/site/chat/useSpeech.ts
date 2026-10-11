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
  onstart: (() => void) | null
  start(): void
  stop(): void
}

function ctor(): (new () => Recognition) | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined
}

export type SpeechError = 'unsupported' | 'denied' | 'no-mic' | 'network' | 'no-speech' | null

// `current` returns what's already in the box, so speech is added after it
// instead of replacing it.
export function useSpeech(lang: string, onText: (text: string) => void, current?: () => string) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<SpeechError>(null)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText
  const read = useRef(current)
  read.current = current

  const stop = useCallback(() => rec.current?.stop(), [])

  const start = useCallback(() => {
    const C = ctor()
    if (!C) return setError('unsupported')
    setError(null)
    const r = new C()
    r.lang = lang === 'es' ? 'es-US' : 'en-US'
    r.interimResults = true
    r.continuous = false
    const before = (read.current?.() ?? '').trim()
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      const spoken = (finalText + interim).trim()
      cb.current(before && spoken ? `${before} ${spoken}` : before || spoken)
    }
    // Every failure gets a message; before, only a denied permission did.
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('denied')
      else if (e.error === 'audio-capture') setError('no-mic')
      else if (e.error === 'network') setError('network')
      else if (e.error === 'no-speech') setError('no-speech')
    }
    // Some browsers expose speech recognition but never start it (no speech
    // service). If it hasn't started within 10s (time for the permission
    // prompt), give up and say so rather than appearing to listen forever.
    const watchdog = setTimeout(() => {
      setError('network')
      r.stop()
      setListening(false)
    }, 10_000)
    r.onstart = () => clearTimeout(watchdog)
    r.onend = () => {
      clearTimeout(watchdog)
      setListening(false)
      rec.current = null
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      // Already started (a fast double click): just stop it.
      r.stop()
    }
  }, [lang])

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop])

  useEffect(() => () => rec.current?.stop(), [])

  return { listening, error, toggle, clearError: () => setError(null) }
}

// The message to show for a speech error, in the site's language.
export function speechMessage(
  error: Exclude<SpeechError, null>,
  t: { voiceUnsupported: string; voiceDenied: string; voiceNoMic: string; voiceNetwork: string; voiceNoSpeech: string },
) {
  return { unsupported: t.voiceUnsupported, denied: t.voiceDenied, 'no-mic': t.voiceNoMic, network: t.voiceNetwork, 'no-speech': t.voiceNoSpeech }[error]
}
