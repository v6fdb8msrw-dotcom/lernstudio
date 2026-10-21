/*
 * Der Lernstudio ist die Web-App über dem Uni-Vault (Schema: uni-knowledge-template, siehe CLAUDE.md im Vault).
 * Die Wahrheit liegt als Markdown im privaten GitHub-Repo; die App liest, zeigt, trainiert und lädt hoch.
 * Claude Code pflegt wiki/, die App schreibt nur raw/ (Uploads, Mitschriften) und die Todos.
 */

/** Verbindung zum Vault-Repo. Der Token bleibt nur auf diesem Gerät. */
export interface VaultConfig {
  owner: string
  repo: string
  branch: string
  token: string
  /** Name des Vaults in Obsidian (für „In Obsidian öffnen“) */
  obsidianVault: string
}

/** Ein Eintrag im Git-Baum des Vaults. */
export interface TreeEntry {
  path: string
  sha: string
  size: number
}

export type ConceptStatus = 'draft' | 'pending_enrichment' | 'enriched' | 'exam-ready'
export const CONCEPT_STATUSES: ConceptStatus[] = ['draft', 'pending_enrichment', 'enriched', 'exam-ready']

export type SubjectStatus = 'in_progress' | 'pending' | 'verified' | 'needs_review'

export interface Semester {
  name: string
  folder: string
  start?: string
  end?: string
  firstExam?: string
}

export interface Subject {
  slug: string
  label: string
  short: string
  language: string
  semester: string
  /** Ordnername des Semesters (WS2627) */
  semFolder: string
  status: SubjectStatus
  examDate?: string
  assessment?: string
  grade?: number | null
  active: boolean
  /** Farbe aus dem Dashboard (home.md), sonst automatisch */
  color: string
  mocPath?: string
  summaryPath?: string
}

export interface Concept {
  path: string
  slug: string
  title: string
  subjects: string[]
  semesters: string[]
  status: ConceptStatus
  updated?: string
  tags: string[]
  /** Kurzdefinition (erster Satz der Definition) */
  oneLiner: string
}

export interface Todo {
  title: string
  date?: string
  priority?: 'high' | 'medium' | 'low'
  category?: string
  done: boolean
}

export interface LogEntry {
  date: string
  kind: string
  detail: string
}

export type RawKind = 'slides' | 'notes' | 'books' | 'videos' | 'papers'
export const RAW_KINDS: { kind: RawKind; label: string; hint: string; trigger: string }[] = [
  { kind: 'slides', label: 'Folien', hint: 'Vorlesungsfolien (PDF)', trigger: 'Slides' },
  { kind: 'notes', label: 'Mitschriften', hint: 'Deine Mitschriften – lösen die fertigen Concept-Notes aus', trigger: 'Mitschrift' },
  { kind: 'books', label: 'Bücher', hint: 'Lehrbücher, auch abfotografiert', trigger: 'Lehrbuch' },
  { kind: 'papers', label: 'Paper & Artikel', hint: 'Paper, Web-Clips', trigger: 'Paper' },
  { kind: 'videos', label: 'Videos', hint: 'YouTube-Links (als .txt)', trigger: 'Video' },
]

export interface RawFile {
  path: string
  name: string
  subject: string
  kind: RawKind | 'other'
  size: number
  sha: string
}

/** Lokale Änderung, die noch nicht im Vault ist (z. B. offline geschrieben). */
export interface OutboxItem {
  id: string
  message: string
  createdAt: string
  files: { path: string; base64: string }[]
  /** Text-Änderungen, die beim Absenden auf den neuesten Stand angewendet werden (z. B. Todo abhaken) */
  edits?: { path: string; op: 'toggleTodo' | 'addTodo'; arg: string }[]
  /** Dateien, die im selben Commit wegfallen (z. B. alte Adresse einer umgezogenen Mitschrift) */
  deletes?: string[]
}
