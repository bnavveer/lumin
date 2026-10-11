import { useEffect, useRef } from 'react'
import { getSupabase } from './supabase'

export const REALTIME_TABLES = ['messages', 'timeline', 'calls', 'submissions'] as const

// Calls onChange whenever any of the tables changes. No-op if Supabase is unavailable.
export function useRealtime(tables: readonly string[], onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = tables.join(',')
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Coalesce bursts of events into one refresh.
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 250)
    }
    getSupabase().then((sb) => {
      if (!sb || cancelled) return
      let ch = sb.channel(`aid-rt-${key}-${Math.random().toString(36).slice(2, 8)}`)
      for (const t of key.split(',').filter(Boolean)) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, fire)
      }
      ch.subscribe()
      cleanup = () => {
        void sb.removeChannel(ch)
      }
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      cleanup?.()
    }
  }, [key])
}
