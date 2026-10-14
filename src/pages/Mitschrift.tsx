import { CheckCircle2, Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Editor, type EditorApi } from '../components/Editor'
import { Field, Notice, PageHead, Spinner } from '../components/ui'
import { openInClaudeCode } from '../lib/claude'
import { prepareImage } from '../lib/files'
import { imagesIn, sanitize, toMarkdown } from '../lib/html'
import { navigate, type Route } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import { renderMarkdown } from '../vault/markdown'
import { basename, rawPath, resolveLink } from '../vault/model'

const DRAFT_KEY = 'lernstudio.mitschrift.entwurf'

interface Draft {
  fach: string
  title: string
  html: string
  at: string
}

function readDraft(): Draft | undefined {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mitschrift schreiben oder bearbeiten. Landet als Markdown in raw/<Semester>/<Fach>/notes/, Fotos in raw/assets/. */
export default function MitschriftPage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const { toast } = useToast()
  const editPath = route.query.get('pfad') ?? undefined
  const [slug, setSlug] = useState(route.query.get('fach') ?? model.subjects.find((s) => s.active)?.slug ?? '')
  const [title, setTitle] = useState('')
  const [initial, setInitial] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ command: string }>()
  const api = useRef<EditorApi | null>(null)
  const pending = useRef(new Map<string, { blob: Blob; url: string }>())
  const draft = useMemo(() => (!editPath ? readDraft() : undefined), [editPath])

  const editSubject = editPath ? model.subjects.find((s) => editPath.includes(`/${s.slug}/`)) : undefined
  const subject = editSubject ?? model.subjects.find((s) => s.slug === slug)

  // Bestehende Mitschrift laden
  useEffect(() => {
    if (!editPath) {
      setInitial('')
      return
    }
    let alive = true
    void vault.text(editPath).then((md) => {
      if (!alive) return
      const text = md ?? ''
      const h1 = text.match(/^#\s+(.+)\n?/)
      setTitle(h1 ? h1[1].trim() : basename(editPath).replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}\s+/, ''))
      const body = h1 ? text.slice(h1[0].length) : text
      const html = renderMarkdown(body, { resolve: (t) => resolveLink(model, t), notePath: editPath })
      // Eingebettete Bilder als Dateinamen merken, damit sie beim Speichern wieder ![[…]] werden
      const tpl = document.createElement('template')
      tpl.innerHTML = html
      for (const img of Array.from(tpl.content.querySelectorAll('img[data-vault]'))) img.setAttribute('data-file', basename(img.getAttribute('data-vault')!))
      setInitial(sanitize(tpl.innerHTML))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPath])

  // Entwurf lokal sichern, damit nichts verloren geht (z. B. App geschlossen)
  useEffect(() => {
    if (editPath || !dirty) return
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ fach: slug, title, html: api.current?.html() ?? '', at: new Date().toISOString() } satisfies Draft))
      } catch {
        // kein Speicher: egal
      }
    }, 800)
    return () => window.clearTimeout(t)
  })

  async function onImage(file: File) {
    try {
      const blob = await prepareImage(file)
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const name = `mitschrift-${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const url = URL.createObjectURL(blob)
      pending.current.set(name, { blob, url })
      setDirty(true)
      return { name, url }
    } catch {
      toast('Dieses Bild konnte nicht gelesen werden. Nimm JPG oder PNG.', 'error')
      return undefined
    }
  }

  async function resolveImage(name: string) {
    const p = pending.current.get(name)
    if (p) return p.url
    const path = resolveLink(model, name) ?? `raw/assets/${name}`
    return vault.fileUrl(path)
  }

  async function save() {
    if (!subject) {
      toast('Wähl zuerst ein Fach.', 'error')
      return
    }
    const html = api.current?.html() ?? ''
    const t = title.trim() || 'Mitschrift'
    const md = `# ${t}\n\n${toMarkdown(html)}\n`
    const path = editPath ?? rawPath(subject, 'notes', `${today()} ${t}.md`, model.semester?.folder)
    const images = imagesIn(html).filter((n) => pending.current.has(n))
    setBusy(true)
    try {
      const r = await vault.write(`Mitschrift: ${subject.label} – ${t}`, [{ path, content: md }, ...images.map((n) => ({ path: `raw/assets/${n}`, content: pending.current.get(n)!.blob }))])
      setDirty(false)
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        // egal
      }
      const command = editPath ? `Mitschrift ${subject.label} aktualisiert` : `Mitschrift ${basename(path)} bereit zum Verarbeiten`
      setSaved({ command })
      toast(r === 'sent' ? 'Im Vault gespeichert' : 'Gespeichert – wird gesendet, sobald du online bist')
      if (!editPath) navigate(`/mitschrift?pfad=${encodeURIComponent(path)}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (initial === undefined) return <div className="page"><Spinner label="Lade Mitschrift …" /></div>

  return (
    <div className="page" style={subject ? ({ '--c': subject.color } as CSSProperties) : undefined}>
      <PageHead
        color={subject?.color}
        eyebrow={editPath ? editPath.split('/').slice(0, -1).join(' / ') : 'Neue Mitschrift'}
        title={editPath ? 'Mitschrift bearbeiten' : 'Mitschrift schreiben'}
        lead="Mitschriften sind laut deinem Vault der Auslöser: Erst wenn Folien und Mitschrift zum Thema da sind, baut Claude die fertigen Concept-Notes."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !subject}>
            <Save size={16} /> {busy ? 'Speichert …' : dirty || !editPath ? 'Speichern' : 'Gespeichert'}
          </button>
        }
      />

      {draft && !editPath && !dirty && (
        <Notice kind="beige">
          Es gibt einen ungespeicherten Entwurf „{draft.title || 'ohne Titel'}“.{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setSlug(draft.fach)
              setTitle(draft.title)
              setInitial(draft.html)
            }}
          >
            Wiederherstellen
          </button>
        </Notice>
      )}

      <section className="card stack">
        {!editPath && (
          <Field label="Fach">
            <div className="chip-row">
              {model.subjects.map((s) => (
                <button key={s.slug} type="button" className="chip subject-chip" aria-pressed={s.slug === slug} style={{ '--c': s.color } as CSSProperties} onClick={() => setSlug(s.slug)}>
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
            setDirty(true)
          }}
          placeholder="Titel, z. B. Vorlesung 3 – Regression"
          aria-label="Titel"
        />
        <Editor key={initial.length + (editPath ?? '')} initialHtml={initial} apiRef={api} onChange={() => setDirty(true)} onImage={onImage} resolveImage={resolveImage} />
      </section>

      {saved && subject && (
        <section className="card done-card">
          <CheckCircle2 size={22} />
          <div className="grow stack-sm">
            <b>Im Vault. Jetzt Claude Code Bescheid sagen:</b>
            <code className="command">{saved.command}</code>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const r = await openInClaudeCode(saved.command)
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
