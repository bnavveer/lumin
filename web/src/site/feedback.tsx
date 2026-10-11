import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { useT } from './lang'

// "Submit feedback" from the menu, the footer and the Coming soon page.
// Like america.gov, it warns before sending anything that looks personal.

export type FeedbackPayload = { kind: 'message' | 'rating'; text?: string; rating?: 'up' | 'down'; page: string }

export async function sendFeedback(p: FeedbackPayload) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(p),
  })
  if (!res.ok) throw new Error(String(res.status))
}

// SSN, phone, email, long digit runs (case or card numbers).
const personal = /\b\d{3}-?\d{2}-?\d{4}\b|\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|[^\s@]+@[^\s@]+\.[a-z]{2,}|\b\d{9,}\b/i
export const looksPersonal = (s: string) => personal.test(s)

const FeedbackContext = createContext<() => void>(() => {})
export const useOpenFeedback = () => useContext(FeedbackContext)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const show = useCallback(() => setOpen(true), [])
  return (
    <FeedbackContext.Provider value={show}>
      {children}
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </FeedbackContext.Provider>
  )
}

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT().feedback
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const flagged = looksPersonal(text)

  function close() {
    onClose()
    if (state === 'sent') {
      setText('')
      setState('idle')
    }
  }

  async function submit() {
    if (!text.trim() || flagged) return
    setState('sending')
    try {
      await sendFeedback({ kind: 'message', text: text.trim(), page: location.pathname })
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <Sheet open={open} onClose={close} title={t.title}>
      {state === 'sent' ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon name="check" size={24} strokeWidth={2.25} />
          </span>
          <p className="type-body-m">{t.thanks}</p>
          <Button onClick={close}>{t.done}</Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-4"
        >
          <p className="type-body-m text-secondary">{t.intro}</p>
          <label className="sr-only" htmlFor="feedback-text">
            {t.label}
          </label>
          <textarea
            id="feedback-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (state === 'error') setState('idle')
            }}
            rows={5}
            maxLength={2000}
            placeholder={t.placeholder}
            aria-invalid={flagged}
            aria-describedby="feedback-help"
            className="w-full resize-none rounded-24 border border-border-secondary px-5 py-4 type-body-m outline-none transition-[border-color,box-shadow] placeholder:text-tertiary hover:border-border-primary focus:border-primary focus:shadow-[0_0_0_3px_var(--color-background-secondary)] aria-[invalid=true]:border-amber-700"
          />
          <div id="feedback-help" aria-live="polite">
            {flagged && (
              <p className="flex gap-2 type-body-s text-amber-700">
                <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
                {t.pii}
              </p>
            )}
            {state === 'error' && (
              <p className="flex gap-2 type-body-s text-red-600">
                <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
                {t.error}
              </p>
            )}
          </div>
          <Button type="submit" disabled={!text.trim() || flagged || state === 'sending'} className="self-end">
            {state === 'sending' ? t.sending : t.send}
          </Button>
        </form>
      )}
    </Sheet>
  )
}
