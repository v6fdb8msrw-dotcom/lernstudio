import { splitFrontmatter } from './frontmatter'

/*
 * Die Graph-Ansicht aus Obsidian: jede Notiz ist ein Knoten, jeder Link (Wikilink, Einbettung, Markdown-Link,
 * Link in den Eigenschaften) eine Kante. Was angezeigt wird, steht in .obsidian/graph.json – dieselbe Datei,
 * die Obsidian schreibt, wenn du dort Filter, Gruppen, Anzeige oder Kräfte änderst.
 */

export interface GraphSettings {
  search: string
  showTags: boolean
  showAttachments: boolean
  hideUnresolved: boolean
  showOrphans: boolean
  colorGroups: { query: string; color: string }[]
  centerStrength: number
  repelStrength: number
  linkStrength: number
  linkDistance: number
  nodeSizeMultiplier: number
  lineSizeMultiplier: number
  textFadeMultiplier: number
  showArrow: boolean
}

/** Obsidians Standardwerte, falls graph.json fehlt oder ein Feld nicht gesetzt ist. */
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  search: '',
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  colorGroups: [],
  centerStrength: 0.518713248970312,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  textFadeMultiplier: 0,
  showArrow: false,
}

export type GraphNodeKind = 'file' | 'unresolved' | 'attachment' | 'tag'

export interface GraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  /** Farbe aus einer Farbgruppe */
  color?: string
  /** Anzahl Links (ein- und ausgehend), bestimmt die Größe wie in Obsidian */
  weight: number
  /** Feste Größe aus der Eigenschaft node_size (Plugin „Uni Hub Size“), statt der Linkanzahl */
  size?: number
  /** Adresse in der App (fehlt bei unaufgelösten Links und Tags) */
  to?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: { a: number; b: number }[]
  settings: GraphSettings
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

export function parseGraphSettings(json: string | undefined): GraphSettings {
  const d = DEFAULT_GRAPH_SETTINGS
  let raw: Record<string, unknown> = {}
  try {
    raw = json ? (JSON.parse(json) as Record<string, unknown>) : {}
  } catch {
    raw = {}
  }
  const groups = Array.isArray(raw.colorGroups) ? raw.colorGroups : []
  return {
    search: typeof raw.search === 'string' ? raw.search : d.search,
    showTags: bool(raw.showTags, d.showTags),
    showAttachments: bool(raw.showAttachments, d.showAttachments),
    hideUnresolved: bool(raw.hideUnresolved, d.hideUnresolved),
    showOrphans: bool(raw.showOrphans, d.showOrphans),
    colorGroups: groups
      .filter((g): g is { query: string; color: { rgb: number } } => !!g && typeof g.query === 'string' && typeof g.color?.rgb === 'number')
      .map((g) => ({ query: g.query, color: `#${g.color.rgb.toString(16).padStart(6, '0')}` })),
    centerStrength: num(raw.centerStrength, d.centerStrength),
    repelStrength: num(raw.repelStrength, d.repelStrength),
    linkStrength: num(raw.linkStrength, d.linkStrength),
    linkDistance: num(raw.linkDistance, d.linkDistance),
    nodeSizeMultiplier: num(raw.nodeSizeMultiplier, d.nodeSizeMultiplier),
    lineSizeMultiplier: num(raw.lineSizeMultiplier, d.lineSizeMultiplier),
    textFadeMultiplier: num(raw.textFadeMultiplier, d.textFadeMultiplier),
    showArrow: bool(raw.showArrow, d.showArrow),
  }
}

// ── Obsidian-Suche (die Teile, die in Graph-Filtern und Farbgruppen vorkommen) ──

interface FileInfo {
  path: string
  name: string
  text: string
  props: Record<string, unknown>
  tags: string[]
}

type Term = { neg: boolean; test: (f: FileInfo) => boolean }

function tokens(query: string): string[] {
  return query.match(/-?(?:\[[^\]]*\]|[a-z-]+:"[^"]*"|"[^"]*"|\S+)/gi) ?? []
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1')

function term(tok: string): Term {
  const neg = tok.startsWith('-') && tok.length > 1
  const t = neg ? tok.slice(1) : tok
  const prop = t.match(/^\[([^:\]]+)(?::(.*))?\]$/)
  if (prop) {
    const key = prop[1].trim().toLowerCase()
    const want = prop[2] === undefined ? undefined : unquote(prop[2].trim()).toLowerCase()
    return {
      neg,
      test: (f) => {
        const entry = Object.entries(f.props).find(([k]) => k.toLowerCase() === key)
        if (!entry) return false
        if (want === undefined) return true
        const vals = Array.isArray(entry[1]) ? entry[1] : [entry[1]]
        return vals.some((v) => String(v).toLowerCase() === want || String(v).toLowerCase().includes(want))
      },
    }
  }
  const op = t.match(/^([a-z-]+):(.*)$/i)
  const value = unquote(op ? op[2] : t).toLowerCase()
  if (op) {
    switch (op[1].toLowerCase()) {
      case 'path':
        return { neg, test: (f) => f.path.toLowerCase().includes(value) }
      case 'file':
        return { neg, test: (f) => f.name.toLowerCase().includes(value) }
      case 'tag': {
        const tag = value.replace(/^#/, '')
        return { neg, test: (f) => f.tags.some((x) => x === tag || x.startsWith(`${tag}/`)) }
      }
      case 'content':
        return { neg, test: (f) => f.text.toLowerCase().includes(value) }
    }
  }
  return { neg, test: (f) => f.name.toLowerCase().includes(value) || f.text.toLowerCase().includes(value) }
}

/** Obsidian-Suche: Begriffe mit Leerzeichen müssen alle passen, „OR“ trennt Alternativen. */
export function matcher(query: string): (f: FileInfo) => boolean {
  const alternatives = query
    .trim()
    .split(/\s+OR\s+/)
    .map((part) => tokens(part).map(term))
    .filter((terms) => terms.length)
  if (!alternatives.length) return () => true
  return (f) => alternatives.some((terms) => terms.every((t) => t.test(f) !== t.neg))
}

// ── Links wie Obsidian sie zählt ──

const CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g
const WIKI = /!?\[\[([^\]|#^\n]*)(?:[#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g
const MDLINK = /!?\[[^\]\n]*\]\(<?([^)<>\s]+)>?(?:\s+"[^"]*")?\)/g
const INLINE_TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu

function linksOf(text: string): string[] {
  const clean = text.replace(CODE, '')
  const out: string[] = []
  // In Tabellen steht der Alias-Trenner als \| – der Backslash gehört nicht zum Ziel
  for (const m of clean.matchAll(WIKI)) if (m[1].replace(/\\$/, '').trim()) out.push(m[1].replace(/\\$/, '').trim())
  for (const m of clean.matchAll(MDLINK)) {
    const target = m[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue
    try {
      out.push(decodeURIComponent(target.split('#')[0]))
    } catch {
      out.push(target.split('#')[0])
    }
  }
  return out
}

function tagsOf(text: string, props: Record<string, unknown>): string[] {
  const fm = props.tags ?? props.tag
  const list = (Array.isArray(fm) ? fm : typeof fm === 'string' ? fm.split(/[\s,]+/) : []).map((t) => String(t).replace(/^#/, '').toLowerCase()).filter(Boolean)
  for (const m of text.replace(CODE, '').matchAll(INLINE_TAG)) list.push(m[1].toLowerCase())
  return [...new Set(list)]
}

/** Ist ein Plugin aktiv, das Knoten per node_size vergrößert (unser „Uni Hub Size“ oder „Custom Node Size“)? */
function hubSizePlugin(json: string | undefined): boolean {
  try {
    const list: unknown = JSON.parse(json ?? '[]')
    return Array.isArray(list) && list.some((id) => id === 'uni-hub-size' || id === 'custom-node-size')
  } catch {
    return false
  }
}

const stem = (path: string) => (path.split('/').pop() ?? path).replace(/\.md$/i, '')

export function buildGraph(input: {
  /** alle Dateien im Vault */
  paths: string[]
  texts: Map<string, string>
  resolve: (target: string) => string | undefined
  settingsJson?: string
  /** .obsidian/community-plugins.json: welche Plugins in Obsidian aktiv sind */
  pluginsJson?: string
}): Graph {
  const settings = parseGraphSettings(input.settingsJson)
  const sized = hubSizePlugin(input.pluginsJson)
  const { texts, resolve } = input
  const notes = input.paths.filter((p) => p.toLowerCase().endsWith('.md') && !p.startsWith('.'))
  const info = new Map<string, FileInfo>()
  for (const p of notes) {
    const text = texts.get(p) ?? ''
    const { data } = splitFrontmatter(text)
    info.set(p, { path: p, name: (p.split('/').pop() ?? p), text, props: data, tags: tagsOf(text, data) })
  }

  const visible = matcher(settings.search)
  const groups = settings.colorGroups.map((g) => ({ test: matcher(g.query), color: g.color }))

  const nodes: GraphNode[] = []
  const index = new Map<string, number>()
  const add = (n: Omit<GraphNode, 'weight'>) => {
    let i = index.get(n.id)
    if (i === undefined) {
      i = nodes.length
      index.set(n.id, i)
      nodes.push({ ...n, weight: 0 })
    }
    return i
  }
  for (const p of notes) {
    const f = info.get(p)!
    if (!visible(f)) continue
    const size = sized ? Number(f.props.node_size) : NaN
    add({ id: p, label: stem(p), kind: 'file', color: groups.find((g) => g.test(f))?.color, to: `/n/${encodeURIComponent(p)}`, ...(size > 0 ? { size } : {}) })
  }

  const edges: { a: number; b: number }[] = []
  const seen = new Set<string>()
  const connect = (a: number, b: number) => {
    if (a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ a, b })
    nodes[a].weight++
    nodes[b].weight++
  }

  for (const p of notes) {
    const from = index.get(p)
    if (from === undefined) continue
    const f = info.get(p)!
    for (const target of linksOf(f.text)) {
      const path = resolve(target)
      if (path && path.toLowerCase().endsWith('.md')) {
        const to = index.get(path)
        if (to !== undefined) connect(from, to)
      } else if (path) {
        if (!settings.showAttachments || !visible({ path, name: path.split('/').pop() ?? path, text: '', props: {}, tags: [] })) continue
        connect(from, add({ id: path, label: path.split('/').pop() ?? path, kind: 'attachment', to: `/n/${encodeURIComponent(path)}` }))
      } else if (!settings.hideUnresolved) {
        const label = target.split('/').pop()!.replace(/\.md$/i, '')
        connect(from, add({ id: `?${target.toLowerCase()}`, label, kind: 'unresolved' }))
      }
    }
    if (settings.showTags) for (const t of f.tags) connect(from, add({ id: `#${t}`, label: `#${t}`, kind: 'tag', to: `/suche?q=${encodeURIComponent(`#${t}`)}` }))
  }

  if (settings.showOrphans) return { nodes, edges, settings }
  // Waisen (ohne Verbindung) ausblenden wie in Obsidian
  const keep = nodes.map((n) => n.weight > 0)
  const remap = new Map<number, number>()
  const kept: GraphNode[] = []
  nodes.forEach((n, i) => {
    if (!keep[i]) return
    remap.set(i, kept.length)
    kept.push(n)
  })
  return { nodes: kept, edges: edges.map((e) => ({ a: remap.get(e.a)!, b: remap.get(e.b)! })), settings }
}
