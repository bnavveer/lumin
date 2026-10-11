import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconButton } from '../../components/Button'
import { ChatNotice, ComposerShell, QuickReplies, UserMessage } from '../../components/Chat'
import { ChatComposer } from '../../components/ChatComposer'
import { cx } from '../../components/cx'
import { Icon } from '../../components/icons'
import { Markdown } from '../chat/Markdown'
import { takePendingAttach, takePendingQuestion, useChat, type ChatMessage, type WebView } from '../chat/useChat'
import { useSpeech } from '../chat/useSpeech'
import { ProgramMatches } from '../chat/ProgramMatches'
import { ChannelLinks } from '../chat/ChannelLinks'
import { composerLabels, Header } from '../chrome'
import type { Copy } from '../copy'
import { sendFeedback } from '../feedback'
import { useLang } from '../lang'

// america.gov/chat: header, the conversation, and the message box docked at
// the bottom with any notice ("Something went wrong. Try again") sitting on
// top of it. Wired to the real agent through /api/chat.

type Notice = 'attach' | 'voice-unsupported' | 'voice-denied' | null

export function Chat() {
  const { t, lang } = useLang()
  const chat = useChat()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const speech = useSpeech(lang, setText)
  const bottom = useRef<HTMLDivElement>(null)

  // A question asked on another page starts the conversation.
  useEffect(() => {
    const q = takePendingQuestion()
    if (q) void chat.send(q)
    if (takePendingAttach()) setNotice('attach')
    // run once on arrival
  }, [])

  useEffect(() => {
    if (speech.error) setNotice(speech.error === 'denied' ? 'voice-denied' : 'voice-unsupported')
  }, [speech.error])

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: chat.messages.length > 2 ? 'smooth' : 'auto', block: 'end' })
  }, [chat.messages.length, chat.busy, chat.failed])

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant')
  const lastIsAssistant = chat.messages.at(-1)?.role === 'assistant'
  const suggestions = !chat.busy && lastIsAssistant && chat.view ? suggestReplies(t, chat.view, lastAssistant?.content ?? '') : []
  const closed = chat.view?.status === 'rejected'
  const empty = chat.messages.length === 0 && !chat.busy && !chat.restoring

  function submit(q: string) {
    setNotice(null)
    speech.clearError()
    void chat.send(q)
  }

  return (
    <>
      <nav aria-label="Skip links" className="contents">
        <a href="#latest" className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-blue-700 px-5 py-3 type-label-m text-white focus:translate-y-0 focus-ring">
          {lang === 'es' ? 'Ir a la última respuesta' : 'Skip to latest response'}
        </a>
        <a href="#message-input" className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-blue-700 px-5 py-3 type-label-m text-white focus:translate-y-0 focus-ring">
          {lang === 'es' ? 'Ir a la caja de mensaje' : 'Skip to message input'}
        </a>
      </nav>
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl">
        <Header />
      </div>
      <main id="main" className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-[44rem] flex-col px-6 pt-6 pb-64 max-mobile:px-4 max-mobile:pb-56">
        <h1 className="sr-only">{t.chat.title}</h1>
        <ChannelLinks lang={lang} />
        {chat.messages.length > 0 && (
          <div className="mb-6 flex justify-end">
            <Button variant="ghost" size="sm" icon="refresh" onClick={chat.reset} className="text-secondary">
              {t.chat.newChat}
            </Button>
          </div>
        )}

        {empty && <EmptyState t={t} onPick={submit} />}

        <div role="log" aria-live="polite" aria-label={t.chat.title} className="flex flex-col gap-10">
          {chat.messages.map((m, i) => (
            <Message key={m.id} m={m} t={t} latest={i === chat.messages.length - 1} />
          ))}
          {chat.busy && (
            <p className="text-shimmer type-body-m" role="status">
              {t.chat.thinking}…
            </p>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="mt-6" aria-label={t.chat.suggestions} role="group">
            <QuickReplies options={suggestions} onPick={submit} />
          </div>
        )}
        <div ref={bottom} className="h-px scroll-mb-64" />
        {!closed && chat.view?.screening && chat.messages.length > 0 && (
          <ProgramMatches screening={chat.view.screening} linked={chat.view.linked} disabled={chat.busy} lang={lang} onAsk={submit} />
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-white from-60% to-transparent px-4 pt-12 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div id="message-input" className="pointer-events-auto mx-auto w-full max-w-[44rem]">
          <ComposerShell notice={renderNotice()}>
            <ChatComposer
              variant="inline"
              placeholder={t.composer.ask}
              value={text}
              onValueChange={setText}
              onSubmit={submit}
              busy={chat.busy}
              disabled={closed}
              onAttach={() => setNotice('attach')}
              onVoice={speech.toggle}
              listening={speech.listening}
              labels={composerLabels(t)}
              autoFocus={empty}
            />
          </ComposerShell>
          <p className="mt-3 text-center type-label-s leading-normal text-tertiary max-mobile:hidden">{t.chat.disclaimer}</p>
        </div>
      </div>
    </>
  )

  function renderNotice() {
    if (chat.failed)
      return (
        <ChatNotice
          title={t.chat.wrong}
          action={
            <button type="button" onClick={chat.retry} className="cursor-pointer self-start rounded-4 type-body-m text-link underline decoration-dotted underline-offset-4 hover:decoration-solid focus-ring">
              {t.chat.tryAgain}
            </button>
          }
        />
      )
    if (closed)
      return (
        <ChatNotice
          tone="warning"
          title={t.chat.closedTitle}
          action={
            <button type="button" onClick={chat.reset} className="cursor-pointer self-start rounded-4 type-body-s text-link underline underline-offset-4 focus-ring">
              {t.chat.newChat}
            </button>
          }
        >
          {t.chat.closedBody}
        </ChatNotice>
      )
    if (notice === 'attach')
      return (
        <Dismissable onClose={() => setNotice(null)} label={t.menu.close}>
          <ChatNotice tone="info" title={t.chat.attachTitle}>
            {t.chat.attachBody}
          </ChatNotice>
        </Dismissable>
      )
    if (notice === 'voice-unsupported' || notice === 'voice-denied')
      return (
        <Dismissable onClose={() => setNotice(null)} label={t.menu.close}>
          <ChatNotice tone="warning" title={notice === 'voice-denied' ? t.chat.voiceDenied : t.chat.voiceUnsupported} />
        </Dismissable>
      )
    if (chat.view?.status === 'awaiting_confirmation')
      return (
        <ChatNotice tone="info" title={t.chat.awaitingTitle}>
          {t.chat.awaitingBody}
        </ChatNotice>
      )
    return null
  }
}

function Dismissable({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="relative pr-10">
      {children}
      <IconButton icon="close" label={label} size="sm" onClick={onClose} className="absolute -top-1 right-0" />
    </div>
  )
}

function EmptyState({ t, onPick }: { t: Copy; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <h2 className="type-section-heading">{t.chat.emptyTitle}</h2>
      <p className="mt-5 max-w-[30rem] type-body-m text-secondary">{t.chat.emptyBody}</p>
      <ul className="mt-10 flex max-w-[36rem] flex-wrap justify-center gap-2">
        {t.home.examples.slice(0, 5).map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="cursor-pointer rounded-full bg-background-tertiary px-4 py-2.5 text-left type-body-s transition-colors hover:bg-background-secondary focus-ring"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Message({ m, t, latest }: { m: ChatMessage; t: Copy; latest: boolean }) {
  const tag = m.channel === 'sms' ? t.chat.byText : m.channel === 'voice' ? t.chat.byCall : null
  if (m.role === 'user')
    return (
      <div id={latest ? 'latest' : undefined} className="flex flex-col gap-1.5 animate-[bubble-in_.4s_var(--ease-out-quint)]">
        {tag && <ChannelTag label={tag} end />}
        <UserMessage>{m.content.replace(/^\(phone call transcript\)\n/, '')}</UserMessage>
      </div>
    )
  return (
    <article id={latest ? 'latest' : undefined} tabIndex={-1} className="flex flex-col gap-4 outline-none animate-[rise_.6s_var(--ease-out-quint)]">
      {tag && <ChannelTag label={tag} />}
      <div className="text-[1.0625rem] leading-[1.65] tracking-tight [&_li]:pl-1 [&_p+p]:mt-4 [&_p+ul]:mt-3 [&_strong]:font-medium [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul+p]:mt-4">
        <Markdown text={m.content} />
      </div>
      <MessageActions m={m} t={t} />
    </article>
  )
}

function ChannelTag({ label, end }: { label: string; end?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 type-label-s text-tertiary', end ? 'self-end' : 'self-start')}>
      <Icon name="message" size={13} />
      {label}
    </span>
  )
}

function MessageActions({ m, t }: { m: ChatMessage; t: Copy }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)

  function rate(r: 'up' | 'down') {
    const next = rating === r ? null : r
    setRating(next)
    if (next) void sendFeedback({ kind: 'rating', rating: next, page: '/chat' }).catch(() => {})
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(m.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  const btn = 'size-8 text-secondary hover:text-primary'
  return (
    <div role="group" aria-label={t.chat.actions} className="-ml-1.5 flex items-center gap-0.5">
      <IconButton icon="thumb-up" label={rating === 'up' ? t.chat.removeRating : t.chat.good} aria-pressed={rating === 'up'} variant="ghost" size="sm" onClick={() => rate('up')} className={cx(btn, rating === 'up' && 'bg-background-tertiary text-primary')} />
      <IconButton icon="thumb-down" label={rating === 'down' ? t.chat.removeRating : t.chat.bad} aria-pressed={rating === 'down'} variant="ghost" size="sm" onClick={() => rate('down')} className={cx(btn, rating === 'down' && 'bg-background-tertiary text-primary')} />
      <IconButton icon={copied ? 'check' : 'copy'} label={copied ? t.chat.copied : t.chat.copy} variant="ghost" size="sm" onClick={copy} className={btn} />
      <span aria-live="polite" className="ml-2 type-label-s text-tertiary">
        {rating ? t.chat.rated : copied ? t.chat.copied : ''}
      </span>
    </div>
  )
}

// Offer one-tap answers when the agent is clearly asking about a field we
// still need. The keyword has to appear in its last message, so we never
// suggest answers to a question it didn't ask.
const asks: Record<string, RegExp> = {
  county: /county|condado/i,
  size: /how many (people|of you)|household size|cuántas personas|personas viven/i,
  childrenUnder18: /under 18|kids|children|menores de 18|hijos|niños/i,
  pregnant: /pregnan|embaraz/i,
  immigrationStatus: /immigration|inmigra|migratori/i,
  childrenAreCitizens: /citizen|ciudadan/i,
  monthlyIncome: /income|earn|make a month|ingreso|ganan?/i,
}

function suggestReplies(t: Copy, view: Omit<WebView, 'messages'>, last: string): string[] {
  if (view.status !== 'collecting' || !last.trim().endsWith('?')) return []
  const field = view.missing.find((f) => asks[f]?.test(last))
  return field ? (t.replies[field] ?? []) : []
}
