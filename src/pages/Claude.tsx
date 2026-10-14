import { ExternalLink, MessageSquare, Terminal } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { Field, Notice, PageHead } from '../components/ui'
import { CLAUDE_CODE_URL, openInClaude, openInClaudeCode, TRIGGERS, type Trigger } from '../lib/claude'
import { type Route } from '../state/router'
import { useToast } from '../state/toast'
import { useVault } from '../state/vault'
import { RAW_KINDS } from '../types'

/**
 * Claude, kostenlos über deinen normalen Claude-Zugang:
 * - Chat für allgemeine Fragen (öffnet claude.ai, optional mit den Begriffen eines Fachs als Kontext)
 * - Claude Code für die Arbeit im Vault (Befehle aus commands.md vorbereiten, kopieren, öffnen)
 */
export default function ClaudePage({ route }: { route: Route }) {
  const vault = useVault()
  const { model } = vault
  const { toast } = useToast()
  const [question, setQuestion] = useState('')
  const [context, setContext] = useState(route.query.get('fach') ?? '')

  const contextText = useMemo(() => {
    if (!context) return ''
    const s = model.subjects.find((x) => x.slug === context)
    const list = model.concepts.filter((c) => c.subjects.includes(context) && c.oneLiner)
    if (!s || !list.length) return ''
    return `Kontext aus meinen Notizen zum Fach „${s.label}“ (Begriff: Kurzdefinition):\n${list.map((c) => `- ${c.title}: ${c.oneLiner}`).join('\n')}`
  }, [context, model])

  async function ask() {
    const prompt = [question.trim(), contextText].filter(Boolean).join('\n\n')
    if (!prompt) return
    const r = await openInClaude(prompt)
    toast(r.inLink ? 'Claude geöffnet' : r.copied ? 'Text kopiert – in Claude einfügen (⌘V)' : 'Claude geöffnet', r.opened || r.copied ? 'ok' : 'error')
  }

  return (
    <div className="page">
      <PageHead eyebrow="Kostenlos über deinen Claude-Zugang" title="Claude" lead="Für allgemeine Fragen öffnet sich claude.ai. Für die Arbeit an deinem Vault (Folien verarbeiten, Exam Mode, Lint) ist Claude Code da – die Befehle bereitet die App vor." />

      <section className="card stack">
        <div className="section-head">
          <h2>
            <MessageSquare size={17} /> Claude Chat
          </h2>
          <a className="btn btn-sm btn-ghost" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> claude.ai
          </a>
        </div>
        <textarea className="textarea" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Was willst du wissen? z. B. „Erklär mir den Unterschied zwischen Varianz und Standardabweichung“" aria-label="Frage an Claude" />
        <Field label="Begriffe eines Fachs als Kontext mitschicken (optional)" hint={contextText ? `${contextText.split('\n').length - 1} Begriffe werden angehängt.` : undefined}>
          <div className="chip-row">
            <button type="button" className="chip" aria-pressed={!context} onClick={() => setContext('')}>
              Ohne
            </button>
            {model.subjects.map((s) => (
              <button key={s.slug} type="button" className="chip subject-chip" aria-pressed={context === s.slug} style={{ '--c': s.color } as CSSProperties} onClick={() => setContext(s.slug)}>
                <i /> {s.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => void ask()} disabled={!question.trim()}>
            In Claude fragen
          </button>
        </div>
      </section>

      <section className="stack">
        <div className="section-head">
          <h2>
            <Terminal size={17} /> Claude Code im Vault
          </h2>
          <a className="btn btn-sm btn-ghost" href={CLAUDE_CODE_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> claude.ai/code
          </a>
        </div>
        <Notice>
          Am Mac: Claude Code im Vault-Ordner öffnen. Unterwegs: claude.ai/code mit deinem Vault-Repo. Befehl kopieren, dort einfügen – Claude arbeitet nach den Regeln in deiner CLAUDE.md und pusht das Ergebnis, hier erscheint es nach dem nächsten Abgleich.
        </Notice>
        <div className="trigger-grid">
          {TRIGGERS.map((t) => (
            <TriggerCard key={t.id} trigger={t} />
          ))}
        </div>
      </section>
    </div>
  )
}

function TriggerCard({ trigger }: { trigger: Trigger }) {
  const { model } = useVault()
  const { toast } = useToast()
  const [v, setV] = useState({ fach: model.subjects.find((s) => s.active)?.label ?? '', datei: '', typ: 'Slides', note: '', semester: '', todo: '' })
  const command = trigger.build({
    fach: v.fach || undefined,
    datei: v.datei || undefined,
    typ: v.typ,
    note: v.note || undefined,
    semester: v.semester || undefined,
    todo: v.todo || undefined,
  })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))
  return (
    <div className="card trigger-card">
      <b>{trigger.label}</b>
      <span className="muted small">{trigger.hint}</span>
      {trigger.needs.includes('fach') && (
        <select className="select" value={v.fach} onChange={set('fach')} aria-label="Fach">
          {model.subjects.map((s) => (
            <option key={s.slug} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      {trigger.needs.includes('typ') && (
        <select className="select" value={v.typ} onChange={set('typ')} aria-label="Quellentyp">
          {RAW_KINDS.map((k) => (
            <option key={k.kind} value={k.trigger}>
              {k.label}
            </option>
          ))}
        </select>
      )}
      {trigger.needs.includes('datei') && <input className="input" value={v.datei} onChange={set('datei')} placeholder="Dateiname oder Fach" aria-label="Dateiname" />}
      {trigger.needs.includes('note') && <input className="input" inputMode="numeric" value={v.note} onChange={set('note')} placeholder="Punkte von 100" aria-label="Note" />}
      {trigger.needs.includes('semester') && <input className="input" value={v.semester} onChange={set('semester')} placeholder="z. B. SS27" aria-label="Semester" />}
      {trigger.needs.includes('todo') && <input className="input" value={v.todo} onChange={set('todo')} placeholder="Titel · TT.MM · mittel · Klausur" aria-label="Todo" />}
      <code className="command">{command}</code>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          const r = await openInClaudeCode(command)
          toast(r.copied ? 'Kopiert – in Claude Code einfügen' : 'Claude Code geöffnet')
        }}
      >
        Kopieren & öffnen
      </button>
    </div>
  )
}
