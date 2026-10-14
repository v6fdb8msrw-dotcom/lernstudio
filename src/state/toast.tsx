import { Check, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

interface ToastApi {
  toast: (text: string, kind?: 'ok' | 'error') => void
}

const ToastContext = createContext<ToastApi>({ toast: () => {} })

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++counter
    setItems((list) => [...list.slice(-2), { id, text, kind }])
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2400)
  }, [])
  const api = useMemo(() => ({ toast }), [toast])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            <span className="tick">{t.kind === 'error' ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}</span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
