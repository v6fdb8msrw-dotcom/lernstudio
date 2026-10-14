/*
 * Volltextsuche über die Markdown-Notes des Vaults. Titeltreffer zählen mehr,
 * Concepts kommen vor sonstigen Seiten.
 */

export interface SearchDoc {
  path: string
  title: string
  text: string
  kind: 'concept' | 'subject' | 'exam' | 'source' | 'other'
  subjects: string[]
}

export function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
}

/** Markdown zu durchsuchbarem Klartext (ohne Frontmatter, Links, Zeichen). */
export function plain(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a.split('/').pop() ?? a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s*\[![^\]]+\][+-]?\s*/gm, '')
    .replace(/[#>*_`|=~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const KIND_WEIGHT: Record<SearchDoc['kind'], number> = { concept: 3, subject: 2, exam: 1, source: 0, other: 0 }

export function search(docs: SearchDoc[], query: string, subject?: string): SearchDoc[] {
  const words = terms(query)
  if (!words.length) return []
  return docs
    .filter((d) => !subject || d.subjects.includes(subject))
    .map((d) => {
      const t = d.title.toLowerCase()
      const x = d.text.toLowerCase()
      if (!words.every((w) => t.includes(w) || x.includes(w))) return null
      let s = KIND_WEIGHT[d.kind]
      for (const w of words) {
        if (t === w) s += 20
        else if (t.includes(w)) s += 8
        s += Math.min(x.split(w).length - 1, 8)
      }
      return { d, s }
    })
    .filter((r): r is { d: SearchDoc; s: number } => !!r)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.d)
}

/** Auszug rund um den ersten Treffer. */
export function hitSnippet(text: string, query: string, max = 160): string {
  const first = terms(query)[0]
  const i = first ? text.toLowerCase().indexOf(first) : -1
  if (i < 0) return text.slice(0, max)
  const start = Math.max(0, i - 50)
  return (start > 0 ? '…' : '') + text.slice(start, start + max) + (start + max < text.length ? '…' : '')
}
