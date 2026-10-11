import { lazy, Suspense } from 'react'
import { FeedbackProvider } from './feedback'
import { LangProvider } from './lang'
import { About } from './pages/About'
import { Chat } from './pages/Chat'
import { ComingSoon } from './pages/ComingSoon'
import { Faq } from './pages/Faq'
import { Home } from './pages/Home'
import { HowItWorks } from './pages/HowItWorks'
import { Legal, NotFound } from './pages/Legal'
import { Privacy } from './pages/Privacy'
import { RouterProvider, useRouter } from './router'

// The component gallery stays available at /kit for design work.
const Kit = lazy(() => import('../App'))

function Routes() {
  const { path } = useRouter()
  switch (path) {
    case '/':
      return <Home />
    case '/chat':
      return <Chat />
    case '/how-it-works':
      return <HowItWorks />
    case '/privacy':
      return <Privacy />
    case '/about':
      return <About />
    case '/coming-soon':
      return <ComingSoon />
    case '/faq':
      return <Faq />
    case '/privacy-policy':
      return <Legal which="privacy" />
    case '/terms':
      return <Legal which="terms" />
    case '/kit':
      return (
        <Suspense fallback={null}>
          <Kit />
        </Suspense>
      )
    default:
      return <NotFound />
  }
}

export function Site() {
  return (
    <RouterProvider>
      <LangProvider>
        <FeedbackProvider>
          <Routes />
        </FeedbackProvider>
      </LangProvider>
    </RouterProvider>
  )
}
