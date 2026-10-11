import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

// Tiny history router. america.gov is a multi-page Astro site that uses
// view transitions between pages; we do the same with
// document.startViewTransition so the logo and Menu button stay put.

type Nav = { path: string; hash: string; search: string; navigate: (to: string, opts?: { replace?: boolean }) => void }

const RouterContext = createContext<Nav | null>(null)

function read() {
  return { path: location.pathname.replace(/\/+$/, '') || '/', hash: location.hash, search: location.search }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(read)

  useEffect(() => {
    const onPop = () => transition(() => setLoc(read()))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = new URL(to, location.href)
    const samePage = url.pathname === location.pathname && url.search === location.search
    history[opts?.replace ? 'replaceState' : 'pushState'](null, '', url)
    if (samePage && url.hash) {
      setLoc(read())
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    transition(() => {
      setLoc(read())
      if (url.hash) requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView())
      else scrollTo(0, 0)
    })
  }, [])

  return <RouterContext.Provider value={{ ...loc, navigate }}>{children}</RouterContext.Provider>
}

function transition(update: () => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduced) return update()
  document.startViewTransition(() => flushSync(update))
}

export function useRouter() {
  const r = useContext(RouterContext)
  if (!r) throw new Error('useRouter outside RouterProvider')
  return r
}

// Internal links go through the router; anything with a scheme opens normally.
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useRouter()
  const internal = href.startsWith('/') || href.startsWith('#')
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (!internal || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={handle} {...(internal ? {} : { target: '_blank', rel: 'noreferrer' })} {...props} />
}
