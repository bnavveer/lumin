import { useEffect, useRef, useState, type RefObject } from 'react'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

/** True once the element has scrolled into view (or every time, with `once: false`). */
export function useInView<T extends Element>(opts: { once?: boolean; margin?: string; threshold?: number } = {}): [RefObject<T | null>, boolean] {
  const { once = true, margin = '0px 0px -10% 0px', threshold = 0 } = opts
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) setInView(false)
      },
      { rootMargin: margin, threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, margin, threshold])
  return [ref, inView]
}

/** Steps through `count` frames every `ms` while `playing` and on screen. */
export function useAutoStep(count: number, ms: number, playing: boolean, visible = true) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!playing || !visible || count < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % count), ms)
    return () => clearInterval(t)
  }, [count, ms, playing, visible])
  return [i, setI] as const
}

/** Autoplay that starts paused for people who asked for less motion. */
export function usePlaying() {
  const reduced = useReducedMotion()
  const [playing, setPlaying] = useState(!reduced)
  useEffect(() => setPlaying(!reduced), [reduced])
  return [playing, setPlaying] as const
}
