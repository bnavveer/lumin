import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerMessage, WebView } from '../../../../shared/chat'
export type { ServerMessage, WebView } from '../../../../shared/chat'

// Client for the website chat API in ../../../../src/chatApi.ts:
//   POST /api/chat/sessions               -> { sessionId }
//   POST /api/chat/sessions/:id/messages  { text } -> { reply, view }
//   GET  /api/chat/sessions/:id           -> view
// The server thread is the source of truth. After a confirmation text goes
// out we poll it, because the YES and the eligibility answer arrive by text.

export type { Channel, IntakeStatus } from '../../../../shared/chat'
export type ChatMessage = ServerMessage & { id: string; local?: boolean }

const KEY = 'site.chat.session'
const POLL_MS = 5000

class ApiError extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/chat${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new ApiError(`${res.status}`)
  return res.json() as Promise<T>
}

const withIds = (ms: ServerMessage[]): ChatMessage[] => ms.map((m, i) => ({ ...m, id: `${i}-${m.at}` }))

export function useChat() {
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(KEY))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [view, setView] = useState<Omit<WebView, 'messages'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null) // text of the message that didn't go through
  const [restoring, setRestoring] = useState(() => Boolean(sessionStorage.getItem(KEY)))
  const sending = useRef(false)
  const generation = useRef(0)
  const revision = useRef(0) // discard reads that began before a newer send/read/reset

  const apply = useCallback((v: WebView) => {
    const { messages: ms, ...rest } = v
    setView(rest)
    setMessages(withIds(ms))
  }, [])

  // Pick the conversation back up after a reload in the same tab.
  useEffect(() => {
    if (!sessionId) return
    let live = true
    const current = generation.current
    const read = ++revision.current
    api<WebView>(`/sessions/${sessionId}`)
      .then((v) => live && current === generation.current && read === revision.current && apply(v))
      .catch(() => {})
      .finally(() => live && current === generation.current && setRestoring(false))
    return () => {
      live = false
    }
    // Only on mount: later changes to sessionId come from send(), which already has the view.
  }, [])

  const ensureSession = useCallback(async (current: number) => {
    if (sessionId) return sessionId
    const { sessionId: id } = await api<{ sessionId: string }>('/sessions', { method: 'POST' })
    if (current !== generation.current) throw new ApiError('Chat reset')
    sessionStorage.setItem(KEY, id)
    setSessionId(id)
    return id
  }, [sessionId])

  const send = useCallback(
    async (text: string) => {
      const body = text.trim()
      if (!body || sending.current) return
      const current = generation.current
      revision.current += 1
      sending.current = true
      setFailed(null)
      setBusy(true)
      const local: ChatMessage = { id: `local-${Date.now()}`, channel: 'web', role: 'user', content: body, at: new Date().toISOString(), local: true }
      setMessages((ms) => [...ms.filter((m) => !(m.local && m.content === body)), local])
      try {
        const id = await ensureSession(current)
        const res = await api<{ reply: string; view: WebView }>(`/sessions/${id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: body }),
        })
        if (current === generation.current) apply(res.view)
      } catch {
        if (current === generation.current) setFailed(body)
      } finally {
        if (current === generation.current) {
          sending.current = false
          setBusy(false)
        }
      }
    },
    [apply, ensureSession],
  )

  const retry = useCallback(() => {
    if (failed) void send(failed)
  }, [failed, send])

  const reset = useCallback(() => {
    generation.current += 1
    revision.current += 1
    sending.current = false
    setBusy(false)
    setRestoring(false)
    sessionStorage.removeItem(KEY)
    setSessionId(null)
    setMessages([])
    setView(null)
    setFailed(null)
  }, [])

  // While a confirmation text is out (or the chat is linked to a phone),
  // replies can arrive by text. Poll for them, but only while the tab is visible.
  const shouldPoll = Boolean(sessionId && view && (view.status === 'awaiting_confirmation' || view.linked))
  useEffect(() => {
    if (!shouldPoll || !sessionId) return
    let live = true
    const current = generation.current
    const tick = () => {
      if (document.visibilityState !== 'visible' || sending.current) return
      const read = ++revision.current
      api<WebView>(`/sessions/${sessionId}`)
        .then((v) => live && current === generation.current && read === revision.current && !sending.current && apply(v))
        .catch(() => {})
    }
    const t = setInterval(tick, POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [shouldPoll, sessionId, apply])

  return { sessionId, messages, view, busy, failed, restoring, send, retry, reset }
}

// A question typed on another page (home hero, the docked box, the FAQ)
// waits here until the chat page mounts and sends it.
let pending: string | null = null
export const setPendingQuestion = (q: string) => {
  pending = q
}
export const takePendingQuestion = () => {
  const q = pending
  pending = null
  return q
}

// The paperclip on the home page opens the chat with the upload notice.
let attach = false
export const setPendingAttach = () => {
  attach = true
}
export const takePendingAttach = () => {
  const a = attach
  attach = false
  return a
}
