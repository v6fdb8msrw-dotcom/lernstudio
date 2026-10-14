import { BookA } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { Empty, PageHead, Seg, StatusChip } from '../components/ui'
import { href, type Route } from '../state/router'
import { useVault } from '../state/vault'
import { CONCEPT_STATUSES, type ConceptStatus } from '../types'

function letterOf(title: string): string {
  const c = title.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

/** Register aller Kernbegriffe (Concept-Notes), A–Z, filterbar nach Fach und Status. */
export default function ConceptsPage({ route }: { route: Route }) {
  const { model } = useVault()
  const [subject, setSubject] = useState(route.query.get('fach') ?? '')
  const [status, setStatus] = useState<ConceptStatus | 'alle'>('alle')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return model.concepts.filter(
      (c) => (!subject || c.subjects.includes(subject)) && (status === 'alle' || c.status === status) && (!needle || c.title.toLowerCase().includes(needle) || c.oneLiner.toLowerCase().includes(needle)),
    )
  }, [model.concepts, subject, status, q])

  const groups = useMemo(() => {
    const map = new Map<string, typeof list>()
    for (const c of list) {
      const l = letterOf(c.title)
      map.set(l, [...(map.get(l) ?? []), c])
    }
    return [...map.entries()]
  }, [list])

  const colorOf = (slug: string) => model.subjects.find((s) => s.slug === slug)?.color ?? 'var(--silver-4)'
  const shortOf = (slug: string) => model.subjects.find((s) => s.slug === slug)?.short ?? slug

  return (
    <div className="page">
      <PageHead eyebrow="wiki/concepts" title="Begriffe" lead={`${model.concepts.length} Kernbegriffe aus deinem Vault – ein Concept pro Begriff, von Claude Code aus Folien, Mitschriften und Büchern gebaut.`} />

      <section className="card stack">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Begriff filtern …" aria-label="Begriffe filtern" />
        <div className="chip-row">
          <button type="button" className="chip" aria-pressed={!subject} onClick={() => setSubject('')}>
            Alle Fächer
          </button>
          {model.subjects.map((s) => (
            <button key={s.slug} type="button" className="chip subject-chip" aria-pressed={subject === s.slug} style={{ '--c': s.color } as CSSProperties} onClick={() => setSubject(s.slug)}>
              <i /> {s.label}
            </button>
          ))}
        </div>
        <Seg
          value={status}
          onChange={setStatus}
          label="Status"
          options={[{ value: 'alle' as const, label: 'Alle' }, ...CONCEPT_STATUSES.map((s) => ({ value: s, label: { draft: 'Entwurf', pending_enrichment: 'Wartet', enriched: 'Angereichert', 'exam-ready': 'Prüfungsfertig' }[s] }))]}
        />
      </section>

      {groups.length > 1 && (
        <nav className="letter-bar" aria-label="Springe zu Buchstabe">
          {groups.map(([l]) => (
            <a key={l} href={`#/begriffe`} onClick={(e) => {
              e.preventDefault()
              document.getElementById(`buchstabe-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}>
              {l}
            </a>
          ))}
        </nav>
      )}

      {groups.length ? (
        groups.map(([letter, items]) => (
          <section key={letter} id={`buchstabe-${letter}`} className="letter-group">
            <h2 className="letter">{letter}</h2>
            <ul className="card list concept-list">
              {items.map((c) => (
                <li key={c.path}>
                  <a className="list-row" href={href(`/n/${encodeURIComponent(c.path)}`)}>
                    <span className="grow">
                      <b>{c.title}</b>
                      <span className="muted small">{c.oneLiner || 'Noch keine Definition'}</span>
                    </span>
                    <span className="concept-subjects">
                      {c.subjects.map((s) => (
                        <span key={s} className="mini-badge" style={{ '--c': colorOf(s) } as CSSProperties}>
                          {shortOf(s)}
                        </span>
                      ))}
                    </span>
                    <StatusChip status={c.status} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <Empty icon={<BookA size={26} />}>{model.concepts.length ? 'Kein Begriff passt zum Filter.' : 'Noch keine Concepts. Lade Folien und Mitschriften hoch und sag Claude Code Bescheid – dann füllt sich das Register.'}</Empty>
      )}
    </div>
  )
}
