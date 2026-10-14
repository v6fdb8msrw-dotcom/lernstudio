import { CheckCircle2, FolderUp, Link2, Sparkles, Upload as UploadIcon, X } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Empty, Field, Notice, PageHead, Seg } from '../components/ui'
import { openInClaudeCode } from '../lib/claude'
import { formatSize } from '../lib/files'
import { type Route } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import { RAW_KINDS, type RawKind } from '../types'
import { rawPath } from '../vault/model'

const WARN_SIZE = 50 * 1024 * 1024
const MAX_SIZE = 95 * 1024 * 1024

interface Item {
  file: File
  /** Unterpfad beim Ordner-Import (ohne den obersten Ordnernamen) */
  sub: string
}

export default function UploadPage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const { toast } = useToast()
  const subjects = model.subjects.filter((s) => s.active || s.status === 'pending')
  const [slug, setSlug] = useState(route.query.get('fach') ?? subjects[0]?.slug ?? '')
  const [kind, setKind] = useState<RawKind>((route.query.get('typ') as RawKind) || 'slides')
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ count: number; first: string; kind: RawKind; queued: boolean }>()
  const [video, setVideo] = useState({ url: '', title: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const subject = model.subjects.find((s) => s.slug === slug)
  const kindInfo = RAW_KINDS.find((k) => k.kind === kind)!

  const add = (files: FileList | File[] | null) => {
    if (!files) return
    const list = Array.from(files)
      .filter((f) => !f.name.startsWith('.') && f.size > 0)
      .map((file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
        const sub = rel.split('/').slice(1, -1).join('/')
        return { file, sub }
      })
    setItems((prev) => [...prev, ...list])
    setDone(undefined)
  }

  const planned = useMemo(() => {
    if (!subject) return []
    const taken = new Set<string>()
    return items.map((it) => {
      const name = it.sub ? `${it.sub}/${it.file.name}` : it.file.name
      let path = rawPath(subject, kind, name, model.semester?.folder)
      // Gleichnamige Dateien nicht überschreiben
      let n = 2
      while (vault.exists(path) || taken.has(path)) {
        const dot = name.lastIndexOf('.')
        const alt = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
        path = rawPath(subject, kind, alt, model.semester?.folder)
        n++
      }
      taken.add(path)
      return { ...it, path }
    })
  }, [items, subject, kind, model.semester, vault])

  const tooBig = planned.filter((p) => p.file.size > MAX_SIZE)
  const total = planned.reduce((s, p) => s + p.file.size, 0)

  async function upload() {
    if (!subject || !planned.length || tooBig.length) return
    setBusy(true)
    try {
      const result = await vault.write(
        `Upload: ${subject.label} ${kind} (${planned.length} ${planned.length === 1 ? 'Datei' : 'Dateien'})`,
        planned.map((p) => ({ path: p.path, content: p.file })),
      )
      setDone({ count: planned.length, first: planned[0].file.name, kind, queued: result === 'queued' })
      setItems([])
      toast(result === 'sent' ? 'Hochgeladen' : 'Gespeichert – wird gesendet, sobald du online bist')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addVideo() {
    if (!subject || !/^https?:\/\//.test(video.url.trim())) return
    const name = `${(video.title.trim() || 'Video').replace(/[\\/:*?"<>|]+/g, '-')}.txt`
    const path = rawPath(subject, 'videos', name, model.semester?.folder)
    setBusy(true)
    try {
      const r = await vault.write(`Upload: ${subject.label} video link`, [{ path, content: `${video.url.trim()}\n` }])
      setDone({ count: 1, first: name, kind: 'videos', queued: r === 'queued' })
      setVideo({ url: '', title: '' })
    } finally {
      setBusy(false)
    }
  }

  const command = done && subject ? (done.count === 1 ? `${kindTrigger(done.kind)} ${done.first} bereit zum Verarbeiten` : `${kindTrigger(done.kind)} ${subject.label} bereit zum Verarbeiten`) : ''

  if (!model.subjects.length) {
    return (
      <div className="page">
        <PageHead eyebrow="raw/" title="Hochladen" />
        <Empty>{vault.state === 'unconfigured' ? 'Verbinde zuerst deinen Vault unter Einstellungen.' : 'Noch keine Fächer im Vault. Richte den Vault mit Claude Code ein.'}</Empty>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead eyebrow="Rohmaterial für den Vault" title="Hochladen" lead="Dateien landen in raw/<Semester>/<Fach>/<Art>/ – genau da, wo Claude Code sie erwartet. Danach sagst du Claude Bescheid, und es baut Concept-Notes daraus." />

      <section className="card stack">
        <Field label="Fach">
          <div className="chip-row">
            {model.subjects.map((s) => (
              <button key={s.slug} type="button" className="chip subject-chip" aria-pressed={s.slug === slug} style={{ '--c': s.color } as CSSProperties} onClick={() => setSlug(s.slug)}>
                <i /> {s.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Art" hint={kindInfo.hint}>
          <Seg value={kind} onChange={setKind} options={RAW_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
        </Field>
        {subject && <div className="path-hint">Ziel: {rawPath(subject, kind, '…', model.semester?.folder)}</div>}
      </section>

      {kind === 'videos' ? (
        <section className="card stack">
          <Field label="YouTube-Link" htmlFor="video-url">
            <input id="video-url" className="input" inputMode="url" placeholder="https://youtube.com/watch?v=…" value={video.url} onChange={(e) => setVideo((v) => ({ ...v, url: e.target.value }))} />
          </Field>
          <Field label="Titel (wird der Dateiname)" htmlFor="video-title">
            <input id="video-title" className="input" placeholder="z. B. Normalverteilung einfach erklärt" value={video.title} onChange={(e) => setVideo((v) => ({ ...v, title: e.target.value }))} />
          </Field>
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => void addVideo()} disabled={busy || !/^https?:\/\//.test(video.url.trim())}>
              <Link2 size={16} /> Link ablegen
            </button>
          </div>
        </section>
      ) : (
        <section
          className={`dropzone ${drag ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            add(e.dataTransfer.files)
          }}
        >
          <UploadIcon size={28} />
          <b>Dateien hierher ziehen</b>
          <span className="muted small">oder</span>
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Dateien wählen
            </button>
            <button type="button" className="btn desktop-only" onClick={() => dirRef.current?.click()}>
              <FolderUp size={16} /> Ganzen Ordner
            </button>
          </div>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
          <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: '' } as Record<string, string>)} onChange={(e) => add(e.target.files)} />
        </section>
      )}

      {planned.length > 0 && (
        <section className="card stack">
          <div className="section-head">
            <h2>
              {planned.length} {planned.length === 1 ? 'Datei' : 'Dateien'} <span className="muted small">{formatSize(total)}</span>
            </h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems([])}>
              Alle entfernen
            </button>
          </div>
          <ul className="list">
            {planned.map((p, i) => (
              <li key={p.path} className="list-row">
                <span className="grow">
                  <b className="ellipsis">{p.sub ? `${p.sub}/` : ''}{p.file.name}</b>
                  <span className={`small ${p.file.size > MAX_SIZE ? 'danger-text' : p.file.size > WARN_SIZE ? 'warn-text' : 'muted'}`}>
                    {formatSize(p.file.size)}
                    {p.file.size > MAX_SIZE ? ' – zu groß für GitHub (max. 95 MB)' : p.file.size > WARN_SIZE ? ' – groß, dauert etwas' : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-icon sm" aria-label="Entfernen" onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          {tooBig.length > 0 && <Notice kind="warn">Dateien über 95 MB nimmt GitHub nicht an. Teil sie auf oder komprimier das PDF.</Notice>}
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => void upload()} disabled={busy || !subject || tooBig.length > 0}>
              <UploadIcon size={16} /> {busy ? 'Lädt hoch …' : `In den Vault hochladen`}
            </button>
          </div>
        </section>
      )}

      {done && (
        <section className="card done-card">
          <CheckCircle2 size={22} />
          <div className="grow stack-sm">
            <b>{done.queued ? 'Gespeichert, wird gesendet, sobald du online bist.' : `${done.count} ${done.count === 1 ? 'Datei liegt' : 'Dateien liegen'} im Vault.`}</b>
            <span className="muted small">Jetzt Claude Code Bescheid sagen, dann entstehen daraus Concept-Notes:</span>
            <code className="command">{command}</code>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const r = await openInClaudeCode(command)
              toast(r.copied ? 'Befehl kopiert – in Claude Code einfügen' : 'Claude Code geöffnet')
            }}
          >
            <Sparkles size={16} /> Kopieren & Claude Code öffnen
          </button>
        </section>
      )}
    </div>
  )
}

function kindTrigger(kind: RawKind): string {
  return RAW_KINDS.find((k) => k.kind === kind)?.trigger ?? 'Datei'
}
