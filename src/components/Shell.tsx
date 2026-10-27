import { BookA, Home, Library, NotebookPen, Plus, RefreshCw, Search, Settings2, Sparkles, SquareCheck, Upload, Waypoints } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { href, type Route } from '../state/router'
import { useVault } from '../state/vault'
import { BrandMark } from './BrandMark'
import { SyncBadge } from './SyncBadge'
import { useUi } from './UiContext'

const NAV = [
  { path: '/', label: 'Übersicht', icon: Home },
  { path: '/begriffe', label: 'Begriffe', icon: BookA },
  { path: '/suche', label: 'Suche', icon: Search },
  { path: '/netz', label: 'Wissensnetz', icon: Waypoints },
]

const WORK = [
  { path: '/mitschrift', label: 'Mitschrift', icon: NotebookPen },
  { path: '/hochladen', label: 'Hochladen', icon: Upload },
  { path: '/todos', label: 'Todos', icon: SquareCheck },
  { path: '/claude', label: 'Claude', icon: Sparkles },
]

/** Unten am Handy: die fünf wichtigsten Ziele. */
const TABS = [
  { path: '/', label: 'Übersicht', icon: Home },
  { path: '/begriffe', label: 'Begriffe', icon: BookA },
  { path: '/suche', label: 'Suche', icon: Search },
  { path: '/todos', label: 'Todos', icon: SquareCheck },
  { path: '/claude', label: 'Claude', icon: Sparkles },
]

function isActive(route: Route, path: string): boolean {
  return path === '/' ? route.segments.length === 0 : route.path.startsWith(path)
}

/**
 * App-Rahmen wie eine Bibliothek: links die Seitenleiste mit Bereichen und Fächern (Buchrücken),
 * am Handy oben eine schmale Kopfzeile und unten die Tab-Leiste.
 */
export function Shell({ route, children, updateReady, onUpdate }: { route: Route; children: ReactNode; updateReady: boolean; onUpdate: () => void }) {
  const { openQuick } = useUi()
  const { model } = useVault()
  const subjects = model.subjects.filter((s) => s.active && !s.slug.startsWith('beispiel-fach'))
  const sem = model.semester
  const hideFab = route.segments[0] === 'einstellungen' || route.segments[0] === 'mitschrift'

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navigation">
        <a className="brand" href={href('/')}>
          <span className="brand-mark">
            <BrandMark size={26} />
          </span>
          <span>
            <span className="brand-name">Lernstudio</span>
            <span className="brand-sub">{sem ? `Semester ${sem.name}` : 'Uni-Vault'}</span>
          </span>
        </a>

        <nav className="side-nav">
          {NAV.map((it) => (
            <a key={it.path} href={href(it.path)} aria-current={isActive(route, it.path) ? 'page' : undefined}>
              <it.icon size={17} strokeWidth={1.7} />
              {it.label}
            </a>
          ))}
        </nav>

        {subjects.length > 0 && (
          <div className="side-group">
            <div className="side-label">
              <Library size={13} /> Fächer
            </div>
            <nav className="side-subjects">
              {subjects.map((s) => (
                <a key={s.slug} href={href(`/fach/${s.slug}`)} style={{ '--c': s.color } as CSSProperties} aria-current={route.path.startsWith(`/fach/${s.slug}`) ? 'page' : undefined}>
                  <span className="spine-dot" />
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        )}

        <div className="side-group">
          <div className="side-label">Arbeiten</div>
          <nav className="side-nav">
            {WORK.map((it) => (
              <a key={it.path} href={href(it.path)} aria-current={isActive(route, it.path) ? 'page' : undefined}>
                <it.icon size={17} strokeWidth={1.7} />
                {it.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="side-foot">
          <SyncBadge />
          <a className="side-settings" href={href('/einstellungen')} aria-current={route.segments[0] === 'einstellungen' ? 'page' : undefined}>
            <Settings2 size={16} strokeWidth={1.7} /> Einstellungen
          </a>
        </div>
      </aside>

      <header className="topbar">
        <a className="brand" href={href('/')}>
          <span className="brand-mark sm">
            <BrandMark size={20} />
          </span>
          <span className="brand-name">Lernstudio</span>
        </a>
        <div className="topbar-actions">
          <SyncBadge compact />
          <a className="btn btn-icon" href={href('/einstellungen')} aria-label="Einstellungen">
            <Settings2 size={18} />
          </a>
        </div>
      </header>

      <main className="main">
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

      <nav className="tabbar" aria-label="Bereiche">
        {TABS.map((it) => (
          <a key={it.path} href={href(it.path)} aria-current={isActive(route, it.path) ? 'page' : undefined}>
            <it.icon size={20} strokeWidth={1.7} />
            <span>{it.label}</span>
          </a>
        ))}
      </nav>

      {!hideFab && (
        <button type="button" className="fab" onClick={openQuick} aria-label="Neu: Hochladen, Mitschrift, Todo">
          <Plus size={24} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
