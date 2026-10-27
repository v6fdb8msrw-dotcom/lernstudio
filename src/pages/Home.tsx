import { ArrowRight, Check, Plus, Search, Settings2 } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { KnowledgeGraph } from '../components/KnowledgeGraph'
import { useClock } from '../components/hooks'
import { ExamPill, Notice } from '../components/ui'
import { useUi } from '../components/UiContext'
import { examInfo, formatDateLong, formatDay, greeting, relativeTime } from '../lib/date'
import { href, navigate } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import type { Subject } from '../types'
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

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow">{formatDateLong(clock)}</div>
          <h1 className="hero-title">{greeting(clock.getHours())}.</h1>
          <p className="hero-lead">
            {shown.length} {shown.length === 1 ? 'Fach' : 'Fächer'} in diesem Semester, {model.concepts.length} Begriffe und {model.raw.length} Dateien in deinem Vault
            {todos.length ? `, ${todos.length} offene ${todos.length === 1 ? 'Aufgabe' : 'Aufgaben'}` : ''}.
          </p>
          <form
            className="hero-search"
            onSubmit={(e) => {
              e.preventDefault()
              navigate(`/suche?q=${encodeURIComponent(q)}`)
            }}
          >
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Begriff, Formel, Thema nachschlagen …" aria-label="Im Vault suchen" />
            <button type="submit" className="hero-search-go" aria-label="Suchen">
              <ArrowRight size={17} />
            </button>
          </form>
        </div>

        <Bookshelf subjects={shown} />
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

      <div className="almanac">
        <section className="almanac-card exam-card" style={next ? ({ '--c': next.s.color } as CSSProperties) : undefined}>
          <div className="eyebrow">Nächste Prüfung</div>
          {next ? (
            <a className="exam-body" href={href(`/fach/${next.s.slug}`)}>
              <span className="exam-days display num">{next.e!.days}</span>
              <span>
                <span className="exam-unit">{next.e!.days === 1 ? 'Tag bis' : 'Tage bis'}</span>
                <span className="exam-subject">{next.s.label}</span>
                <span className="muted small">
                  {next.s.assessment ?? 'Prüfung'} am {formatDay(next.s.examDate!)} · {readiness(statusCounts(model.concepts, next.s.slug))} % gelernt
                </span>
              </span>
            </a>
          ) : (
            <p className="muted small">Noch kein Prüfungstermin eingetragen. Sobald einer feststeht, sag in Claude Code z. B. „Exam Mode für &lt;Fach&gt;“.</p>
          )}
        </section>

        {semProgress !== undefined && sem ? (
          <section className="almanac-card">
            <div className="eyebrow">Semester {sem.name}</div>
            <div className="sem-figure">
              <span className="display num">{Math.round(semProgress * 100)}</span>
              <span className="muted">% vorbei</span>
            </div>
            <div className="semester-track" aria-hidden>
              <span style={{ width: `${semProgress * 100}%` }} />
            </div>
            {sem.firstExam && <div className="muted small">Klausurphase ab {formatDay(sem.firstExam)}</div>}
          </section>
        ) : (
          <section className="almanac-card">
            <div className="eyebrow">Semester</div>
            <p className="muted small">Start und Ende des Semesters stehen noch nicht im Dashboard.</p>
          </section>
        )}
      </div>

      <section className="paper graph-card">
        <div className="section-head">
          <h2>Wissensnetz</h2>
          <a className="link-quiet" href={href('/netz')}>
            Vollbild <ArrowRight size={14} />
          </a>
        </div>
        <KnowledgeGraph graph={model.graph} mode="preview" />
      </section>

      <section className="contents">
        <div className="section-head">
          <h2>Inhaltsverzeichnis</h2>
          <a className="link-quiet" href={href('/begriffe')}>
            Alle Begriffe <ArrowRight size={14} />
          </a>
        </div>
        {shown.length ? (
          <ol className="toc">
            {shown.map((s, i) => {
              const counts = statusCounts(model.concepts, s.slug)
              const files = model.raw.filter((r) => r.subject === s.slug).length
              return (
                <li key={s.slug} style={{ '--c': s.color } as CSSProperties}>
                  <a href={href(`/fach/${s.slug}`)}>
                    <span className="toc-num display">{toRoman(i + 1)}</span>
                    <span className="toc-title">
                      <span className="display">{s.label}</span>
                      <span className="muted small">
                        {counts.total} {counts.total === 1 ? 'Begriff' : 'Begriffe'} · {files} {files === 1 ? 'Datei' : 'Dateien'} · {readiness(counts)} % gelernt
                      </span>
                    </span>
                    <span className="toc-leader" aria-hidden />
                    <ExamPill date={s.examDate} />
                  </a>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="muted">{state === 'unconfigured' ? 'Verbinde zuerst deinen Vault.' : state === 'loading' || state === 'syncing' ? 'Lade deinen Vault …' : 'Noch keine Fächer im Vault.'}</p>
        )}
      </section>

      <div className="home-columns">
        <section className="paper">
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
                    <ArrowRight size={15} className="muted" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nichts offen. Neue Folien hochladen oder eine Mitschrift schreiben, dann steht hier, was Claude noch anreichern muss.</p>
          )}
        </section>

        <section className="paper">
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
                    <span className="muted small">{[t.date ? formatDay(t.date) : undefined, t.category].filter(Boolean).join(' · ')}</span>
                  </span>
                  {t.priority === 'high' && <span className="pill pill-now">wichtig</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Keine offenen Todos.</p>
          )}
        </section>

        <section className="paper">
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

/** Neutrale Bücher, die das Regal füllen (nicht anklickbar). */
const FILLER = [
  { c: '#d8c8a6', w: 30, h: 72 },
  { c: '#8a7a5c', w: 24, h: 80 },
  { c: '#ece2cc', w: 36, h: 66 },
]

/** Die Fächer als Buchrücken im Regal. Höhe und Breite variieren leicht, ein Klick öffnet das Fach. */
function Bookshelf({ subjects }: { subjects: Subject[] }) {
  return (
    <div className="shelf" aria-label="Deine Fächer">
      <div className="shelf-books">
        {FILLER.slice(0, 2).map((f, i) => (
          <span key={`a${i}`} className="book book-plain" style={{ '--spine': f.c, '--w': `${f.w}px`, '--h': `${f.h}%`, '--i': i } as CSSProperties} aria-hidden />
        ))}
        {subjects.map((s, i) => {
          const style = { '--c': s.color, '--h': `${86 + ((i * 37) % 14)}%`, '--w': `${62 + ((i * 23) % 12)}px`, '--i': i + 2, '--fs': s.label.length > 18 ? '15px' : s.label.length > 13 ? '17px' : '19px' } as CSSProperties
          return (
            <a key={s.slug} className="book" href={href(`/fach/${s.slug}`)} style={style} title={`${s.label} öffnen`}>
              <span className="book-band" />
              <span className="book-title">{s.label}</span>
              <span className="book-foot num">{s.short}</span>
            </a>
          )
        })}
        <span className="book book-plain book-lean" style={{ '--spine': FILLER[2].c, '--w': `${FILLER[2].w}px`, '--h': `${FILLER[2].h}%`, '--i': subjects.length + 2 } as CSSProperties} aria-hidden />
        <span className="book-end" aria-hidden />
      </div>
      <div className="shelf-board" aria-hidden />
    </div>
  )
}

function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, r] of map) {
    while (n >= v) {
      out += r
      n -= v
    }
  }
  return out
}
