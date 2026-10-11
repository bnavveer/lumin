import { useRef, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { AssistantMessage, QuickReplies, TypingIndicator, UserMessage } from '../components/Chat'
import { api } from '../lib/api'
import { ErrorCard } from './ui'

const suggestions = [
  'Who has an interview this week?',
  'Which households are missing documents?',
  'What should I do first today?',
]

export function AskPanel() {
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const last = useRef('')

  async function ask(text: string) {
    const t = text.trim()
    if (!t || busy) return
    last.current = t
    setAsked(t)
    setAnswer(null)
    setError(null)
    setBusy(true)
    try {
      setAnswer((await api.ask(t)).answer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    void ask(q)
    setQ('')
  }

  return (
    <section aria-labelledby="ask" className="rounded-32 bg-background-tertiary p-5">
      <h2 id="ask" className="type-heading-s">Ask Keewano</h2>
      <p className="mt-1 type-body-s text-secondary">Questions about your caseload, answered from live data.</p>
      <div className="mt-4"><QuickReplies options={suggestions} onPick={(s) => void ask(s)} /></div>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label htmlFor="ask-input" className="sr-only">Ask a question</label>
        <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your cases" maxLength={500}
          className="h-11 min-w-0 flex-1 rounded-full border border-border-tertiary bg-white px-4 type-body-s focus-ring" />
        <Button type="submit" disabled={busy || !q.trim()}>Ask</Button>
      </form>
      <div className="mt-5 flex flex-col gap-4" aria-live="polite">
        {asked && <UserMessage>{asked}</UserMessage>}
        {busy && <TypingIndicator label="Keewano is thinking" />}
        {answer && <AssistantMessage><p className="whitespace-pre-wrap">{answer}</p></AssistantMessage>}
        {error && <ErrorCard title="Keewano couldn’t answer" message={error} onRetry={() => void ask(last.current)} />}
      </div>
    </section>
  )
}
