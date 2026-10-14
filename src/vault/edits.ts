import { isMap, isSeq, YAMLSeq } from 'yaml'
import type { Todo } from '../types'
import { editFrontmatter } from './frontmatter'

/*
 * Kleine, gezielte Änderungen an Vault-Dateien, die die App selbst machen darf.
 * Sie werden immer auf den neuesten Stand angewendet (nicht auf einen veralteten Cache),
 * damit Änderungen von Claude Code oder Obsidian nicht überschrieben werden.
 * Regel aus CLAUDE.md §17: Todos nie löschen, nur ergänzen oder abhaken.
 */

export type EditOp = { op: 'toggleTodo'; arg: string } | { op: 'addTodo'; arg: string }

export function applyEdit(text: string | undefined, edit: EditOp): string | undefined {
  if (text === undefined) return undefined
  if (edit.op === 'toggleTodo') {
    return editFrontmatter(text, (doc) => {
      const todos = doc.get('todos', true)
      if (!isSeq(todos)) return
      for (const item of todos.items) {
        if (isMap(item) && item.get('title') === edit.arg) {
          item.set('done', !(item.get('done') === true))
          break
        }
      }
    })
  }
  if (edit.op === 'addTodo') {
    const todo = JSON.parse(edit.arg) as Todo
    return editFrontmatter(text, (doc) => {
      const entry: Record<string, unknown> = { title: todo.title }
      if (todo.date) entry.date = todo.date
      if (todo.priority) entry.priority = todo.priority
      if (todo.category) entry.category = todo.category
      entry.done = false
      const todos = doc.get('todos', true)
      if (isSeq(todos)) {
        // Leere Liste „todos: []“ als normale Blockliste weiterschreiben
        todos.flow = false
        todos.items.push(doc.createNode(entry))
      } else {
        const seq = new YAMLSeq()
        seq.items.push(doc.createNode(entry))
        doc.set('todos', seq)
      }
    })
  }
  return text
}
