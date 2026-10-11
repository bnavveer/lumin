import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { copies, type Copy, type Lang } from './copy'

// Language comes from ?lang=, then the last choice, then the browser.
// america.gov does the same with en/es/fr; we support English and Spanish.

const KEY = 'site.lang'

function initial(): Lang {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'es') return q
  const saved = localStorage.getItem(KEY)
  if (saved === 'en' || saved === 'es') return saved
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

const LangContext = createContext<{ lang: Lang; t: Copy; setLang: (l: Lang) => void } | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initial)
  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem(KEY, lang)
  }, [lang])
  return <LangContext.Provider value={{ lang, t: copies[lang], setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  const v = useContext(LangContext)
  if (!v) throw new Error('useLang outside LangProvider')
  return v
}

export const useT = () => useLang().t
