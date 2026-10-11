import { useCallback, useEffect, useRef, useState } from 'react'

export type Polled<T> = {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => void
}

// Loads on mount, then every `ms`. Keeps old data visible if a refresh fails.
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []): Polled<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const d = await fnRef.current()
      if (!alive.current) return
      setData(d)
      setError(null)
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    void load()
    const t = setInterval(() => void load(), ms)
    return () => {
      alive.current = false
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, load, ...deps])

  return { data, error, loading, refresh: () => void load() }
}
