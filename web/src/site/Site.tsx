import { lazy, Suspense } from 'react'
import { AuthProvider } from '../account/auth'
import { ApplicationDetail, AuthPage, Dashboard } from '../account/pages'
import { DocumentsPage, ScreeningPage } from '../account/manage'
import { StaffCase, StaffDashboard } from '../staff/pages'
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
  const application = /^\/applications\/([^/]+)$/.exec(path)
  if (application) return <ApplicationDetail id={application[1]} />
  const staffCase = /^\/staff\/cases\/([^/]+)$/.exec(path)
  if (staffCase) return <StaffCase id={staffCase[1]} />
  switch (path) {
    case '/login':
      return <AuthPage />
    case '/signup':
      return <AuthPage signup />
    case '/account':
    case '/applications':
      return <Dashboard />
    case '/account/screening':
      return <ScreeningPage />
    case '/account/documents':
      return <DocumentsPage />
    case '/staff/login':
      return <AuthPage staff />
    case '/staff':
      return <StaffDashboard />
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
          <AuthProvider><Routes /></AuthProvider>
        </FeedbackProvider>
      </LangProvider>
    </RouterProvider>
  )
}
