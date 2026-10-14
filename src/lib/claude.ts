/*
 * „Mit Claude besprechen“: Statt einer bezahlten API öffnet der Lernstudio claude.ai mit vorbereitetem Text.
 * Das läuft über den normalen (auch kostenlosen) Claude-Zugang. Der Text landet zusätzlich in der
 * Zwischenablage, falls claude.ai das Vorbefüllen per Link einmal nicht übernimmt oder der Text zu lang ist.
 */

/** Längere Texte passen nicht sicher in einen Link; sie kommen nur über die Zwischenablage. */
export const MAX_LINK_CHARS = 6000

export function claudeUrl(prompt: string): string {
  if (!prompt.trim() || prompt.length > MAX_LINK_CHARS) return 'https://claude.ai/new'
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

export interface NotePrompt {
  id: string
  label: string
  /** Kurzbeschreibung im Menü */
  hint: string
  build: (title: string, path: string, text: string) => string
}

const material = (title: string, path: string, text: string) => `Notiz „${title}“ (${path}):\n\n${text.trim()}`

export const NOTE_PROMPTS: NotePrompt[] = [
  {
    id: 'erklaeren',
    label: 'Erklär mir das',
    hint: 'Einfach erklärt, mit Beispielen',
    build: (t, p, x) => `Ich lerne für mein Studium. Erklär mir den Inhalt dieser Notiz verständlich, mit Beispielen, und sag mir, worauf es in der Klausur ankommt.\n\n${material(t, p, x)}`,
  },
  {
    id: 'abfragen',
    label: 'Frag mich ab',
    hint: 'Eine Frage nach der anderen',
    build: (t, p, x) => `Frag mich zu dieser Notiz ab: Stell mir eine Prüfungsfrage nach der anderen, warte auf meine Antwort und sag mir danach, was gefehlt hat. Bleib bei dem, was in der Notiz steht.\n\n${material(t, p, x)}`,
  },
  {
    id: 'karteikarten',
    label: 'Karteikarten',
    hint: '10 Karten Frage/Antwort',
    build: (t, p, x) => `Erstelle aus dieser Notiz 10 Karteikarten (Frage | Antwort) als Tabelle. Kurze, präzise Fragen, Antworten in 1–2 Sätzen.\n\n${material(t, p, x)}`,
  },
  {
    id: 'zusammenfassen',
    label: 'Zusammenfassen',
    hint: 'Stichpunkte + Merksatz',
    build: (t, p, x) => `Fass diese Notiz in 5 bis 8 Stichpunkten für die Klausurvorbereitung zusammen, die wichtigsten Begriffe fett, am Ende ein Merksatz.\n\n${material(t, p, x)}`,
  },
  {
    id: 'frei',
    label: 'Eigene Frage',
    hint: 'Nur die Notiz als Grundlage',
    build: (t, p, x) => `Hier ist eine Notiz aus meinem Studium. Ich habe gleich eine Frage dazu.\n\n${material(t, p, x)}`,
  },
]

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Text kopieren und claude.ai öffnen. Muss direkt aus einem Klick heraus aufgerufen werden
 * (sonst blockt Safari das neue Fenster). Ergebnis: ob der Text im Link steckt und ob er kopiert wurde.
 */
export async function openInClaude(prompt: string): Promise<{ inLink: boolean; copied: boolean; opened: boolean }> {
  const inLink = prompt.length <= MAX_LINK_CHARS
  // Kopieren startet, solange die Seite noch den Fokus hat; das Fenster öffnet direkt danach im selben Klick
  const copying = copyText(prompt)
  const win = window.open(claudeUrl(prompt), '_blank')
  if (win) win.opener = null
  return { inLink, copied: await copying, opened: !!win }
}

/*
 * Claude Code arbeitet direkt im Vault (CLAUDE.md). Die App bereitet die passenden Befehle aus
 * commands.md vor: kopieren, Claude Code öffnen (Desktop-App oder claude.ai/code), einfügen.
 */
export const CLAUDE_CODE_URL = 'https://claude.ai/code'

export interface Trigger {
  id: string
  label: string
  hint: string
  /** Platzhalter, die ausgefüllt werden müssen */
  needs: ('fach' | 'datei' | 'typ' | 'note' | 'semester' | 'todo')[]
  build: (v: { fach?: string; datei?: string; typ?: string; note?: string; semester?: string; todo?: string }) => string
}

export const TRIGGERS: Trigger[] = [
  { id: 'ingest', label: 'Neue Datei verarbeiten', hint: 'Nach dem Hochladen: Claude baut Concept-Notes daraus', needs: ['typ', 'datei'], build: (v) => `${v.typ ?? 'Slides'} ${v.datei ?? '[Dateiname]'} bereit zum Verarbeiten` },
  { id: 'mitschrift', label: 'Mitschrift aktualisiert', hint: 'Nur die Änderungen einarbeiten', needs: ['fach'], build: (v) => `Mitschrift ${v.fach ?? '[Fach]'} aktualisiert` },
  { id: 'exam', label: 'Exam Mode', hint: 'Prüfungs-Übersicht, Lernplan und Karteikarten', needs: ['fach'], build: (v) => `Exam Mode für ${v.fach ?? '[Fach]'}` },
  { id: 'lint', label: 'Wiki Lint', hint: 'Gesundheits-Check: Lücken, tote Links, alte Entwürfe', needs: [], build: () => 'Wiki Lint' },
  { id: 'note', label: 'Note eintragen', hint: 'Nach der Klausur, ab 60 gilt das Fach als bestanden', needs: ['fach', 'note'], build: (v) => `Note für ${v.fach ?? '[Fach]'}: ${v.note ?? 'XX'}/100` },
  { id: 'semester', label: 'Neues Semester', hint: 'Ordner, Fach-Seiten und Dashboard fürs neue Semester', needs: ['semester'], build: (v) => `Neues Semester einrichten: ${v.semester ?? '[Name]'}` },
  { id: 'todo', label: 'Todo anlegen', hint: 'Titel · TT.MM · hoch/mittel/niedrig · Kategorie', needs: ['todo'], build: (v) => `Todo: ${v.todo ?? '[Titel] · [TT.MM] · [mittel] · [Klausur]'}` },
  { id: 'setup', label: 'Vault einrichten', hint: 'Einmalig: Fächer, Semester, Prüfungen eintragen', needs: [], build: () => 'Richte den Vault für mich ein' },
]

/** Befehl kopieren und Claude Code öffnen (im selben Klick, sonst blockt Safari das Fenster). */
export async function openInClaudeCode(command: string): Promise<{ copied: boolean; opened: boolean }> {
  const copying = copyText(command)
  const win = window.open(CLAUDE_CODE_URL, '_blank')
  if (win) win.opener = null
  return { copied: await copying, opened: !!win }
}
