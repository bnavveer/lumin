import { lazy, Suspense } from 'react'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '../account/auth'
import { ApplicationDetail, AuthPage } from '../account/pages'
import { ScreeningPage } from '../account/manage'
import { DetailsPage } from '../account/DetailsPage'
import { VaultPage } from '../account/VaultPage'
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
import { Dashboard } from '../account/Dashboard'
import { Login, Signup } from '../account/AuthPages'
import { WorkflowPage } from '../account/WorkflowPage'
import { RouterProvider, useRouter } from './router'

// The component gallery stays available at /kit for design work.
const Kit = lazy(() => import('../App'))

// Opening the confirmation link from the sign-up email signs the person in
// (Supabase reads the token from the URL). Wherever the link lands, take them
// straight to their dashboard.
function AuthLanding() {
  const { user } = useAuth()
  const { navigate, path } = useRouter()
  const [fromEmail] = useState(() => /access_token=/.test(location.hash) && /type=(signup|magiclink|invite|email)/.test(location.hash))
  useEffect(() => {
    if (fromEmail && user && path !== '/dashboard') navigate('/dashboard', { replace: true })
  }, [fromEmail, user, path, navigate])
  return null
}

function Routes() {
  const { path, navigate } = useRouter()
  // The old account pages now live on the dashboard.
  const moved = path === '/account' || path === '/applications'
  useEffect(() => {
    if (moved) navigate('/dashboard', { replace: true })
  }, [moved, navigate])
  if (path.startsWith('/workflows/')) return <WorkflowPage />
  const application = /^\/applications\/([^/]+)$/.exec(path)
  if (application) return <ApplicationDetail id={application[1]} />
  const staffCase = /^\/staff\/cases\/([^/]+)$/.exec(path)
  if (staffCase) return <StaffCase id={staffCase[1]} />
  switch (path) {
    case '/login':
      return <Login />
    case '/signup':
      return <Signup />
    case '/dashboard':
      return <Dashboard />
    case '/account/screening':
      return <ScreeningPage />
    case '/account/documents':
      return <VaultPage />
    case '/account/details':
      return <DetailsPage />
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
        <AuthProvider>
          <AuthLanding />
          <FeedbackProvider>
            <Routes />
          </FeedbackProvider>
        </AuthProvider>
      </LangProvider>
    </RouterProvider>
  )
}
