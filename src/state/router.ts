import { useEffect, useState } from 'react'

/** Einfaches Hash-Routing (#/rezepte/r001?portionen=2). Funktioniert ohne Server-Konfiguration, auch auf GitHub Pages. */
export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
  /** Zeitpunkt der Navigation: gleiche Adresse nochmal aufrufen ergibt eine neue Seite (z. B. neue Mitschrift) */
  stamp: number
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(queryPart), stamp: Date.now() }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string): void {
  const target = to.startsWith('#') ? to : `#${to}`
  if (window.location.hash === target) return
  window.location.hash = target
  window.scrollTo({ top: 0 })
}

export function href(to: string): string {
  return `#${to}`
}
