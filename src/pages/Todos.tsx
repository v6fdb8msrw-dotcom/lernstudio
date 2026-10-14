import { Check, Plus, Undo2 } from 'lucide-react'
import { Empty, PageHead } from '../components/ui'
import { useUi } from '../components/UiContext'
import { formatDay } from '../lib/date'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import type { Todo } from '../types'

const PRIO: Record<NonNullable<Todo['priority']>, string> = { high: 'hoch', medium: 'mittel', low: 'niedrig' }

/** Todos aus wiki/dashboard/todos.md: abhaken, wieder öffnen, neue anlegen (gelöscht wird nie – CLAUDE.md §17). */
export default function TodosPage() {
  const vault = useVault()
  const { openTodo } = useUi()
  const { toast } = useToast()
  const open = vault.model.todos.filter((t) => !t.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  const done = vault.model.todos.filter((t) => t.done)

  const toggle = async (t: Todo) => {
    await vault.toggleTodo(t.title)
    toast(t.done ? 'Wieder offen' : 'Erledigt')
  }

  const row = (t: Todo) => (
    <li key={t.title} className={`list-row ${t.done ? 'done' : ''}`}>
      <button type="button" className={`check ${t.done ? 'on' : ''}`} onClick={() => void toggle(t)} aria-label={t.done ? `${t.title} wieder öffnen` : `${t.title} erledigen`}>
        {t.done ? <Undo2 size={13} /> : <Check size={13} />}
      </button>
      <span className="grow">
        <b>{t.title}</b>
        <span className="muted small">{[t.date ? formatDay(t.date) : undefined, t.category, t.priority ? `Priorität ${PRIO[t.priority]}` : undefined].filter(Boolean).join(' · ')}</span>
      </span>
    </li>
  )

  return (
    <div className="page">
      <PageHead
        eyebrow="wiki/dashboard/todos.md"
        title="Todos"
        lead="Klausuren, Abgaben, Lernplan. Claude Code liest dieselbe Liste."
        actions={
          <button type="button" className="btn btn-primary" onClick={openTodo}>
            <Plus size={16} /> Neues Todo
          </button>
        }
      />
      <section>
        <div className="section-head">
          <h2>Offen</h2>
          <span className="muted small">{open.length}</span>
        </div>
        {open.length ? <ul className="card list">{open.map(row)}</ul> : <Empty>Alles erledigt.</Empty>}
      </section>
      {done.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Erledigt</h2>
            <span className="muted small">{done.length}</span>
          </div>
          <ul className="card list">{done.map(row)}</ul>
        </section>
      )}
    </div>
  )
}
