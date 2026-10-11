import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { ChatNotice, UserMessage } from '../components/Chat'
import { ChatComposer } from '../components/ChatComposer'
import { Markdown } from '../site/chat/Markdown'
import { useChat } from '../site/chat/useChat'
import { composerLabels } from '../site/chrome'
import { useT } from '../site/lang'

// Chat panel for the dashboard. It reuses the site chat hook and the same
// /api/chat/sessions API as /chat, so a conversation started on either page
// continues on the other. The session id is also remembered per user.

const SESSION_KEY = 'site.chat.session' // the key useChat reads from sessionStorage
const userKey = (userId: string) => `aid.chat.session.${userId}`

/** Put this user's saved chat session where useChat will find it (call before useChat mounts). */
export function seedChatSession(userId: string) {
  try {
    const saved = localStorage.getItem(userKey(userId))
    if (saved) sessionStorage.setItem(SESSION_KEY, saved)
    else sessionStorage.removeItem(SESSION_KEY)
  } catch { /* storage blocked: start a fresh chat */ }
}
export function rememberChatSession(userId: string, sessionId: string | null) {
  try {
    if (sessionId) localStorage.setItem(userKey(userId), sessionId)
    else localStorage.removeItem(userKey(userId))
  } catch { /* storage blocked */ }
}

export type DashboardChatState = ReturnType<typeof useChat>

export function ChatPanel({ chat, userId, firstName, inputRef }: {
  chat: DashboardChatState
  userId: string
  firstName: string | null
  inputRef: React.RefObject<HTMLElement | null>
}) {
  const t = useT()
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const sessionId = chat.view?.sessionId ?? null

  useEffect(() => {
    if (sessionId) rememberChatSession(userId, sessionId)
  }, [sessionId, userId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [chat.messages.length, chat.busy])

  const empty = chat.messages.length === 0 && !chat.busy && !chat.restoring
  const starters = ['I need help paying for groceries', 'Do I qualify for Medi-Cal?', 'Lower my electric bill']

  return (
    <section ref={inputRef as React.RefObject<HTMLElement>} id="chat" tabIndex={-1} aria-labelledby="chat-title" className="flex h-full min-h-0 flex-col rounded-32 border border-border-tertiary bg-background-primary outline-none">
      <div className="flex items-center justify-between gap-3 border-b border-border-tertiary px-5 py-3">
        <h2 id="chat-title" className="type-card-title">Talk to Aid</h2>
        {chat.messages.length > 0 && (
          <Button variant="ghost" size="sm" icon="refresh" className="text-secondary" onClick={() => { chat.reset(); rememberChatSession(userId, null) }}>New chat</Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" role="log" aria-live="polite" aria-label="Conversation with Aid">
        {empty && (
          <div className="flex flex-col gap-4">
            <p className="type-body-m">{firstName ? `Hi ${firstName}.` : 'Hi.'} Tell me what you need help with and I’ll find programs you may qualify for, then start the applications for you.</p>
            <ul className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => void chat.send(s)} className="cursor-pointer rounded-full bg-background-tertiary px-4 py-2.5 text-left type-body-s transition-colors hover:bg-background-secondary focus-ring">{s}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-6">
          {chat.messages.map((m) =>
            m.role === 'user' ? (
              <UserMessage key={m.id}>{m.content.replace(/^\(phone call transcript\)\n/, '')}</UserMessage>
            ) : (
              <article key={m.id} className="text-base leading-[1.6] tracking-tight [&_li]:pl-1 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_strong]:font-medium [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                <Markdown text={m.content} />
              </article>
            ),
          )}
          {chat.busy && <p className="text-shimmer type-body-m" role="status">{t.chat.thinking}…</p>}
        </div>
        <div ref={bottom} className="h-px" />
      </div>

      <div className="px-4 pt-2 pb-4">
        {chat.failed && (
          <div className="mb-3 rounded-24 bg-background-tertiary px-5 py-4">
            <ChatNotice title={t.chat.wrong} action={<button type="button" onClick={chat.retry} className="cursor-pointer self-start rounded-4 type-body-s text-link underline underline-offset-4 focus-ring">{t.chat.tryAgain}</button>} />
          </div>
        )}
        <ChatComposer variant="inline" placeholder="Ask Aid anything…" value={text} onValueChange={setText} onSubmit={(q) => void chat.send(q)} busy={chat.busy} labels={composerLabels(t)} />
      </div>
    </section>
  )
}
