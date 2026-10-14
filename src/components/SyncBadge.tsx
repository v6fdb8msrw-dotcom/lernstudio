import { AlertTriangle, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { relativeTime } from '../lib/date'
import { href } from '../state/router'
import { useVault } from '../state/vault'

/** Zeigt, ob der Vault aktuell ist, und gleicht auf Klick ab. */
export function SyncBadge({ compact }: { compact?: boolean }) {
  const { state, lastSync, pending, sync, error } = useVault()
  if (state === 'unconfigured') {
    return (
      <a className="sync-badge warn" href={href('/einstellungen')}>
        <AlertTriangle size={14} /> {compact ? 'Verbinden' : 'Vault verbinden'}
      </a>
    )
  }
  const busy = state === 'syncing' || state === 'loading'
  const label =
    state === 'offline'
      ? `Offline${pending ? ` · ${pending} ausstehend` : ''}`
      : state === 'error'
        ? 'Fehler beim Abgleich'
        : busy
          ? 'Gleicht ab …'
          : pending
            ? `${pending} ausstehend`
            : lastSync
              ? `Aktuell · ${relativeTime(lastSync)}`
              : 'Aktuell'
  return (
    <button type="button" className={`sync-badge ${state === 'error' ? 'danger' : state === 'offline' || pending ? 'warn' : ''}`} onClick={() => void sync(true)} title={error ?? 'Jetzt mit GitHub abgleichen'} disabled={busy}>
      {busy ? <Loader2 size={14} className="spin" /> : state === 'offline' ? <CloudOff size={14} /> : state === 'error' ? <AlertTriangle size={14} /> : <RefreshCw size={14} />}
      <span className={compact ? 'desktop-only' : ''}>{label}</span>
    </button>
  )
}
