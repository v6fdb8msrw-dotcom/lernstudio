import { ExternalLink, Share, Sparkles } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { useFileUrl, useVaultText } from '../components/hooks'
import { Markdown } from '../components/Markdown'
import { Empty, Modal, PageHead, Spinner, StatusChip } from '../components/ui'
import { NOTE_PROMPTS, openInClaude } from '../lib/claude'
import { fileKind, formatSize } from '../lib/files'
import { plain } from '../lib/search'
import { href, type Route } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import { splitFrontmatter } from '../vault/frontmatter'
import { basename, prettify } from '../vault/model'

/** Zeigt eine beliebige Vault-Datei: Markdown-Notes (Concepts, Quellen, Klausur-Seiten) oder Dateien (PDF, Bild …). */
export default function NoteView({ route }: { route: Route }) {
  const path = decodeURIComponent(route.segments.slice(1).join('/'))
  const vault = useVault()
  if (!vault.exists(path) && vault.state !== 'loading') return <div className="page"><Empty>Diese Datei gibt es im Vault nicht (mehr).</Empty></div>
  return path.endsWith('.md') ? <MarkdownNote path={path} /> : <FileView path={path} />
}

function MarkdownNote({ path }: { path: string }) {
  const vault = useVault()
  const { model, config } = vault
  const { text, loading } = useVaultText(path)
  const [claude, setClaude] = useState(false)
  const { toast } = useToast()
  const concept = model.concepts.find((c) => c.path === path)
  const fm = useMemo(() => (text ? splitFrontmatter(text) : undefined), [text])
  const title = concept?.title ?? (typeof fm?.data.title === 'string' ? fm.data.title : prettify(basename(path)))
  const subjects = model.subjects.filter((s) => concept?.subjects.includes(s.slug) || fm?.data.subject === s.slug)
  const color = subjects[0]?.color

  // Rückverweise: Welche Notes verlinken hierher?
  const backlinks = useMemo(() => {
    const key = basename(path).replace(/\.md$/, '').toLowerCase()
    const re = new RegExp(`\\[\\[(?:[^\\]|#]*/)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[#|][^\\]]*)?\\]\\]`, 'i')
    return model.markdown.filter((p) => p !== path && !p.endsWith('_index.md') && re.test(vault.textNow(p) ?? '')).slice(0, 30)
  }, [model.markdown, path, vault])

  const obsidian = config?.obsidianVault ? `obsidian://open?vault=${encodeURIComponent(config.obsidianVault)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}` : undefined

  async function ask(id: string) {
    const p = NOTE_PROMPTS.find((x) => x.id === id)!
    const prompt = p.build(title, path, plain(text ?? ''))
    const r = await openInClaude(prompt)
    setClaude(false)
    toast(r.inLink ? 'Claude geöffnet – Text ist auch in der Zwischenablage' : r.copied ? 'Text kopiert – in Claude einfügen (⌘V)' : 'Claude geöffnet', r.opened || r.copied ? 'ok' : 'error')
  }

  if (loading) return <div className="page"><Spinner /></div>

  return (
    <div className="page" style={color ? ({ '--c': color } as CSSProperties) : undefined}>
      <PageHead
        color={color}
        eyebrow={
          <span className="crumbs">
            {subjects.map((s) => (
              <a key={s.slug} href={href(`/fach/${s.slug}`)}>
                {s.label}
              </a>
            ))}
            <span>{concept ? 'Concept' : path.split('/').slice(0, -1).join(' / ')}</span>
          </span>
        }
        title={title}
        lead={concept?.oneLiner}
        actions={
          <>
            {concept && <StatusChip status={concept.status} />}
            <button type="button" className="btn" onClick={() => setClaude(true)}>
              <Sparkles size={16} /> Mit Claude besprechen
            </button>
            {obsidian && (
              <a className="btn btn-ghost" href={obsidian}>
                <ExternalLink size={16} /> Obsidian
              </a>
            )}
          </>
        }
      />
      <div className="two-col wide-main">
        <article className="card note-card">{text !== undefined ? <Markdown text={text} path={path} /> : <p className="muted">Konnte die Note nicht laden.</p>}</article>
        <aside className="stack">
          {concept && (
            <div className="card meta-card">
              <div className="eyebrow">Steckbrief</div>
              <dl>
                <dt>Fächer</dt>
                <dd>{concept.subjects.join(', ') || '–'}</dd>
                <dt>Semester</dt>
                <dd>{concept.semesters.join(', ') || '–'}</dd>
                {concept.updated && (
                  <>
                    <dt>Aktualisiert</dt>
                    <dd>{concept.updated}</dd>
                  </>
                )}
                {concept.tags.length > 0 && (
                  <>
                    <dt>Tags</dt>
                    <dd>{concept.tags.join(', ')}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
          {backlinks.length > 0 && (
            <div className="card">
              <div className="eyebrow">Verlinkt von</div>
              <ul className="list compact">
                {backlinks.map((p) => (
                  <li key={p}>
                    <a className="list-row" href={href(`/n/${encodeURIComponent(p)}`)}>
                      <span className="grow ellipsis">{model.concepts.find((c) => c.path === p)?.title ?? prettify(basename(p))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      {claude && (
        <Modal title="Mit Claude besprechen" onClose={() => setClaude(false)}>
          <p className="muted small" style={{ marginBottom: 14 }}>
            Öffnet claude.ai mit dieser Note und einer Vorlage, kostenlos über deinen Claude-Zugang. Der Text liegt zusätzlich in der Zwischenablage.
          </p>
          <div className="quick-grid">
            {NOTE_PROMPTS.map((p) => (
              <button key={p.id} type="button" className="quick-item" onClick={() => void ask(p.id)}>
                <b>{p.label}</b>
                <span>{p.hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function FileView({ path }: { path: string }) {
  const vault = useVault()
  const { url, error } = useFileUrl(path)
  const kind = fileKind('', path)
  const name = basename(path)
  const entry = vault.model.raw.find((r) => r.path === path)

  async function share() {
    const blob = await vault.fileBlob(path)
    if (!blob) return
    const file = new File([blob], name, { type: blob.type })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name })
        return
      } catch {
        // abgebrochen
      }
    }
    const a = document.createElement('a')
    a.href = url!
    a.download = name
    a.click()
  }

  return (
    <div className="page">
      <PageHead
        eyebrow={path.split('/').slice(0, -1).join(' / ')}
        title={name}
        lead={entry ? formatSize(entry.size) : undefined}
        actions={
          url && (
            <>
              <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Öffnen
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => void share()}>
                <Share size={16} /> Teilen / Sichern
              </button>
            </>
          )
        }
      />
      {error ? (
        <Empty>Die Datei konnte nicht geladen werden. Bist du offline? Dateien, die du einmal geöffnet hast, gibt es danach auch offline.</Empty>
      ) : !url ? (
        <Spinner label="Lade Datei aus dem Vault …" />
      ) : kind === 'image' ? (
        <img className="file-preview" src={url} alt={name} />
      ) : kind === 'pdf' ? (
        <iframe className="pdf-frame" src={url} title={name} />
      ) : (
        <Empty>Vorschau gibt es für diesen Dateityp nicht. Mit „Öffnen“ oder „Teilen / Sichern“ geht’s weiter.</Empty>
      )}
    </div>
  )
}
