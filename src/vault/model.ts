import { CONCEPT_STATUSES, type Concept, type ConceptStatus, type LogEntry, type RawFile, type RawKind, type Semester, type Subject, type SubjectStatus, type Todo, type TreeEntry } from '../types'
import { asDate, asList, splitFrontmatter } from './frontmatter'

/*
 * Liest den Vault (Schema aus CLAUDE.md des uni-knowledge-template) in ein Modell für die App.
 * Reine Funktionen: Eingabe sind Dateibaum und Texte, Ausgabe das Modell. Dadurch testbar ohne GitHub.
 */

export interface ExamHub {
  overview?: string
  lernplan?: string
  status?: string
}

export interface VaultModel {
  semester?: Semester
  subjects: Subject[]
  concepts: Concept[]
  exams: Record<string, ExamHub>
  todos: Todo[]
  log: LogEntry[]
  raw: RawFile[]
  sources: number
  /** Wikilink-Ziel (Dateiname klein, ohne .md) → Pfad */
  links: Map<string, string>
  /** Alle Markdown-Pfade (für Suche) */
  markdown: string[]
  /** Noch Platzhalter aus dem Template drin? Dann ist die Erst-Einrichtung offen. */
  needsSetup: boolean
}

export const SUBJECT_PALETTE = ['#b08a4a', '#5b84b1', '#5f9473', '#cd7f4a', '#c46a8a', '#8571b5', '#3f8e93', '#bd5a50']

export function semesterFolder(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '')
}

export function prettify(slug: string): string {
  const s = slug.split('/').pop()!.replace(/\.md$/, '').replace(/[-_]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : slug
}

export function basename(path: string): string {
  return path.split('/').pop() ?? path
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined)

/** SEMESTER-Objekt aus dem dataviewjs-Block in wiki/dashboard/home.md. */
export function parseSemesterConfig(home: string): Semester | undefined {
  const m = home.match(/const\s+SEMESTER\s*=\s*\{([^}]*)\}/)
  if (!m) return undefined
  const get = (k: string) => m[1].match(new RegExp(`${k}\\s*:\\s*['"]([^'"]*)['"]`))?.[1]
  const name = get('name')
  if (!name) return undefined
  return { name, folder: get('folder') ?? semesterFolder(name), start: get('start'), end: get('end'), firstExam: get('firstExam') }
}

export interface SubjectConfig {
  slug: string
  label?: string
  short?: string
  lang?: string
  active?: boolean
  assessment?: string
  examDate?: string
  semFolder?: string
  grade?: number
  color?: string
}

/** SUBJECTS-Objekt aus home.md (Farben, Kürzel, Klausurtermine). */
export function parseSubjectsConfig(home: string): SubjectConfig[] {
  const start = home.search(/const\s+SUBJECTS\s*=\s*\{/)
  if (start < 0) return []
  let i = home.indexOf('{', start)
  let depth = 0
  let end = i
  for (; i < home.length; i++) {
    if (home[i] === '{') depth++
    else if (home[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const block = home.slice(home.indexOf('{', start) + 1, end)
  const out: SubjectConfig[] = []
  const entry = /['"]([\w-]+)['"]\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = entry.exec(block))) {
    let j = m.index + m[0].length
    let d = 1
    for (; j < block.length && d > 0; j++) {
      if (block[j] === '{') d++
      else if (block[j] === '}') d--
    }
    const body = block.slice(m.index + m[0].length, j - 1)
    entry.lastIndex = j
    const s = (k: string) => body.match(new RegExp(`\\b${k}\\s*:\\s*['"]([^'"]*)['"]`))?.[1]
    const active = body.match(/\bactive\s*:\s*(true|false)/)?.[1]
    const grade = body.match(/\bgrade\s*:\s*(\d+(?:\.\d+)?)/)?.[1]
    const color = body.match(/\bcolor\s*:\s*isDark\s*\?\s*['"](#[0-9a-fA-F]{3,8})['"]\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/)?.[2] ?? s('color')
    out.push({
      slug: m[1],
      label: s('label'),
      short: s('short'),
      lang: s('lang'),
      active: active === undefined ? undefined : active === 'true',
      assessment: s('assessment'),
      examDate: s('examDate'),
      semFolder: s('semFolder'),
      grade: grade ? Number(grade) : undefined,
      color,
    })
  }
  return out
}

const DEF = /^#{2,}\s+Definition\s*\n([\s\S]*?)(?=^\s*#|$(?![\s\S]))/m

/** Erster Satz der Definition, ohne Markdown-Zeichen (wie tools/build-catalog.py). */
export function oneLiner(body: string): string {
  const raw = (body.match(DEF)?.[1] ?? body).trim()
  const para = raw.split(/\n\s*\n/).map((b) => b.trim()).find((b) => b && !'-*|>#'.includes(b[0]) && !b.startsWith('$$')) ?? raw.split('\n')[0] ?? ''
  const clean = para
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? prettify(a))
    .replace(/\$\$?[\s\S]*?\$\$?/g, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const text = firstSentence(clean)
  return text.length > 200 ? `${text.slice(0, 199).replace(/\s+\S*$/, '')}…` : text
}

// Wie tools/build-catalog.py im Vault: an Abkürzungen nicht abschneiden
const ABBREV = ['z.B.', 'z. B.', 'u.a.', 'd.h.', 'ggf.', 'bzw.', 'vs.', 'i.d.R.', 'u.U.', 'evtl.', 'Nr.', 'ca.', 'inkl.', 'max.', 'min.', 'Mio.', 'Mrd.', 'engl.', 'Abs.', 'Art.', 'vgl.', 'sog.', 'etc.', 'Kap.', 'Aufl.', 'Pos.']

function firstSentence(text: string): string {
  for (const m of text.matchAll(/[.!?](?=\s)/g)) {
    const idx = m.index!
    if (idx < 30) continue
    const upTo = text.slice(0, idx + 1)
    const isAbbrev = (a: string) => upTo.endsWith(a) && !/\p{L}/u.test(upTo.charAt(upTo.length - a.length - 1))
    if (m[0] === '.' && ABBREV.some((a) => isAbbrev(a) || isAbbrev(a.split(' ')[0]))) continue
    return text.slice(0, idx + 1)
  }
  return text
}

function conceptStatus(v: unknown): ConceptStatus {
  return CONCEPT_STATUSES.includes(v as ConceptStatus) ? (v as ConceptStatus) : 'draft'
}

function subjectStatus(v: unknown): SubjectStatus {
  return v === 'pending' || v === 'verified' || v === 'needs_review' ? v : 'in_progress'
}

export function parseTodos(text: string | undefined): Todo[] {
  if (!text) return []
  const { data } = splitFrontmatter(text)
  const list = Array.isArray(data.todos) ? data.todos : []
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as { title?: unknown }).title === 'string')
    .map((t) => ({
      title: String(t.title),
      date: asDate(t.date),
      priority: t.priority === 'high' || t.priority === 'medium' || t.priority === 'low' ? t.priority : undefined,
      category: str(t.category),
      done: t.done === true,
    }))
}

export function parseLog(text: string | undefined): LogEntry[] {
  if (!text) return []
  const out: LogEntry[] = []
  for (const m of text.matchAll(/^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*([^|\n]+?)\s*(?:\|\s*(.*))?$/gm)) {
    out.push({ date: m[1], kind: m[2].trim(), detail: (m[3] ?? '').replace(/\s*\|\s*/g, ' · ').trim() })
  }
  return out.reverse()
}

const RAW_KIND_SET = new Set(['slides', 'notes', 'books', 'videos', 'papers'])

/** Rohdateien einem Fach und einer Art zuordnen. */
export function classifyRaw(entry: TreeEntry, subjectSlugs: Set<string>): RawFile | undefined {
  const parts = entry.path.split('/')
  if (parts[0] !== 'raw' || basename(entry.path) === '.gitkeep' || basename(entry.path).startsWith('.')) return undefined
  if (parts[1] === 'assets') return undefined
  let subject = ''
  let kind: RawKind | 'other' = 'other'
  // raw/<SEM>/<fach>/<art>/… oder raw/archive-upload/<SEM>/<fach>/<art>/…
  const rest = parts[1] === 'archive-upload' ? parts.slice(2) : parts.slice(1)
  if (RAW_KIND_SET.has(rest[0])) kind = rest[0] as RawKind
  else if (rest.length >= 3) {
    if (subjectSlugs.has(rest[1]) || rest.length >= 4) subject = rest[1]
    if (RAW_KIND_SET.has(rest[2])) kind = rest[2] as RawKind
  }
  return { path: entry.path, name: basename(entry.path), subject, kind, size: entry.size, sha: entry.sha }
}

/** „fiwi“ → „FIWI“, „eal-102-economics“ → „EAL 102 Economics“ (kurze Wörter sind meist Kürzel). */
export function labelFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (/^[a-z]{2,4}$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Ordnername → Semester-Name: „WS2526“ → „WS25/26“, „SS26“ bleibt. */
export function semesterFromFolder(folder: string): string {
  const m = folder.match(/^(WS|SS|SoSe|WiSe)(\d{2})(\d{2})$/)
  return m ? `${m[1]}${m[2]}/${m[3]}` : folder
}

/**
 * Fächer, die es nur als Ordner in raw/ gibt (z. B. nach einem Import, bevor Claude Code den Vault
 * eingerichtet hat). Ohne eigene Fächer im Vault gelten sie als aktiv, sonst landen sie im Archiv.
 */
function subjectsFromFolders(raw: RawFile[], known: Set<string>, configured: Subject[]): Subject[] {
  const folders = new Map<string, string>()
  for (const r of raw) {
    if (!r.subject || known.has(r.subject) || folders.has(r.subject)) continue
    const parts = r.path.split('/')
    folders.set(r.subject, parts[1] === 'archive-upload' ? parts[2] : parts[1])
  }
  const hasOwn = configured.some((s) => !s.slug.startsWith('beispiel-fach'))
  const list = [...folders].map(([slug, folder], i): Subject => {
    const label = labelFromSlug(slug)
    return {
      slug,
      label,
      short: label.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
      language: 'de',
      semester: semesterFromFolder(folder),
      semFolder: folder,
      status: 'pending',
      active: !hasOwn,
      color: SUBJECT_PALETTE[(configured.length + i) % SUBJECT_PALETTE.length],
    }
  })
  // neueste Semester zuerst (SS26 vor WS2526), innerhalb alphabetisch
  const year = (s: Subject) => Number(s.semFolder.match(/\d{2}/)?.[0] ?? 0) + (s.semFolder.startsWith('W') ? 0.5 : 0)
  return list.sort((a, b) => year(b) - year(a) || a.label.localeCompare(b.label, 'de'))
}

export function buildModel(entries: TreeEntry[], texts: Map<string, string>): VaultModel {
  const home = texts.get('wiki/dashboard/home.md') ?? ''
  const semester = parseSemesterConfig(home)
  const configs = parseSubjectsConfig(home)
  const links = new Map<string, string>()
  const markdown: string[] = []
  for (const e of entries) {
    const base = basename(e.path).toLowerCase()
    const key = base.endsWith('.md') ? base.slice(0, -3) : base
    // Obsidian-Regel: kürzester Pfad gewinnt, wiki/ vor raw/
    const prev = links.get(key)
    if (!prev || (prev.startsWith('raw/') && !e.path.startsWith('raw/')) || (prev.split('/').length > e.path.split('/').length && prev.startsWith('raw/') === e.path.startsWith('raw/'))) links.set(key, e.path)
    links.set(e.path.toLowerCase().replace(/\.md$/, ''), e.path)
    if (e.path.endsWith('.md')) markdown.push(e.path)
  }

  // Fächer aus den MOCs
  const mocs = new Map<string, { path: string; data: Record<string, unknown> }>()
  const summaries = new Map<string, string>()
  for (const e of entries) {
    const m = e.path.match(/^wiki\/subjects\/([^/]+)\.md$/)
    if (!m) continue
    if (m[1].endsWith('_summary')) {
      summaries.set(m[1].replace(/_summary$/, ''), e.path)
      continue
    }
    const { data } = splitFrontmatter(texts.get(e.path) ?? '')
    const slug = str(data.subject) ?? m[1]
    mocs.set(slug, { path: e.path, data })
  }
  const slugs = [...new Set([...mocs.keys(), ...configs.map((c) => c.slug)])]
  const subjects: Subject[] = slugs.map((slug, i) => {
    const moc = mocs.get(slug)?.data ?? {}
    const cfg = configs.find((c) => c.slug === slug)
    const sem = str(moc.semester) ?? semester?.name ?? ''
    const status = subjectStatus(moc.status)
    const grade = typeof moc.grade === 'number' ? moc.grade : (cfg?.grade ?? null)
    const label = cfg?.label ?? str(moc.title) ?? prettify(slug)
    return {
      slug,
      label,
      short: cfg?.short ?? label.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
      language: (cfg?.lang ?? str(moc.language) ?? 'de').toLowerCase(),
      semester: sem,
      semFolder: cfg?.semFolder ?? (sem ? semesterFolder(sem) : (semester?.folder ?? '')),
      status,
      examDate: asDate(moc.exam_date) ?? asDate(cfg?.examDate),
      assessment: cfg?.assessment,
      grade,
      active: cfg?.active ?? (status === 'in_progress' || status === 'pending'),
      color: cfg?.color ?? SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
      mocPath: mocs.get(slug)?.path,
      summaryPath: summaries.get(slug),
    }
  })

  const today = new Date().toISOString().slice(0, 10)
  const examKey = (s: Subject) => (s.examDate && s.examDate >= today ? s.examDate : '9999')
  subjects.sort((a, b) => Number(b.active) - Number(a.active) || examKey(a).localeCompare(examKey(b)) || a.label.localeCompare(b.label, 'de'))

  const concepts: Concept[] = []
  for (const e of entries) {
    const m = e.path.match(/^wiki\/concepts\/([^/]+)\.md$/)
    if (!m || m[1].startsWith('_')) continue
    const { data, body } = splitFrontmatter(texts.get(e.path) ?? '')
    concepts.push({
      path: e.path,
      slug: m[1],
      title: str(data.title) ?? prettify(m[1]),
      subjects: asList(data.subjects),
      semesters: asList(data.semesters),
      status: conceptStatus(data.status),
      updated: asDate(data.updated),
      tags: asList(data.tags),
      oneLiner: oneLiner(body),
    })
  }
  concepts.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }))

  const exams: Record<string, ExamHub> = {}
  for (const e of entries) {
    const ex = e.path.match(/^wiki\/exams\/[^/]+\/([^/]+)\/(overview|lernplan|status)\.md$/)
    if (ex) (exams[ex[1]] ??= {})[ex[2] as keyof ExamHub] = e.path
  }

  const slugSet = new Set(subjects.map((s) => s.slug))
  const raw = entries.map((e) => classifyRaw(e, slugSet)).filter((r): r is RawFile => !!r)
  subjects.push(...subjectsFromFolders(raw, slugSet, subjects))
  const needsSetup = /\[TODO/.test(texts.get('CLAUDE.md') ?? '') || subjects.some((s) => s.slug.startsWith('beispiel-fach'))

  return {
    semester,
    subjects,
    concepts,
    exams,
    todos: parseTodos(texts.get('wiki/dashboard/todos.md')),
    log: parseLog(texts.get('log.md')),
    raw,
    sources: entries.filter((e) => /^wiki\/sources\/[^/]+\.md$/.test(e.path)).length,
    links,
    markdown,
    needsSetup,
  }
}

/** Wikilink-Ziel auflösen („Konzept“, „wiki/sources/X“, „Konzept#Abschnitt“). */
export function resolveLink(model: Pick<VaultModel, 'links'>, target: string): string | undefined {
  const clean = target.split('#')[0].split('^')[0].trim().toLowerCase().replace(/\.md$/, '')
  if (!clean) return undefined
  return model.links.get(clean) ?? model.links.get(basename(clean))
}

export interface StatusCounts {
  draft: number
  pending_enrichment: number
  enriched: number
  'exam-ready': number
  total: number
}

export function statusCounts(concepts: Concept[], subject?: string): StatusCounts {
  const c: StatusCounts = { draft: 0, pending_enrichment: 0, enriched: 0, 'exam-ready': 0, total: 0 }
  for (const x of concepts) {
    if (subject && !x.subjects.includes(subject)) continue
    c[x.status]++
    c.total++
  }
  return c
}

/** Anteil „fertig“ (enriched + exam-ready) in Prozent. */
export function readiness(c: StatusCounts): number {
  return c.total ? Math.round(((c.enriched + c['exam-ready']) / c.total) * 100) : 0
}

/** Was heute dran ist: die ältesten noch nicht angereicherten Concepts der aktiven Fächer. */
export function todayToLearn(model: VaultModel, limit = 5): Concept[] {
  const active = new Set(model.subjects.filter((s) => s.active).map((s) => s.slug))
  return model.concepts
    .filter((c) => c.status === 'pending_enrichment' && c.subjects.some((s) => active.has(s)))
    .sort((a, b) => (a.updated ?? '').localeCompare(b.updated ?? ''))
    .slice(0, limit)
}

/** Rohdatei-Pfad für einen Upload (CLAUDE.md §13: raw/<SEMESTER>/<fach>/<art>/). */
export function rawPath(subject: Subject, kind: RawKind, fileName: string, fallbackFolder = ''): string {
  const sem = subject.semFolder || fallbackFolder
  const safe = fileName.replace(/[\\/:*?"<>|#^[\]]+/g, '-').replace(/\s+/g, ' ').trim()
  return ['raw', sem, subject.slug, kind, safe].filter(Boolean).join('/')
}

/** Welche Dateien die App als Text lädt (alles, was sie darstellt oder auswertet). */
export function wantsText(path: string): boolean {
  if (!path.endsWith('.md')) return false
  if (path.startsWith('wiki/_templates/')) return false
  return path.startsWith('wiki/') || ['index.md', 'log.md', 'CLAUDE.md', 'commands.md'].includes(path)
}

export function mimeFor(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    md: 'text/markdown',
    txt: 'text/plain',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
  }
  return map[ext] ?? 'application/octet-stream'
}
