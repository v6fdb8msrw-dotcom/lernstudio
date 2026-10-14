import { ArrowLeft, BookA, Plus, RefreshCw, Search, Settings2, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { href, type Route } from '../state/router'
import { BrandMark } from './BrandMark'
import { SyncBadge } from './SyncBadge'
import { useUi } from './UiContext'

const NAV = [
  { path: '/begriffe', label: 'Begriffe', icon: BookA },
  { path: '/suche', label: 'Suche', icon: Search },
  { path: '/hochladen', label: 'Hochladen', icon: Upload },
  { path: '/claude', label: 'Claude', icon: Sparkles },
]

/**
 * App-Rahmen wie bei Muscle Studio: Die Startseite ist die Übersicht mit großen Feldern.
 * Unterseiten bekommen eine schlanke Leiste mit „Übersicht“, den Bereichen und den Einstellungen.
 */
export function Shell({ route, children, updateReady, onUpdate }: { route: Route; children: ReactNode; updateReady: boolean; onUpdate: () => void }) {
  const { openQuick } = useUi()
  const isHome = route.segments.length === 0
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2
  }, [route.path])

  return (
    <div className={`app ${isHome ? 'is-home' : ''}`}>
      {!isHome && (
        <header className="appbar">
          <div className="appbar-row">
            <a className="appbar-back" href={href('/')} aria-label="Zur Übersicht">
              <ArrowLeft size={18} />
              <span className="brand-mark sm">
                <BrandMark size={17} />
              </span>
              <span className="appbar-label">Übersicht</span>
            </a>
            <nav className="area-nav" aria-label="Bereiche" ref={navRef}>
              {NAV.map((it) => (
                <a key={it.path} href={href(it.path)} aria-current={route.path.startsWith(it.path) ? 'page' : undefined}>
                  <it.icon size={15} strokeWidth={1.9} />
                  {it.label}
                </a>
              ))}
            </nav>
            <div className="appbar-actions">
              <SyncBadge compact />
              <a className="btn btn-icon" href={href('/einstellungen')} aria-label="Einstellungen" aria-current={route.segments[0] === 'einstellungen' ? 'page' : undefined}>
                <Settings2 size={18} />
              </a>
            </div>
          </div>
        </header>
      )}

      <main className={isHome ? 'main main-home' : 'main'}>
        {updateReady && (
          <div className="notice beige update-banner">
            <RefreshCw size={17} />
            <div style={{ flex: 1 }}>Eine neue Version vom Lernstudio ist bereit.</div>
            <button type="button" className="btn btn-sm btn-dark" onClick={onUpdate}>
              Aktualisieren
            </button>
          </div>
        )}
        <div key={route.path}>{children}</div>
      </main>

      {route.segments[0] !== 'einstellungen' && route.segments[0] !== 'mitschrift' && (
        <button type="button" className="fab" onClick={openQuick} aria-label="Neu: Hochladen, Mitschrift, Todo">
          <Plus size={26} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}
