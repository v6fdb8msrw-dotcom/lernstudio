import { ListTodo, NotebookPen, Sparkles, Upload } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { navigate } from '../state/router'
import { TodoDialog } from './TodoDialog'
import { Modal } from './ui'

interface UiApi {
  openQuick: () => void
  openTodo: () => void
}

const UiContext = createContext<UiApi | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [quick, setQuick] = useState(false)
  const [todo, setTodo] = useState(false)
  const openQuick = useCallback(() => setQuick(true), [])
  const openTodo = useCallback(() => setTodo(true), [])
  const api = useMemo(() => ({ openQuick, openTodo }), [openQuick, openTodo])

  const go = (to: string) => {
    setQuick(false)
    navigate(to)
  }

  return (
    <UiContext.Provider value={api}>
      {children}
      {todo && <TodoDialog onClose={() => setTodo(false)} />}
      {quick && (
        <Modal title="Was möchtest du tun?" onClose={() => setQuick(false)}>
          <div className="quick-grid">
            <button type="button" className="quick-item" onClick={() => go('/hochladen')}>
              <Upload size={22} />
              <b>Dateien hochladen</b>
              <span>Folien, Bücher, Paper, auch viele auf einmal</span>
            </button>
            <button type="button" className="quick-item" onClick={() => go('/mitschrift')}>
              <NotebookPen size={22} />
              <b>Mitschrift schreiben</b>
              <span>Mit Fotos – daraus baut Claude die Concept-Notes</span>
            </button>
            <button
              type="button"
              className="quick-item"
              onClick={() => {
                setQuick(false)
                setTodo(true)
              }}
            >
              <ListTodo size={22} />
              <b>Todo anlegen</b>
              <span>Klausur, Abgabe, Lernplan</span>
            </button>
            <button type="button" className="quick-item" onClick={() => go('/claude')}>
              <Sparkles size={22} />
              <b>Claude fragen</b>
              <span>Allgemein oder im Vault arbeiten lassen</span>
            </button>
          </div>
        </Modal>
      )}
    </UiContext.Provider>
  )
}

export function useUi(): UiApi {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi außerhalb von UiProvider')
  return ctx
}
