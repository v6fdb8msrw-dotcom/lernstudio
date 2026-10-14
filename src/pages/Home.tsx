import { ArrowUpRight, BookA, Check, NotebookPen, Plus, Search, Settings2, Sparkles, Upload } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { BrandMark } from '../components/BrandMark'
import { KnowledgeGraph } from '../components/KnowledgeGraph'
import { useClock } from '../components/hooks'
import { SyncBadge } from '../components/SyncBadge'
import { ExamPill, Notice, StatusBar, SubjectBadge } from '../components/ui'
import { useUi } from '../components/UiContext'
import { examInfo, formatDateLong, formatDay, greeting, relativeTime } from '../lib/date'
import { href, navigate } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import { readiness, statusCounts, todayToLearn } from '../vault/model'

export function Home() {
  const vault = useVault()
  const { model, state } = vault
  const clock = useClock()
  const { openTodo } = useUi()
  const { toast } = useToast()
  const [q, setQ] = useState('')

  const active = model.subjects.filter((s) => s.active && !s.slug.startsWith('beispiel-fach'))
  const shown = active.length ? active : model.subjects.filter((s) => s.active)
  const next = useMemo(
    () =>
      shown
        .map((s) => ({ s, e: examInfo(s.examDate) }))
        .filter((x) => x.e && x.e.days >= 0)
        .sort((a, b) => a.e!.days - b.e!.days)[0],
    [shown],
  )
  const learn = todayToLearn(model)
  const todos = model.todos.filter((t) => !t.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  const sem = model.semester
  const semProgress = sem?.start && sem.end ? Math.min(1, Math.max(0, (clock.getTime() - new Date(sem.start).getTime()) / (new Date(sem.end).getTime() - new Date(sem.start).getTime()))) : undefined

  async function toggle(title: string) {
    await vault.toggleTodo(title)
    toast('Erledigt')
  }

  const tiles = [
    { to: '/begriffe', icon: BookA, label: 'Begriffe', value: `${model.concepts.length} Concepts` },
    { to: '/hochladen', icon: Upload, label: 'Hochladen', value: `${model.raw.length} Dateien im Vault` },
    { to: '/mitschrift', icon: NotebookPen, label: 'Mitschrift', value: 'schreiben, mit Fotos' },
    { to: '/suche', icon: Search, label: 'Suche', value: 'im ganzen Vault' },
    { to: '/claude', icon: Sparkles, label: 'Claude', value: 'Chat & Claude Code' },
    { to: '/todos', icon: Check, label: 'Todos', value: `${model.todos.filter((t) => !t.done).length} offen` },
  ]

  return (
    <div className="page home">
      <section className="hero">
        <header className="hero-top">
          <a className="brand" href={href('/')}>
            <span className="brand-mark">
              <BrandMark size={24} />
            </span>
            <span>
              <div className="brand-name">Lernstudio</div>
              <div className="brand-sub">{sem ? `Semester ${sem.name}` : 'Uni-Vault'}</div>
            </span>
          </a>
          <div className="hero-top-right">
            <SyncBadge />
            <a className="btn btn-icon" href={href('/einstellungen')} aria-label="Einstellungen">
              <Settings2 size={18} />
            </a>
          </div>
        </header>

        <div className="hero-body">
          <div className="hero-left">
            <div className="eyebrow">{formatDateLong(clock)}</div>
            <h1 className="hero-title">{greeting(clock.getHours())}.</h1>
            <p className="hero-lead">
              {shown.length} {shown.length === 1 ? 'Fach' : 'Fächer'} · {model.concepts.length} Concepts · {model.raw.length} Dateien
              {todos.length ? ` · ${todos.length} offene Todos` : ''}
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault()
                navigate(`/suche?q=${encodeURIComponent(q)}`)
              }}
            >
              <Search size={18} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Begriff, Formel, Thema suchen …" aria-label="Im Vault suchen" />
            </form>
          </div>

          <div className="hero-exam">
            {next ? (
              <a className="exam-card" href={href(`/fach/${next.s.slug}`)} style={{ '--c': next.s.color } as CSSProperties}>
                <div className="eyebrow">Nächste Prüfung</div>
                <div className="exam-count">
                  <span className="display num">{next.e!.days}</span>
                  <span>{next.e!.days === 1 ? 'Tag' : 'Tage'}</span>
                </div>
                <div className="exam-subject">{next.s.label}</div>
                <div className="muted small">
                  {next.s.assessment ?? 'Prüfung'} am {formatDay(next.s.examDate!)}
                </div>
                <ReadyRing value={readiness(statusCounts(model.concepts, next.s.slug))} />
              </a>
            ) : (
              <div className="exam-card empty-exam">
                <div className="eyebrow">Nächste Prüfung</div>
                <p className="muted small">Noch kein Prüfungstermin eingetragen. Sobald einer feststeht, sag in Claude Code z. B. „Exam Mode für &lt;Fach&gt;“ oder trag ihn bei der Einrichtung ein.</p>
              </div>
            )}
          </div>
        </div>

        {semProgress !== undefined && sem && (
          <div className="semester-bar" aria-label={`Semester zu ${Math.round(semProgress * 100)} % vorbei`}>
            <div className="semester-track">
              <span style={{ width: `${semProgress * 100}%` }} />
            </div>
            <div className="semester-caption">
              <span>Semester {sem.name}</span>
              <span className="num">{Math.round(semProgress * 100)} %</span>
              {sem.firstExam && <span>Klausurphase ab {formatDay(sem.firstExam)}</span>}
            </div>
          </div>
        )}

        <nav className="tiles" aria-label="Bereiche">
          {tiles.map((t, i) => (
            <a key={t.to} className="tile" href={href(t.to)} style={{ '--i': i } as CSSProperties}>
              <span className="tile-icon">
                <t.icon size={18} strokeWidth={1.9} />
              </span>
              <span className="tile-text">
                <b>{t.label}</b>
                <span>{t.value}</span>
              </span>
            </a>
          ))}
        </nav>
      </section>

      {state === 'unconfigured' && (
        <Notice kind="beige" icon={<Settings2 size={17} />}>
          <b>Vault verbinden:</b> Der Lernstudio zeigt deinen Uni-Vault aus GitHub. Unter{' '}
          <a href={href('/einstellungen')}>Einstellungen</a> trägst du einmal Repo und Zugangsschlüssel ein, dann ist alles da, auch offline.
        </Notice>
      )}
      {state !== 'unconfigured' && model.needsSetup && (
        <Notice kind="warn">
          <b>Vault noch nicht eingerichtet.</b> Öffne Claude Code im Vault und sag: „Richte den Vault für mich ein“. Danach erscheinen hier deine echten Fächer statt der Beispiele.{' '}
          <a href={href('/claude')}>Zu den Befehlen</a>
        </Notice>
      )}

      <section className="card graph-card">
        <div className="section-head">
          <h2>Graph-Ansicht</h2>
          <a className="muted small" href={href('/netz')}>
            Vollbild
          </a>
        </div>
        <KnowledgeGraph graph={model.graph} mode="preview" />
      </section>

      <section>
        <div className="section-head">
          <h2>Fächer</h2>
          <span className="muted small">{shown.length}</span>
        </div>
        {shown.length ? (
          <div className="subject-grid">
            {shown.map((s) => {
              const counts = statusCounts(model.concepts, s.slug)
              const files = model.raw.filter((r) => r.subject === s.slug).length
              return (
                <a key={s.slug} className="subject-card" href={href(`/fach/${s.slug}`)} style={{ '--c': s.color } as CSSProperties}>
                  <div className="subject-card-top">
                    <SubjectBadge label={s.label} short={s.short} color={s.color} />
                    <ExamPill date={s.examDate} />
                  </div>
                  <div>
                    <h3>{s.label}</h3>
                    <div className="muted small">
                      {counts.total} Concepts · {readiness(counts)} % fertig · {files} Dateien
                    </div>
                  </div>
                  <StatusBar counts={counts} />
                </a>
              )
            })}
          </div>
        ) : (
          <div className="card empty-card">
            <p className="muted">{state === 'unconfigured' ? 'Verbinde zuerst deinen Vault.' : state === 'loading' || state === 'syncing' ? 'Lade deinen Vault …' : 'Noch keine Fächer im Vault.'}</p>
          </div>
        )}
      </section>

      <div className="home-columns">
        <section className="card">
          <div className="section-head">
            <h2>Heute lernen</h2>
            <span className="muted small">wartet auf Mitschrift</span>
          </div>
          {learn.length ? (
            <ul className="list">
              {learn.map((c) => (
                <li key={c.path}>
                  <a className="list-row" href={href(`/n/${encodeURIComponent(c.path)}`)}>
                    <span className="grow">
                      <b>{c.title}</b>
                      <span className="muted small">{c.oneLiner}</span>
                    </span>
                    <ArrowUpRight size={15} className="muted" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nichts offen. Neue Folien hochladen oder eine Mitschrift schreiben, dann kommt hier, was Claude noch anreichern muss.</p>
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Todos</h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={openTodo}>
              <Plus size={15} /> Neu
            </button>
          </div>
          {todos.length ? (
            <ul className="list">
              {todos.slice(0, 7).map((t) => (
                <li key={t.title} className="list-row">
                  <button type="button" className="check" onClick={() => void toggle(t.title)} aria-label={`${t.title} erledigen`}>
                    <Check size={13} />
                  </button>
                  <span className="grow">
                    <b>{t.title}</b>
                    <span className="muted small">
                      {[t.date ? formatDay(t.date) : undefined, t.category].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {t.priority === 'high' && <span className="pill pill-now">wichtig</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Keine offenen Todos.</p>
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Zuletzt verarbeitet</h2>
            <span className="muted small">aus log.md</span>
          </div>
          {model.log.length ? (
            <ul className="list">
              {model.log.slice(0, 6).map((l, i) => (
                <li key={i} className="list-row">
                  <span className="grow">
                    <b>{l.detail || l.kind}</b>
                    <span className="muted small">
                      {l.kind} · {relativeTime(`${l.date}T12:00:00`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Noch nichts verarbeitet. Nach dem ersten Upload sagst du Claude Code Bescheid.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ReadyRing({ value }: { value: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="ready-ring" aria-label={`${value} % der Concepts fertig`}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" className="ring-track" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" className="ring-value" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 28 28)" />
      </svg>
      <span className="num">{value}%</span>
      <small>fertig</small>
    </div>
  )
}
