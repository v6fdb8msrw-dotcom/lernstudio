import { useEffect, useRef } from 'react'
import { useVault } from '../state/vault'
import { useRendered } from './hooks'

/** Zeigt eine Vault-Note als HTML. Eingebettete Bilder werden aus dem Vault nachgeladen. */
export function Markdown({ text, path, className = '' }: { text: string; path?: string; className?: string }) {
  const html = useRendered(text, path)
  const ref = useRef<HTMLDivElement>(null)
  const vault = useVault()
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let alive = true
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[data-vault]'))) {
      const p = img.dataset.vault!
      img.classList.add('loading')
      vault
        .fileUrl(p)
        .then((url) => {
          if (!alive) return
          img.classList.remove('loading')
          if (url) img.src = url
          else img.classList.add('missing')
        })
        .catch(() => alive && img.classList.add('missing'))
    }
    return () => {
      alive = false
    }
  }, [html, vault])
  return <div ref={ref} className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
