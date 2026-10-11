import { useEffect, useState, type AnchorHTMLAttributes } from 'react'

// Tiny hash router: "#/staff/case/abc" -> "/staff/case/abc".
function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  const path = h.split('?')[0]
  return path.startsWith('/') ? path : '/'
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => setPath(currentPath())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function navigate(to: string) {
  window.location.hash = to
  window.scrollTo(0, 0)
}

export function Link({ to, ...props }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a href={`#${to}`} {...props} />
}

// Returns the params for a pattern like "/staff/case/:id", or null.
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/')
  const s = path.split('/')
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

// In-page section links on the landing page (hash is taken by the router).
export function goSection(id: string) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  if (currentPath() === '/') scroll()
  else {
    navigate('/')
    setTimeout(scroll, 120)
  }
}
