import { Info, X } from 'lucide-react'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { examInfo } from '../lib/date'
import type { ConceptStatus } from '../types'
import type { StatusCounts } from '../vault/model'

export function PageHead({ eyebrow, title, lead, actions, children, color }: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children?: ReactNode; color?: string }) {
  return (
    <header className="page-head" style={color ? ({ '--c': color } as CSSProperties) : undefined}>
      <div className="page-head-main">
        <div className="page-head-text">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog-close)')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.({ preventScroll: true })
    }
  }, [onClose])
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon dialog-close" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function Empty({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div>{children}</div>
      {action}
    </div>
  )
}

export function Notice({ children, kind, icon }: { children: ReactNode; kind?: 'beige' | 'warn' | 'danger'; icon?: ReactNode }) {
  return (
    <div className={`notice ${kind ?? ''}`}>
      {icon ?? <Info size={17} />}
      <div>{children}</div>
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="tab-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  draft: 'Entwurf',
  pending_enrichment: 'Wartet auf Mitschrift',
  enriched: 'Angereichert',
  'exam-ready': 'Prüfungsfertig',
}

export function StatusChip({ status }: { status: ConceptStatus }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
}

/** Gestapelter Balken: Anteile der Concept-Status. */
export function StatusBar({ counts, showLegend }: { counts: StatusCounts; showLegend?: boolean }) {
  const parts: { key: ConceptStatus; n: number }[] = [
    { key: 'exam-ready', n: counts['exam-ready'] },
    { key: 'enriched', n: counts.enriched },
    { key: 'pending_enrichment', n: counts.pending_enrichment },
    { key: 'draft', n: counts.draft },
  ]
  return (
    <div className="statusbar-wrap">
      <div className="statusbar" role="img" aria-label={parts.map((p) => `${STATUS_LABEL[p.key]}: ${p.n}`).join(', ')}>
        {counts.total ? parts.filter((p) => p.n).map((p) => <span key={p.key} className={`sb-${p.key}`} style={{ flex: p.n }} />) : <span className="sb-empty" style={{ flex: 1 }} />}
      </div>
      {showLegend && (
        <div className="statusbar-legend">
          {parts.map((p) => (
            <span key={p.key}>
              <i className={`sb-${p.key}`} /> {STATUS_LABEL[p.key]} <b className="num">{p.n}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ExamPill({ date }: { date?: string }) {
  const e = examInfo(date)
  if (!e) return null
  return <span className={`pill pill-${e.tone}`}>{e.text}</span>
}

export function SubjectBadge({ label, short, color, size = 42 }: { label: string; short: string; color: string; size?: number }) {
  return (
    <span className="subject-badge" style={{ '--c': color, width: size, height: size } as CSSProperties} aria-hidden title={label}>
      {short.slice(0, 3)}
    </span>
  )
}

export function Spinner({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" />
      {label}
    </div>
  )
}
