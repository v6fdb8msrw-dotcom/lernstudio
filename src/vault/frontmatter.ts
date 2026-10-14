import { parse, parseDocument } from 'yaml'

export interface Parsed<T = Record<string, unknown>> {
  data: T
  body: string
  /** Rohtext des Frontmatters (ohne ---) */
  raw: string
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Frontmatter (YAML zwischen ---) und Inhalt trennen. Fehlerhaftes YAML ergibt ein leeres Objekt. */
export function splitFrontmatter(text: string): Parsed {
  const m = text.match(FM)
  if (!m) return { data: {}, body: text, raw: '' }
  let data: Record<string, unknown> = {}
  try {
    const v = parse(m[1])
    if (v && typeof v === 'object' && !Array.isArray(v)) data = v as Record<string, unknown>
  } catch {
    data = {}
  }
  return { data, body: text.slice(m[0].length), raw: m[1] }
}

/** Ein Feld als Liste lesen (Frontmatter erlaubt `a` oder `[a, b]`). */
export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

/** Datumsfeld als JJJJ-MM-TT (yaml liefert Daten manchmal als Date). */
export function asDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?/.test(v.trim())) return v.trim().slice(0, 10)
  return undefined
}

/**
 * Frontmatter gezielt ändern, ohne Kommentare und Formatierung des restlichen Blocks zu verlieren
 * (wichtig für todos.md: dort stehen Format-Kommentare, die Claude braucht).
 */
export function editFrontmatter(text: string, change: (doc: ReturnType<typeof parseDocument>) => void): string {
  const m = text.match(FM)
  if (!m) return text
  const doc = parseDocument(m[1])
  change(doc)
  const yaml = doc.toString({ lineWidth: 0 }).replace(/\n$/, '')
  return `---\n${yaml}\n---\n${text.slice(m[0].length)}`
}
