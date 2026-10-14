import { AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Laptop, RefreshCw, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmButton } from '../components/ConfirmButton'
import { Field, Notice, PageHead } from '../components/ui'
import { copyText } from '../lib/claude'
import { formatSize } from '../lib/files'
import { relativeTime } from '../lib/date'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import type { VaultConfig } from '../types'

const DEFAULTS: VaultConfig = { owner: 'v6fdb8msrw-dotcom', repo: 'Uni-', branch: 'main', token: '', obsidianVault: 'Uni' }

export default function SettingsPage() {
  const vault = useVault()
  const { toast } = useToast()
  const [cfg, setCfg] = useState<VaultConfig>(vault.config ?? DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<{ used: number; quota: number }>()

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
  }, [vault.lastSync])

  const obsidianCommand = `bash -c "$(curl -fsSL ${new URL('obsidian-mac.sh', window.location.origin + import.meta.env.BASE_URL).href})" setup ${cfg.owner || 'BESITZER'}/${cfg.repo || 'REPO'}`

  const set = (k: keyof VaultConfig) => (e: { target: { value: string } }) => setCfg((c) => ({ ...c, [k]: e.target.value.trim() }))

  async function connect() {
    setBusy(true)
    try {
      await vault.saveConfig(cfg)
      toast('Verbunden')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHead eyebrow="Einstellungen" title="Vault-Verbindung" lead="Der Lernstudio liest und schreibt deinen Uni-Vault direkt in GitHub. Der Zugangsschlüssel bleibt nur auf diesem Gerät gespeichert." />

      {vault.config && vault.isPrivate === false && (
        <Notice kind="danger" icon={<AlertTriangle size={17} />}>
          <b>Dein Vault-Repo ist öffentlich.</b> Folien, Mitschriften und Noten sind dann für alle sichtbar. Auf GitHub: Repo → Settings → ganz unten „Change visibility“ → Private. Kostet nichts.
        </Notice>
      )}
      {vault.state === 'error' && vault.error && <Notice kind="danger">{vault.error}</Notice>}

      <section className="card stack">
        <div className="section-head">
          <h2>
            <KeyRound size={17} /> GitHub
          </h2>
          {vault.config && vault.state === 'ready' && (
            <span className="ok-text small">
              <CheckCircle2 size={14} /> verbunden{vault.lastSync ? ` · abgeglichen ${relativeTime(vault.lastSync)}` : ''}
            </span>
          )}
        </div>
        <div className="form-grid two">
          <Field label="Besitzer" htmlFor="cfg-owner">
            <input id="cfg-owner" className="input" value={cfg.owner} onChange={set('owner')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label="Repo" htmlFor="cfg-repo">
            <input id="cfg-repo" className="input" value={cfg.repo} onChange={set('repo')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label="Branch" htmlFor="cfg-branch">
            <input id="cfg-branch" className="input" value={cfg.branch} onChange={set('branch')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label="Name des Vaults in Obsidian" htmlFor="cfg-obsidian" hint="Für den Knopf „In Obsidian öffnen“ (so heißt der Ordner in Obsidian).">
            <input id="cfg-obsidian" className="input" value={cfg.obsidianVault} onChange={set('obsidianVault')} />
          </Field>
        </div>
        <Field label="Zugangsschlüssel (Fine-grained Token)" htmlFor="cfg-token" hint="Beginnt mit github_pat_. Wird nur auf diesem Gerät gespeichert, nie im Code oder Repo.">
          <input id="cfg-token" className="input" type="password" value={cfg.token} onChange={set('token')} autoComplete="off" placeholder="github_pat_…" />
        </Field>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => void connect()} disabled={busy || !cfg.owner || !cfg.repo || !cfg.token}>
            {busy ? 'Verbinde …' : vault.config ? 'Speichern & neu abgleichen' : 'Verbinden'}
          </button>
          {vault.config && (
            <button type="button" className="btn" onClick={() => void vault.sync(true)}>
              <RefreshCw size={16} /> Jetzt abgleichen
            </button>
          )}
        </div>

        <details className="disclosure">
          <summary>So bekommst du den Zugangsschlüssel (2 Minuten, kostenlos)</summary>
          <ol className="steps-list">
            <li>
              Auf GitHub öffnen:{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                Settings → Developer settings → Fine-grained tokens → Generate new token <ExternalLink size={13} />
              </a>
            </li>
            <li>Name: „Lernstudio“. Ablaufdatum: z. B. in einem Jahr.</li>
            <li>
              <b>Repository access:</b> „Only select repositories“ → nur dein Vault-Repo ({cfg.repo || 'Uni-'}).
            </li>
            <li>
              <b>Permissions:</b> auf „+ Add permissions“ klicken, „Contents“ auswählen und rechts daneben „Read and write“ einstellen. (In der
              älteren GitHub-Ansicht: Repository permissions → Contents → Read and write.) Sonst nichts.
            </li>
            <li>„Generate token“, Schlüssel kopieren und oben einfügen. Auf iPhone und Mac jeweils einmal eintragen.</li>
          </ol>
          <p className="muted small">Der Schlüssel darf nur dieses eine Repo lesen und schreiben. Wird ein Gerät verloren, löschst du ihn auf GitHub einfach.</p>
        </details>
      </section>

      <section className="card stack">
        <h2>
          <Laptop size={17} /> Obsidian am Mac – automatisch abgeglichen
        </h2>
        <p className="muted">
          Obsidian ist dein Schreibtisch, der Lernstudio dein Lern-Cockpit – beide arbeiten auf denselben Dateien. Einmal am Mac im Terminal (Programme →
          Dienstprogramme) diesen Befehl einfügen und Enter drücken. Er fragt nach deinem Zugangsschlüssel (derselbe wie oben).
        </p>
        <code className="command">{obsidianCommand}</code>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={async () => ((await copyText(obsidianCommand)) ? toast('Befehl kopiert – im Terminal einfügen') : toast('Kopieren ging nicht – bitte markieren und kopieren', 'error'))}
          >
            <Copy size={16} /> Befehl kopieren
          </button>
        </div>
        <ul className="plain-list muted small">
          <li>Der Vault landet in deinem Benutzerordner unter „Uni“. In Obsidian: „Open folder as vault“ → diesen Ordner → „Trust author and enable plugins“.</li>
          <li>Dashboard-Erweiterungen (Dataview, Homepage) und das Theme holt der Befehl gleich mit – nichts von Hand installieren.</li>
          <li>Alle 2 Minuten gleicht der Mac im Hintergrund ab: Was du in Obsidian schreibst, erscheint hier; was du hier anlegst, erscheint in Obsidian.</li>
          <li>Screenshots mit ⌘⇧4 und dann ⌘V in die Notiz, Foliensätze einfach reinziehen – in Obsidian wie hier.</li>
        </ul>
      </section>

      <section className="card stack">
        <h2>Auf diesem Gerät</h2>
        <dl className="kv">
          <dt>Ausstehende Änderungen</dt>
          <dd>{vault.pending ? `${vault.pending} – werden gesendet, sobald du online bist` : 'keine'}</dd>
          <dt>Dateien im Vault</dt>
          <dd>
            {vault.model.markdown.length} Notes · {vault.model.raw.length} Rohdateien
          </dd>
          {usage && (
            <>
              <dt>Zwischenspeicher</dt>
              <dd>
                {formatSize(usage.used)} {usage.quota ? `von ${formatSize(usage.quota)}` : ''}
              </dd>
            </>
          )}
        </dl>
        {vault.config && (
          <div className="page-actions">
            <ConfirmButton className="btn btn-ghost" confirmLabel="Wirklich trennen?" onConfirm={() => void vault.disconnect()}>
              <Unplug size={16} /> Verbindung trennen & Zwischenspeicher leeren
            </ConfirmButton>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Kostenlos – so funktioniert’s</h2>
        <ul className="plain-list muted small">
          <li>Die App liegt gratis auf GitHub Pages und läuft auf iPhone und Mac wie eine installierte App.</li>
          <li>Dein Vault ist ein privates GitHub-Repo (gratis). Obsidian liest dieselben Dateien am Mac.</li>
          <li>Die KI-Arbeit macht Claude Code bzw. claude.ai über deinen normalen Claude-Zugang – keine API-Kosten.</li>
        </ul>
      </section>
    </div>
  )
}
