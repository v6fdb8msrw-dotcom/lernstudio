// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyEdit } from './edits'
import { splitFrontmatter } from './frontmatter'
import { renderMarkdown } from './markdown'
import { buildModel, classifyRaw, oneLiner, parseLog, parseSemesterConfig, parseSubjectsConfig, parseTodos, rawPath, readiness, resolveLink, statusCounts } from './model'

// Ausschnitt aus wiki/dashboard/home.md des uni-knowledge-template
const HOME = `\`\`\`dataviewjs
const isDark = document.body.classList.contains('theme-dark')
const SEMESTER = { name: 'WS26/27', folder: 'WS2627', start: '2026-10-12', end: '2027-01-12', firstExam: '2027-01-06' }
const SUBJECTS = {
  'statistik': {
    label: 'Statistik II', short: 'ST', lang: 'DE', active: true, assessment: 'Klausur', examDate: '2027-01-15', semFolder: 'WS2627',
    color:  isDark ? '#F0B35F'               : '#b9731a',
    border: isDark ? 'rgba(240,179,95,.28)'  : 'rgba(185,115,26,.22)',
  },
  'marketing': {
    label: 'Marketing', short: 'MK', lang: 'EN', active: false, assessment: 'Klausur', examDate: '2026-07-20', grade: 80,
    color:  isDark ? '#89C4E1'               : '#1880a8',
  },
}
const CARD_SUBJECTS = ['statistik']
\`\`\``

const TODOS = `---
title: Todos & Abgaben
type: todos
todos: []
# Eintrag-Format (Claude ergänzt minimal, nie den ganzen Block überschreiben):
#  - title: Beispiel Klausur
#    done: false
---

# Todos & Abgaben
`

const CONCEPT = `---
title: Standardabweichung
subjects: [statistik]
semesters: [WS26/27]
language: de
status: enriched
sources: []
created: 2026-10-20
updated: 2026-10-21
tags: [streuung]
---

> [!tip] At a glance
> - Wurzel der Varianz
> - gleiche Einheit wie die Daten

## Definition
Die Standardabweichung ist die Wurzel aus der [[Varianz]], z. B. bei Messreihen. Sie misst die Streuung.

## 🧠 Self-test
> [!question]- Was misst die Standardabweichung?
> Die typische Abweichung vom Mittelwert.

![[streuung.png]]
`

describe('Dashboard-Konfiguration aus home.md', () => {
  it('liest Semester und Fächer samt heller Farbe', () => {
    expect(parseSemesterConfig(HOME)).toEqual({ name: 'WS26/27', folder: 'WS2627', start: '2026-10-12', end: '2027-01-12', firstExam: '2027-01-06' })
    const subs = parseSubjectsConfig(HOME)
    expect(subs.map((s) => s.slug)).toEqual(['statistik', 'marketing'])
    expect(subs[0]).toMatchObject({ label: 'Statistik II', short: 'ST', active: true, examDate: '2027-01-15', color: '#b9731a' })
    expect(subs[1]).toMatchObject({ active: false, grade: 80, color: '#1880a8' })
  })
})

describe('Frontmatter, Todos, Log', () => {
  it('trennt Frontmatter und liest Listen', () => {
    const { data, body } = splitFrontmatter(CONCEPT)
    expect(data.subjects).toEqual(['statistik'])
    expect(body.startsWith('\n> [!tip]')).toBe(true)
  })

  it('ergänzt Todos, ohne die Format-Kommentare zu verlieren, und hakt ab', () => {
    const added = applyEdit(TODOS, { op: 'addTodo', arg: JSON.stringify({ title: 'Hausarbeit abgeben', date: '2026-12-01', priority: 'high', category: 'Abgabe', done: false }) })!
    expect(added).toContain('# Eintrag-Format')
    expect(parseTodos(added)).toEqual([{ title: 'Hausarbeit abgeben', date: '2026-12-01', priority: 'high', category: 'Abgabe', done: false }])
    const toggled = applyEdit(added, { op: 'toggleTodo', arg: 'Hausarbeit abgeben' })!
    expect(parseTodos(toggled)[0].done).toBe(true)
    expect(toggled).toContain('# Todos & Abgaben')
  })

  it('liest Log-Einträge, neueste zuerst', () => {
    const log = parseLog('<!-- Format -->\n## [2026-10-20] ingest | slides | VL1.pdf\n## [2026-10-22] update | Mitschrift | Statistik\n')
    expect(log[0]).toEqual({ date: '2026-10-22', kind: 'update', detail: 'Mitschrift · Statistik' })
  })
})

describe('Modell', () => {
  const entries = [
    { path: 'wiki/dashboard/home.md', sha: '1', size: 1 },
    { path: 'wiki/dashboard/todos.md', sha: '2', size: 1 },
    { path: 'wiki/subjects/statistik.md', sha: '3', size: 1 },
    { path: 'wiki/subjects/statistik_summary.md', sha: '4', size: 1 },
    { path: 'wiki/concepts/standardabweichung.md', sha: '5', size: 1 },
    { path: 'wiki/concepts/varianz.md', sha: '6', size: 1 },
    { path: 'wiki/concepts/_index.md', sha: '7', size: 1 },
    { path: 'wiki/exams/WS2627/statistik/overview.md', sha: '8', size: 1 },
    { path: 'raw/WS2627/statistik/slides/VL1.pdf', sha: '9', size: 2048 },
    { path: 'raw/WS2627/statistik/notes/2026-10-20 VL1.md', sha: '10', size: 10 },
    { path: 'raw/assets/streuung.png', sha: '11', size: 10 },
    { path: 'raw/slides/.gitkeep', sha: '12', size: 0 },
  ]
  const texts = new Map([
    ['wiki/dashboard/home.md', HOME],
    ['wiki/dashboard/todos.md', TODOS],
    ['wiki/subjects/statistik.md', '---\ntitle: Statistik II\nsubject: statistik\nsemester: WS26/27\ntype: MOC\nstatus: in_progress\nexam_date: 2027-01-15\n---\n# Statistik'],
    ['wiki/concepts/standardabweichung.md', CONCEPT],
    ['wiki/concepts/varianz.md', '---\ntitle: Varianz\nsubjects: [statistik]\nstatus: pending_enrichment\n---\n## Definition\nMittlere quadratische Abweichung vom Mittelwert einer Verteilung.'],
    ['wiki/concepts/_index.md', '---\ntitle: Katalog\n---'],
  ])
  const model = buildModel(entries, texts)

  it('baut Fächer aus MOCs und Dashboard', () => {
    const st = model.subjects.find((s) => s.slug === 'statistik')!
    expect(st).toMatchObject({ label: 'Statistik II', examDate: '2027-01-15', semFolder: 'WS2627', active: true, mocPath: 'wiki/subjects/statistik.md', summaryPath: 'wiki/subjects/statistik_summary.md' })
    expect(model.subjects.find((s) => s.slug === 'marketing')?.active).toBe(false)
  })

  it('liest Concepts (ohne _index) mit Status und Kurzdefinition', () => {
    expect(model.concepts.map((c) => c.title)).toEqual(['Standardabweichung', 'Varianz'])
    expect(model.concepts[0].oneLiner).toBe('Die Standardabweichung ist die Wurzel aus der Varianz, z. B. bei Messreihen.')
    const counts = statusCounts(model.concepts, 'statistik')
    expect(counts).toMatchObject({ enriched: 1, pending_enrichment: 1, total: 2 })
    expect(readiness(counts)).toBe(50)
  })

  it('ordnet Rohdateien Fach und Art zu', () => {
    expect(model.raw.map((r) => [r.name, r.subject, r.kind])).toEqual([
      ['VL1.pdf', 'statistik', 'slides'],
      ['2026-10-20 VL1.md', 'statistik', 'notes'],
    ])
    expect(classifyRaw({ path: 'raw/archive-upload/SS26/marketing/books/buch.pdf', sha: 'x', size: 1 }, new Set(['marketing']))).toMatchObject({ subject: 'marketing', kind: 'books' })
  })

  it('löst Wikilinks wie Obsidian auf', () => {
    expect(resolveLink(model, 'Varianz')).toBe('wiki/concepts/varianz.md')
    expect(resolveLink(model, 'varianz#Definition')).toBe('wiki/concepts/varianz.md')
    expect(resolveLink(model, 'wiki/subjects/statistik_summary|Summary'.split('|')[0])).toBe('wiki/subjects/statistik_summary.md')
    expect(resolveLink(model, 'streuung.png')).toBe('raw/assets/streuung.png')
    expect(resolveLink(model, 'Gibt es nicht')).toBeUndefined()
  })

  it('kennt Klausur-Hubs und erkennt die offene Einrichtung', () => {
    expect(model.exams.statistik.overview).toBe('wiki/exams/WS2627/statistik/overview.md')
    expect(model.needsSetup).toBe(false)
  })

  it('baut Upload-Pfade nach CLAUDE.md', () => {
    const st = model.subjects.find((s) => s.slug === 'statistik')!
    expect(rawPath(st, 'slides', 'VL 2: Regression.pdf')).toBe('raw/WS2627/statistik/slides/VL 2- Regression.pdf')
  })
})

describe('Markdown im Obsidian-Stil', () => {
  const model = buildModel([{ path: 'wiki/concepts/varianz.md', sha: '1', size: 1 }, { path: 'raw/assets/streuung.png', sha: '2', size: 1 }], new Map())
  const html = renderMarkdown(splitFrontmatter(CONCEPT).body, { resolve: (t) => resolveLink(model, t), notePath: 'wiki/concepts/standardabweichung.md' })

  it('macht aus Wikilinks App-Links und markiert fehlende', () => {
    expect(html).toContain('href="#/n/wiki%2Fconcepts%2Fvarianz.md"')
    expect(html).toContain('class="wikilink"')
  })

  it('baut Callouts, zugeklappte Fragen und eingebettete Bilder', () => {
    expect(html).toContain('callout callout-tip')
    expect(html).toMatch(/<details class="callout callout-question"><summary class="callout-title">Was misst die Standardabweichung\?<\/summary>/)
    expect(html).toContain('data-vault="raw/assets/streuung.png"')
  })

  it('entfernt Skripte', () => {
    const evil = renderMarkdown('Hallo <script>alert(1)</script><img src=x onerror=alert(1)>', { resolve: () => undefined })
    expect(evil).not.toContain('<script')
    expect(evil).not.toContain('onerror')
  })
})

describe('Kurzdefinition', () => {
  it('nimmt den ersten Satz der Definition', () => {
    expect(oneLiner('## Definition\nDas BIP misst den Gesamtwert aller Güter eines Landes. Mehr Text.\n\n## Kernidee\nX')).toBe('Das BIP misst den Gesamtwert aller Güter eines Landes.')
  })
})

describe('Kurzdefinition an Wortgrenzen', () => {
  it('schneidet nach „Netz.“ trotz Abkürzung „z.“', () => {
    expect(oneLiner('## Definition\nDie Daten liegen verteilt im ganzen Netz. Danach kommt mehr.')).toBe('Die Daten liegen verteilt im ganzen Netz.')
  })
})
