import { CheckCircle2, Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Editor, type EditorApi } from '../components/Editor'
import { Field, Notice, PageHead, Spinner } from '../components/ui'
import { openInClaudeCode } from '../lib/claude'
import { prepareImage } from '../lib/files'
import { canEditInApp, imagesIn, sanitize, toMarkdown } from '../lib/html'
import { href, type Route } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import type { Subject } from '../types'
import { editFrontmatter, splitFrontmatter } from '../vault/frontmatter'
import { renderMarkdown } from '../vault/markdown'
import { basename, rawPath, resolveLink } from '../vault/model'

const DRAFT_KEY = 'lernstudio.mitschrift.entwurf'
/** Nach so viel Tipp-Pause wird gespeichert … */
const IDLE_MS = 6000
/** … und beim Durchschreiben spätestens nach dieser Zeit. */
const MAX_WAIT_MS = 45000
/** GitHub nimmt keine Dateien über 100 MB an. */
const MAX_FILE = 95 * 1024 * 1024

interface Draft {
  fach: string
  title: string
  html: string
  at: string
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date; queued: boolean }
  | { kind: 'error'; message: string }

function readDraft(): Draft | undefined {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

function writeDraft(d: Draft | undefined) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // kein Speicher (privates Fenster): dann eben ohne Entwurf
  }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clock(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Mitschrift schreiben oder weiterschreiben. Speichert automatisch in den Vault (Tipp-Pause, spätestens
 * alle 45 s, beim Verlassen), als Markdown in raw/<Semester>/<Fach>/notes/. Fotos und Screenshots landen
 * in raw/assets/, Foliensätze sofort in raw/<Semester>/<Fach>/slides/ (eingebettet als ![[…]]).
 */
export default function MitschriftPage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const { toast } = useToast()
  const editPath = route.query.get('pfad') ?? undefined
  const [slug, setSlug] = useState(route.query.get('fach') ?? model.subjects.find((s) => s.active)?.slug ?? '')
  const [title, setTitle] = useState('')
  const [initial, setInitial] = useState<string>()
  const [blocked, setBlocked] = useState(false)
  const [path, setPath] = useState(editPath)
  const [status, setStatus] = useState<SaveState>({ kind: 'idle' })
  const [command, setCommand] = useState<string>()
  const [restored, setRestored] = useState(false)
  const draft = useMemo(() => (!editPath ? readDraft() : undefined), [editPath])

  const api = useRef<EditorApi | null>(null)
  const pending = useRef(new Map<string, { blob: Blob; url: string }>())
  const uploaded = useRef(new Set<string>())
  const fmRaw = useRef('')
  const version = useRef(0)
  const savedVersion = useRef(0)
  const firstDirty = useRef<number | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)
  const draftTimer = useRef<number | undefined>(undefined)
  const queue = useRef<Promise<void>>(Promise.resolve())
  // Aktuelle Werte für Speichern aus Timern und beim Verlassen (die sehen sonst alte Closures)
  const live = useRef({ vault, model, slug, title, path })
  live.current = { vault, model, slug, title, path }

  const subjectFor = (p: string | undefined, s: string): Subject | undefined =>
    p ? live.current.model.subjects.find((x) => p.includes(`/${x.slug}/`)) : live.current.model.subjects.find((x) => x.slug === s)
  const subject = subjectFor(path, slug)

  // Bestehende Mitschrift laden
  useEffect(() => {
    if (!editPath) {
      setInitial('')
      return
    }
    let alive = true
    void vault.text(editPath).then((md) => {
      if (!alive) return
      const { raw, body } = splitFrontmatter(md ?? '')
      if (!canEditInApp(body)) {
        setBlocked(true)
        setInitial('')
        return
      }
      fmRaw.current = raw
      const h1 = body.match(/^\s*#\s+(.+)\n?/)
      setTitle(h1 ? h1[1].trim() : basename(editPath).replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}\s+/, ''))
      const rest = h1 ? body.slice((h1.index ?? 0) + h1[0].length) : body
      const html = renderMarkdown(rest, { resolve: (t) => resolveLink(model, t), notePath: editPath })
      // Eingebettete Bilder und Dateien als Dateinamen merken, damit sie beim Speichern wieder ![[…]] werden
      const tpl = document.createElement('template')
      tpl.innerHTML = html
      for (const img of Array.from(tpl.content.querySelectorAll('img[data-vault]'))) img.setAttribute('data-file', basename(img.getAttribute('data-vault')!))
      for (const a of Array.from(tpl.content.querySelectorAll('a.file-embed[data-vault]'))) a.setAttribute('data-file', basename(a.getAttribute('data-vault')!))
      setInitial(sanitize(tpl.innerHTML))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPath])

  // Beim Wegklicken, App-Wechsel (iPhone) oder Schließen sofort speichern
  useEffect(() => {
    const flushNow = () => {
      if (version.current !== savedVersion.current) void save('leave')
    }
    const onVisibility = () => document.visibilityState === 'hidden' && flushNow()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushNow)
      window.clearTimeout(timer.current)
      window.clearTimeout(draftTimer.current)
      flushNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Jede Änderung: zählen, Entwurf lokal sichern, Speichern einplanen. */
  function changed() {
    version.current++
    firstDirty.current ??= Date.now()
    setStatus((s) => (s.kind === 'waiting' || s.kind === 'saving' ? s : { kind: 'waiting' }))
    if (!live.current.path) {
      window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(() => {
        writeDraft({ fach: live.current.slug, title: live.current.title, html: api.current?.html() ?? '', at: new Date().toISOString() })
      }, 800)
    }
    schedule()
  }

  function schedule() {
    window.clearTimeout(timer.current)
    const due = (firstDirty.current ?? Date.now()) + MAX_WAIT_MS - Date.now()
    timer.current = window.setTimeout(() => void save('auto'), Math.max(0, Math.min(IDLE_MS, due)))
  }

  /** Speichervorgänge laufen nacheinander, nie parallel. */
  function save(mode: 'auto' | 'manual' | 'leave'): Promise<void> {
    window.clearTimeout(timer.current)
    const run = queue.current.then(() => saveNow(mode))
    queue.current = run.catch(() => undefined)
    return run
  }

  function uniquePath(p: string): string {
    const { vault, model } = live.current
    const taken = (x: string) => vault.exists(x) || model.raw.some((r) => r.name === basename(x))
    if (!taken(p)) return p
    const dot = p.lastIndexOf('.')
    for (let i = 2; ; i++) {
      const next = `${p.slice(0, dot)} (${i})${p.slice(dot)}`
      if (!taken(next)) return next
    }
  }

  async function saveNow(mode: 'auto' | 'manual' | 'leave') {
    const v = version.current
    if (v === savedVersion.current && mode !== 'manual') return
    const { vault, model, slug, title, path: current } = live.current
    const subj = subjectFor(current, slug)
    if (!subj) {
      if (mode === 'manual') toast('Wähl zuerst ein Fach.', 'error')
      setStatus({ kind: 'idle' })
      return
    }
    const html = api.current?.html() ?? ''
    const text = toMarkdown(html)
    const name = title.trim() || 'Mitschrift'
    // Neue, noch leere Mitschrift nicht als leere Datei anlegen
    if (!current && !title.trim() && !text.trim()) {
      setStatus({ kind: 'idle' })
      return
    }
    const target = current ?? uniquePath(rawPath(subj, 'notes', `${today()} ${name}.md`, model.semester?.folder))
    const fm =
      fmRaw.current ||
      [`title: ${JSON.stringify(name)}`, 'type: notes', `subject: ${subj.slug}`, `semester: ${subj.semFolder || model.semester?.folder || ''}`, `created: ${today()}`].join('\n')
    const md = editFrontmatter(`---\n${fm}\n---\n\n# ${name}\n\n${text}\n`, (doc) => {
      if (doc.has('title')) doc.set('title', name)
    })
    const images = imagesIn(html).filter((n) => pending.current.has(n) && !uploaded.current.has(n))
    setStatus({ kind: 'saving' })
    try {
      const r = await vault.write(`Mitschrift: ${subj.label} – ${name}${mode === 'manual' ? '' : ' (automatisch)'}`, [
        { path: target, content: md },
        ...images.map((n) => ({ path: `raw/assets/${n}`, content: pending.current.get(n)!.blob })),
      ])
      for (const n of images) uploaded.current.add(n)
      fmRaw.current = splitFrontmatter(md).raw
      savedVersion.current = v
      if (version.current === v) firstDirty.current = undefined
      if (!current) {
        // Ab jetzt ist das diese Datei: Adresse merken (ohne Neuladen, damit der Cursor bleibt)
        live.current.path = target
        setPath(target)
        history.replaceState(null, '', `#/mitschrift?pfad=${encodeURIComponent(target)}`)
        window.clearTimeout(draftTimer.current)
        writeDraft(undefined)
      }
      setCommand(editPath ? `Mitschrift ${subj.label} aktualisiert` : `Mitschrift ${basename(target)} bereit zum Verarbeiten`)
      setStatus({ kind: 'saved', at: new Date(), queued: r === 'queued' })
      if (mode === 'manual') toast(r === 'sent' ? 'Im Vault gespeichert' : 'Gespeichert – wird gesendet, sobald du online bist')
      if (version.current !== v) schedule() // beim Speichern weitergeschrieben
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({ kind: 'error', message })
      if (mode === 'manual') toast(message, 'error')
    }
  }

  async function onImage(file: File) {
    try {
      const blob = await prepareImage(file)
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const name = `mitschrift-${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const url = URL.createObjectURL(blob)
      pending.current.set(name, { blob, url })
      return { name, url }
    } catch {
      toast('Dieses Bild konnte nicht gelesen werden. Nimm JPG oder PNG.', 'error')
      return undefined
    }
  }

  /** Foliensatz sofort in den slides-Ordner des Fachs legen und in der Mitschrift einbetten. */
  async function onFile(file: File) {
    const subj = subjectFor(live.current.path, live.current.slug)
    if (!subj) {
      toast('Wähl zuerst ein Fach – die Folien kommen in seinen Ordner.', 'error')
      return undefined
    }
    if (file.size > MAX_FILE) {
      toast(`${file.name} ist größer als 95 MB, das nimmt GitHub nicht an.`, 'error')
      return undefined
    }
    const target = uniquePath(rawPath(subj, 'slides', file.name, live.current.model.semester?.folder))
    toast(`Lade ${basename(target)} hoch …`)
    try {
      const r = await live.current.vault.write(`Folien: ${subj.label} – ${basename(target)}`, [{ path: target, content: file }])
      toast(r === 'sent' ? `Folien im Vault: ${subj.label} › slides` : 'Folien gespeichert – werden gesendet, sobald du online bist')
      return { name: basename(target) }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
      return undefined
    }
  }

  async function resolveImage(name: string) {
    const p = pending.current.get(name)
    if (p) return p.url
    const path = resolveLink(model, name) ?? `raw/assets/${name}`
    return vault.fileUrl(path)
  }

  if (initial === undefined) return <div className="page"><Spinner label="Lade Mitschrift …" /></div>

  if (blocked && editPath) {
    return (
      <div className="page">
        <PageHead eyebrow={editPath.split('/').slice(0, -1).join(' / ')} title="In Obsidian bearbeiten" />
        <Notice kind="beige">
          Diese Notiz hat aufklappbare Kästen, Tabellen, Formeln oder Links, die der App-Editor nicht kann. Damit beim Speichern nichts verloren geht,
          bearbeitest du sie in Obsidian. Lesen geht hier: <a href={href(`/n/${encodeURIComponent(editPath)}`)}>Notiz öffnen</a>
        </Notice>
      </div>
    )
  }

  const busy = status.kind === 'saving'
  const statusText =
    status.kind === 'saving'
      ? 'Speichert …'
      : status.kind === 'waiting'
        ? 'Speichert gleich automatisch …'
        : status.kind === 'saved'
          ? status.queued
            ? `Offline gespeichert ${clock(status.at)} – geht raus, sobald du online bist`
            : `Automatisch gespeichert · ${clock(status.at)}`
          : status.kind === 'error'
            ? `Nicht gespeichert: ${status.message}`
            : path
              ? 'Alles gespeichert'
              : subject
                ? 'Speichert automatisch, sobald du schreibst'
                : 'Wähl ein Fach, dann speichert die Mitschrift automatisch'

  return (
    <div className="page" style={subject ? ({ '--c': subject.color } as CSSProperties) : undefined}>
      <PageHead
        color={subject?.color}
        eyebrow={path ? path.split('/').slice(0, -1).join(' / ') : 'Neue Mitschrift'}
        title={editPath ? 'Mitschrift bearbeiten' : 'Mitschrift schreiben'}
        lead="Screenshots mit ⌘V, Fotos und Foliensätze einfach reinziehen. Alles landet automatisch in deinem Vault – und damit auch in Obsidian."
        actions={
          <>
            <span className={`save-status ${status.kind}`} aria-live="polite">
              {statusText}
            </span>
            <button type="button" className="btn btn-primary" onClick={() => void save('manual')} disabled={busy || !subject}>
              <Save size={16} /> Jetzt speichern
            </button>
          </>
        }
      />

      {draft && !path && !restored && status.kind === 'idle' && (
        <Notice kind="beige">
          Es gibt einen ungespeicherten Entwurf „{draft.title || 'ohne Titel'}“.{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setSlug(draft.fach)
              setTitle(draft.title)
              setInitial(draft.html)
              setRestored(true)
              live.current.slug = draft.fach
              live.current.title = draft.title
              changed()
            }}
          >
            Wiederherstellen
          </button>
        </Notice>
      )}

      <section className="card stack">
        {!path && (
          <Field label="Fach">
            <div className="chip-row">
              {model.subjects.map((s) => (
                <button key={s.slug} type="button" className="chip subject-chip" aria-pressed={s.slug === slug} style={{ '--c': s.color } as CSSProperties} onClick={() => {
                    setSlug(s.slug)
                    live.current.slug = s.slug
                    if (version.current !== savedVersion.current) schedule()
                  }}
                >
                  <i /> {s.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        <input
          className="title-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            live.current.title = e.target.value
            changed()
          }}
          placeholder="Titel, z. B. Vorlesung 3 – Regression"
          aria-label="Titel"
        />
        <Editor key={initial.length + (editPath ?? '')} initialHtml={initial} apiRef={api} onChange={changed} onImage={onImage} onFile={onFile} resolveImage={resolveImage} />
      </section>

      {command && subject && (
        <section className="card done-card">
          <CheckCircle2 size={22} />
          <div className="grow stack-sm">
            <b>Liegt im Vault. Wenn du fertig bist, sag Claude Code Bescheid:</b>
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
