import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { AuthProvider } from './lib/auth'
import { matchRoute, useRoute } from './lib/router'
import { Landing } from './pages/Landing'
import { Screener } from './pages/Screener'
import { StaffLogin } from './pages/StaffLogin'
import { StaffDashboard } from './pages/StaffDashboard'
import { CaseDetailPage } from './pages/CaseDetailPage'
import { CountyPortal } from './pages/CountyPortal'
import KitGallery from './pages/KitGallery'
import { NotFound } from './screens/Shell'
import { Loading } from './screens/ui'

// Optional screens built by another worker. import.meta.glob resolves to {} when
// the file doesn't exist yet, so the build never breaks on a missing module.
const optional = import.meta.glob<{ default: ComponentType }>(['./features/setup/SetupWizard.tsx', './features/setup/SettingsPage.tsx'])
function optionalPage(file: string): ComponentType {
  const loader = optional[`./features/setup/${file}`]
  return loader ? lazy(loader) : () => <NotFound message="This screen isn’t available yet." />
}
const SetupWizard = optionalPage('SetupWizard.tsx')
const SettingsPage = optionalPage('SettingsPage.tsx')

function Routes() {
  const path = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])
  const caseParams = matchRoute('/staff/case/:id', path)
  if (path === '/') return <Landing />
  if (path === '/screen') return <Screener />
  if (path === '/staff/login') return <StaffLogin />
  if (path === '/staff') return <StaffDashboard />
  if (caseParams) return <CaseDetailPage id={caseParams.id} />
  if (path === '/setup') return <Suspense fallback={<Loading label="Loading setup" />}><SetupWizard /></Suspense>
  if (path === '/staff/settings') return <Suspense fallback={<Loading label="Loading settings" />}><SettingsPage /></Suspense>
  if (path === '/county') return <CountyPortal />
  if (path === '/kit') return <KitGallery />
  return <NotFound />
}

export default function App() {
  return (
    <AuthProvider>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus-ring">
        Skip to content
      </a>
      <Routes />
    </AuthProvider>
  )
}
