import { FileText, Search as SearchIcon } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { Empty, PageHead } from '../components/ui'
import { escapeHtml } from '../lib/html'
import { hitSnippet, plain, search, terms, type SearchDoc } from '../lib/search'
import { href, type Route } from '../state/router'
import { useVault } from '../state/vault'
import { splitFrontmatter, asList } from '../vault/frontmatter'
import { basename, prettify } from '../vault/model'

function kindOf(path: string): SearchDoc['kind'] {
  if (path.startsWith('wiki/concepts/')) return 'concept'
  if (path.startsWith('wiki/subjects/')) return 'subject'
  if (path.startsWith('wiki/exams/')) return 'exam'
  if (path.startsWith('wiki/sources/')) return 'source'
  return 'other'
}

const KIND_LABEL: Record<SearchDoc['kind'], string> = { concept: 'Concept', subject: 'Fach', exam: 'Klausur', source: 'Quelle', other: 'Seite' }

/** Volltextsuche über alle Notes im Vault (Concepts, Fächer, Klausur-Seiten, Quellen) und Dateinamen in raw/. */
export default function SearchPage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const [q, setQ] = useState(route.query.get('q') ?? '')

  const docs = useMemo<SearchDoc[]>(() => {
    return model.markdown
      .filter((p) => p.startsWith('wiki/') && !p.startsWith('wiki/_templates/') && !p.startsWith('wiki/dashboard/') && !p.startsWith('wiki/flashcards/') && !p.endsWith('/_index.md'))
      .map((path) => {
        const text = vault.textNow(path) ?? ''
        const { data } = splitFrontmatter(text)
        const concept = model.concepts.find((c) => c.path === path)
        return {
          path,
          title: concept?.title ?? (typeof data.title === 'string' ? data.title : prettify(basename(path))),
          text: plain(text),
          kind: kindOf(path),
          subjects: concept?.subjects ?? asList(data.subject ?? data.subjects),
        }
      })
    // vault.textNow liest aus dem aktuellen Stand; neu berechnen, wenn sich das Modell ändert
  }, [model, vault])

  const results = useMemo(() => search(docs, q).slice(0, 80), [docs, q])
  const files = useMemo(() => {
    const words = terms(q)
    if (!words.length) return []
    return model.raw.filter((r) => words.every((w) => r.name.toLowerCase().includes(w))).slice(0, 30)
  }, [model.raw, q])

  const highlight = (text: string) => {
    let html = escapeHtml(text)
    for (const w of terms(q)) html = html.replace(new RegExp(`(${escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
    return { __html: html }
  }

  return (
    <div className="page">
      <PageHead eyebrow="Im ganzen Vault" title="Suche" />
      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault()
          window.history.replaceState(null, '', `#/suche?q=${encodeURIComponent(q)}`)
        }}
      >
        <SearchIcon size={20} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Begriff, Formel, Thema …" aria-label="Suchbegriff" type="search" />
      </form>

      {!q.trim() ? (
        <Empty icon={<SearchIcon size={26} />}>Gesucht wird in allen Concepts, Fach-Seiten, Klausur-Hubs und Quellen – und in den Namen deiner hochgeladenen Dateien.</Empty>
      ) : (
        <>
          <section>
            <div className="section-head">
              <h2>Notes</h2>
              <span className="muted small">{results.length} Treffer</span>
            </div>
            {results.length ? (
              <ul className="card list">
                {results.map((d) => {
                  const s = model.subjects.find((x) => d.subjects.includes(x.slug))
                  return (
                    <li key={d.path}>
                      <a className="list-row" href={href(`/n/${encodeURIComponent(d.path)}`)} style={s ? ({ '--c': s.color } as CSSProperties) : undefined}>
                        <span className="grow">
                          <b dangerouslySetInnerHTML={highlight(d.title)} />
                          <span className="muted small" dangerouslySetInnerHTML={highlight(hitSnippet(d.text, q))} />
                        </span>
                        <span className="kind-tag">{KIND_LABEL[d.kind]}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted small">Nichts gefunden zu „{q}“.</p>
            )}
          </section>
          {files.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Dateien</h2>
                <span className="muted small">{files.length}</span>
              </div>
              <ul className="card list">
                {files.map((f) => (
                  <li key={f.path}>
                    <a className="list-row" href={href(f.name.endsWith('.md') ? `/mitschrift?pfad=${encodeURIComponent(f.path)}` : `/n/${encodeURIComponent(f.path)}`)}>
                      <span className="file-icon">
                        <FileText size={17} />
                      </span>
                      <span className="grow">
                        <b className="ellipsis" dangerouslySetInnerHTML={highlight(f.name)} />
                        <span className="muted small">{f.path.split('/').slice(0, -1).join(' / ')}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
