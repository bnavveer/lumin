import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workflow } from '../../../shared/workflow'
import type { Api } from './api'
import { fixturesOn } from './fixtureFlag'

// Keeps one workflow fresh.
//  1. Initial GET /api/workflows/:id.
//  2. EventSource on /events. EventSource cannot send an Authorization header,
//     so against the current backend it is rejected (401) and closes. If the
//     backend later accepts a token in the query string, add it to the URL
//     below and the stream starts working with no other change.
//  3. Polling GET every 3s while the tab is visible. This is the reliable
//     path today, and it keeps running as the fallback even when SSE is up.

const POLL_MS = 3000

export function useWorkflow(api: Api, id: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lastKey = useRef('')

  const apply = useCallback((w: Workflow) => {
    const key = JSON.stringify(w)
    if (key === lastKey.current) return
    lastKey.current = key
    setWorkflow(w)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      apply(await api.getWorkflow(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this application.')
    } finally {
      setLoading(false)
    }
  }, [api, id, apply])

  useEffect(() => {
    lastKey.current = ''
    setWorkflow(null)
    void load()
  }, [load])

  useEffect(() => {
    if (!workflow || fixturesOn()) return
    let es: EventSource | null = null
    try {
      es = new EventSource(`/api/workflows/${encodeURIComponent(id)}/events`)
      es.addEventListener('update', (ev) => {
        try { apply(JSON.parse((ev as MessageEvent<string>).data) as Workflow) } catch { /* ignore a bad frame */ }
      })
      es.onerror = () => { es?.close(); es = null } // polling carries on
    } catch { /* no EventSource: polling only */ }
    return () => es?.close()
    // Subscribe once per workflow id (not per update).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, workflow === null])

  useEffect(() => {
    if (!workflow || fixturesOn()) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      api.getWorkflow(id).then(apply).catch(() => {}) // transient errors: keep the last good state
    }, POLL_MS)
    return () => clearInterval(t)
  }, [api, id, apply, workflow === null]) // eslint-disable-line react-hooks/exhaustive-deps

  return { workflow, error, loading, reload: load, replace: apply }
}
