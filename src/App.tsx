import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Shell } from './components/Shell'
import { Spinner } from './components/ui'
import { UiProvider } from './components/UiContext'
import { Home } from './pages/Home'
import { useRoute, type Route } from './state/router'
import { ToastProvider, useToast } from './state/toast'
import { VaultProvider } from './state/vault'

const SubjectPage = lazy(() => import('./pages/Subject'))
const NoteView = lazy(() => import('./pages/NoteView'))
const ConceptsPage = lazy(() => import('./pages/Concepts'))
const SearchPage = lazy(() => import('./pages/Search'))
const UploadPage = lazy(() => import('./pages/Upload'))
const MitschriftPage = lazy(() => import('./pages/Mitschrift'))
const TodosPage = lazy(() => import('./pages/Todos'))
const ClaudePage = lazy(() => import('./pages/Claude'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const GraphPage = lazy(() => import('./pages/Graph'))

function Page({ route }: { route: Route }) {
  switch (route.segments[0]) {
    case undefined:
      return <Home />
    case 'fach':
      return <SubjectPage route={route} />
    case 'n':
      return <NoteView key={route.path} route={route} />
    case 'begriffe':
      return <ConceptsPage route={route} />
    case 'suche':
      return <SearchPage route={route} />
    case 'hochladen':
      return <UploadPage route={route} />
    case 'mitschrift':
      return <MitschriftPage key={route.stamp} route={route} />
    case 'todos':
      return <TodosPage />
    case 'claude':
      return <ClaudePage route={route} />
    case 'einstellungen':
      return <SettingsPage />
    case 'netz':
      return <GraphPage />
    default:
      return <Home />
  }
}

/** Darf die Seite für ein Update neu laden, ohne dass Eingaben verloren gehen? */
function safeToReload(): boolean {
  if (document.querySelector('.overlay')) return false
  const el = document.activeElement
  return !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable))
}

function AppInner() {
  const route = useRoute()
  const { toast } = useToast()
  const [updateReady, setUpdateReady] = useState(false)
  const updater = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined)

  // Service Worker (nur im Build): neue Versionen werden übernommen, sobald nichts Ungespeichertes offen ist
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let registration: ServiceWorkerRegistration | undefined
    let timer: number | undefined
    let pending = false
    const apply = () => void updater.current?.(true)
    const check = () => {
      if (pending && safeToReload()) return apply()
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined)
    }
    void import('virtual:pwa-register').then(({ registerSW }) => {
      updater.current = registerSW({
        immediate: true,
        onNeedRefresh: () => {
          pending = true
          if (safeToReload()) apply()
          else setUpdateReady(true)
        },
        onOfflineReady: () => toast('Offline bereit: Der Lernstudio funktioniert jetzt auch ohne Internet'),
        onRegisteredSW: (_url, reg) => {
          registration = reg
          timer = window.setInterval(check, 30 * 60 * 1000)
        },
      })
    })
    document.addEventListener('visibilitychange', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(timer)
    }
  }, [toast])

  return (
    <UiProvider>
      <Shell route={route} updateReady={updateReady} onUpdate={() => void updater.current?.(true)}>
        <Suspense fallback={<div className="page"><Spinner /></div>}>
          <Page route={route} />
        </Suspense>
      </Shell>
    </UiProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <VaultProvider>
        <AppInner />
      </VaultProvider>
    </ToastProvider>
  )
}
