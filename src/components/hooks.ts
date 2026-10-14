import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../state/vault'
import { renderMarkdown } from '../vault/markdown'
import { resolveLink } from '../vault/model'

export function useIsMobile(): boolean {
  const query = '(max-width: 760px)'
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

/** Uhrzeit, die sich regelmäßig aktualisiert. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Text einer Vault-Datei (lädt bei Bedarf nach). */
export function useVaultText(path: string | undefined): { text?: string; loading: boolean; error?: string } {
  const vault = useVault()
  const now = path ? vault.textNow(path) : undefined
  const [state, setState] = useState<{ path?: string; text?: string; error?: string }>({})
  useEffect(() => {
    if (!path || now !== undefined) return
    let alive = true
    vault
      .text(path)
      .then((t) => alive && setState({ path, text: t, error: t === undefined ? 'Datei nicht gefunden' : undefined }))
      .catch((e) => alive && setState({ path, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      alive = false
    }
  }, [path, now, vault])
  if (!path) return { loading: false }
  if (now !== undefined) return { text: now, loading: false }
  if (state.path !== path) return { loading: true }
  return { text: state.text, loading: false, error: state.error }
}

/** Markdown aus dem Vault als HTML (Wikilinks aufgelöst). */
export function useRendered(markdown: string | undefined, notePath?: string): string {
  const { model } = useVault()
  return useMemo(() => {
    if (markdown === undefined) return ''
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
    return renderMarkdown(body, { resolve: (t) => resolveLink(model, t), notePath })
  }, [markdown, model, notePath])
}

/** Objekt-URL einer Vault-Datei (Bild, PDF …). */
export function useFileUrl(path: string | undefined): { url?: string; error?: boolean } {
  const vault = useVault()
  const [state, setState] = useState<{ path?: string; url?: string; error?: boolean }>({})
  useEffect(() => {
    if (!path) return
    let alive = true
    vault
      .fileUrl(path)
      .then((url) => alive && setState({ path, url, error: !url }))
      .catch(() => alive && setState({ path, error: true }))
    return () => {
      alive = false
    }
  }, [path, vault])
  return state.path === path ? state : {}
}
