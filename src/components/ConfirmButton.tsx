import { Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/** Zweistufiges Löschen: erster Klick fragt nach, zweiter Klick löscht. */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = 'Wirklich löschen?',
  icon = true,
  className = 'btn btn-ghost btn-icon sm',
  children,
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  icon?: boolean
  className?: string
  children?: ReactNode
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3500)
    return () => window.clearTimeout(t)
  }, [armed])
  if (armed) {
    return (
      <button type="button" className="btn btn-sm btn-danger solid" onClick={onConfirm} autoFocus>
        {confirmLabel}
      </button>
    )
  }
  return (
    <button type="button" className={className} onClick={() => setArmed(true)} aria-label={label ?? 'Löschen'} title={label ?? 'Löschen'}>
      {children ?? (icon && <Trash2 size={15} />)}
    </button>
  )
}
