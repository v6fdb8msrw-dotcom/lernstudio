import { FileText, NotebookPen, Sparkles, Upload } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { FileRow } from '../components/FileRow'
import { useVaultText } from '../components/hooks'
import { Markdown } from '../components/Markdown'
import { Empty, ExamPill, PageHead, Seg, Spinner, StatusBar, StatusChip, Tabs } from '../components/ui'
import { formatDay } from '../lib/date'
import { href, navigate, type Route } from '../state/router'
import { useVault } from '../state/vault'
import { CONCEPT_STATUSES, RAW_KINDS, type ConceptStatus } from '../types'
import { readiness, statusCounts } from '../vault/model'

type Tab = 'uebersicht' | 'begriffe' | 'klausur' | 'material'

export default function SubjectPage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const slug = decodeURIComponent(route.segments[1] ?? '')
  const subject = model.subjects.find((s) => s.slug === slug)
  const tab = (route.query.get('tab') as Tab) || 'uebersicht'
  const setTab = (t: Tab) => navigate(`/fach/${slug}?tab=${t}`)

  if (!subject) {
    return (
      <div className="page">
        {vault.state === 'loading' || vault.state === 'syncing' ? <Spinner /> : <Empty>Dieses Fach gibt es im Vault nicht (mehr).</Empty>}
      </div>
    )
  }

  const concepts = model.concepts.filter((c) => c.subjects.includes(slug))
  const counts = statusCounts(model.concepts, slug)
  const raw = model.raw.filter((r) => r.subject === slug)

  return (
    <div className="page" style={{ '--c': subject.color } as CSSProperties}>
      <PageHead
        color={subject.color}
        eyebrow={`${subject.semester || 'Fach'} · ${subject.language.toUpperCase()}${subject.assessment ? ` · ${subject.assessment}` : ''}`}
        title={subject.label}
        lead={
          <>
            {subject.examDate ? `Prüfung am ${formatDay(subject.examDate)}` : 'Prüfungstermin noch offen'} · {counts.total} Concepts, {readiness(counts)} % fertig
            {subject.grade != null ? ` · Note ${subject.grade}/100` : ''}
          </>
        }
        actions={
          <>
            <ExamPill date={subject.examDate} />
            <a className="btn" href={href(`/mitschrift?fach=${slug}`)}>
              <NotebookPen size={16} /> Mitschrift
            </a>
            <a className="btn btn-primary" href={href(`/hochladen?fach=${slug}`)}>
              <Upload size={16} /> Hochladen
            </a>
          </>
        }
      >
        <div className="head-stats">
          <StatusBar counts={counts} showLegend />
        </div>
      </PageHead>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'uebersicht', label: 'Übersicht' },
          { value: 'begriffe', label: 'Begriffe', count: concepts.length },
          { value: 'klausur', label: 'Klausur' },
          { value: 'material', label: 'Material', count: raw.length },
        ]}
      />

      {tab === 'uebersicht' && <Overview mocPath={subject.mocPath} summaryPath={subject.summaryPath} slug={slug} />}
      {tab === 'begriffe' && <ConceptList slug={slug} />}
      {tab === 'klausur' && <ExamTab slug={slug} label={subject.label} />}
      {tab === 'material' && <Material slug={slug} />}
    </div>
  )
}

function Overview({ mocPath, summaryPath, slug }: { mocPath?: string; summaryPath?: string; slug: string }) {
  const moc = useVaultText(mocPath)
  const summary = useVaultText(summaryPath)
  return (
    <div className="two-col">
      <article className="card note-card">
        {moc.loading ? <Spinner /> : moc.text ? <Markdown text={moc.text} path={mocPath} /> : <p className="muted">Noch keine Fach-Seite (MOC). Claude Code legt sie bei der Einrichtung an.</p>}
      </article>
      <aside className="stack">
        <a className="card action-card" href={href(`/claude?fach=${slug}`)}>
          <Sparkles size={20} />
          <span>
            <b>Claude</b>
            <span className="muted small">Exam Mode, Mitschrift verarbeiten, Fragen</span>
          </span>
        </a>
        {summary.text && (
          <article className="card note-card small-md">
            <Markdown text={summary.text} path={summaryPath} />
          </article>
        )}
      </aside>
    </div>
  )
}

function ConceptList({ slug }: { slug: string }) {
  const { model } = useVault()
  const [filter, setFilter] = useState<ConceptStatus | 'alle'>('alle')
  const list = model.concepts.filter((c) => c.subjects.includes(slug) && (filter === 'alle' || c.status === filter))
  return (
    <section className="stack">
      <Seg
        value={filter}
        onChange={setFilter}
        label="Status filtern"
        options={[{ value: 'alle' as const, label: 'Alle' }, ...CONCEPT_STATUSES.map((s) => ({ value: s, label: { draft: 'Entwurf', pending_enrichment: 'Wartet', enriched: 'Angereichert', 'exam-ready': 'Prüfungsfertig' }[s] }))]}
      />
      {list.length ? (
        <ul className="card list concept-list">
          {list.map((c) => (
            <li key={c.path}>
              <a className="list-row" href={href(`/n/${encodeURIComponent(c.path)}`)}>
                <span className="grow">
                  <b>{c.title}</b>
                  <span className="muted small">{c.oneLiner || 'Noch keine Definition'}</span>
                </span>
                <StatusChip status={c.status} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<FileText size={26} />}>Hier gibt es noch keine Concepts. Lade Folien oder Mitschriften hoch und sag Claude Code Bescheid.</Empty>
      )}
    </section>
  )
}

function ExamTab({ slug, label }: { slug: string; label: string }) {
  const { model } = useVault()
  const hub = model.exams[slug] ?? {}
  const [part, setPart] = useState<'overview' | 'lernplan' | 'status'>('overview')
  const path = hub[part]
  const doc = useVaultText(path)
  if (!hub.overview && !hub.lernplan && !hub.status) {
    return <Empty>Noch kein Klausur-Hub. Sag in Claude Code: „Exam Mode für {label}“.</Empty>
  }
  return (
    <section className="stack">
      <Seg
        value={part}
        onChange={setPart}
        options={[
          { value: 'overview', label: 'Übersicht' },
          { value: 'lernplan', label: 'Lernplan' },
          { value: 'status', label: 'Status' },
        ]}
      />
      <article className="card note-card">{doc.loading ? <Spinner /> : doc.text ? <Markdown text={doc.text} path={path} /> : <p className="muted">Gibt es noch nicht.</p>}</article>
    </section>
  )
}

function Material({ slug }: { slug: string }) {
  const { model } = useVault()
  const groups = useMemo(() => {
    const raw = model.raw.filter((r) => r.subject === slug)
    return [...RAW_KINDS.map((k) => ({ ...k, files: raw.filter((r) => r.kind === k.kind) })), { kind: 'other' as const, label: 'Sonstiges', hint: '', trigger: '', files: raw.filter((r) => r.kind === 'other') }]
  }, [model.raw, slug])
  return (
    <section className="stack">
      {groups
        .filter((g) => g.files.length || g.kind !== 'other')
        .map((g) => (
          <div key={g.kind} className="card">
            <div className="section-head">
              <h2>
                {g.label} <span className="muted small">{g.files.length}</span>
              </h2>
              {g.kind !== 'other' && (
                <a className="btn btn-sm btn-ghost" href={href(g.kind === 'notes' ? `/mitschrift?fach=${slug}` : `/hochladen?fach=${slug}&typ=${g.kind}`)}>
                  {g.kind === 'notes' ? <NotebookPen size={15} /> : <Upload size={15} />} {g.kind === 'notes' ? 'Neue Mitschrift' : 'Hochladen'}
                </a>
              )}
            </div>
            {g.files.length ? (
              <ul className="list">
                {g.files.map((f) => (
                  <li key={f.path}>
                    <FileRow file={f} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{g.hint}</p>
            )}
          </div>
        ))}
    </section>
  )
}
