import { useState } from 'react'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import type { Todo } from '../types'
import { Field, Modal, Seg } from './ui'

const CATEGORIES = ['Klausur', 'Abgabe', 'Lernplan', 'Concept']

/** Neues Todo in wiki/dashboard/todos.md (nur ergänzen, nie überschreiben – CLAUDE.md §17). */
export function TodoDialog({ onClose }: { onClose: () => void }) {
  const vault = useVault()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [priority, setPriority] = useState<NonNullable<Todo['priority']>>('medium')
  const [category, setCategory] = useState('Klausur')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim()) return
    setBusy(true)
    try {
      await vault.addTodo({ title: title.trim(), date: date || undefined, priority, category, done: false })
      toast(vault.state === 'offline' ? 'Gespeichert, wird gesendet, sobald du online bist' : 'Todo angelegt')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Neues Todo"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!title.trim() || busy}>
            Anlegen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Was?" htmlFor="todo-title">
          <input id="todo-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Hausarbeit Statistik abgeben" onKeyDown={(e) => e.key === 'Enter' && void save()} />
        </Field>
        <Field label="Bis wann? (optional)" htmlFor="todo-date">
          <input id="todo-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Wichtigkeit">
          <Seg
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'high', label: 'Hoch' },
              { value: 'medium', label: 'Mittel' },
              { value: 'low', label: 'Niedrig' },
            ]}
          />
        </Field>
        <Field label="Kategorie">
          <Seg value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
    </Modal>
  )
}
