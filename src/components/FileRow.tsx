import { File, FileImage, FileText, Film, Music, NotebookPen, Presentation, Sheet } from 'lucide-react'
import { fileKind, formatSize } from '../lib/files'
import { href } from '../state/router'
import type { RawFile } from '../types'

const ICONS = { pdf: FileText, image: FileImage, text: NotebookPen, doc: FileText, slides: Presentation, sheet: Sheet, audio: Music, video: Film, other: File }

/** Eine Rohdatei aus raw/ in einer Liste. Markdown-Mitschriften öffnen den Editor, alles andere die Ansicht. */
export function FileRow({ file }: { file: RawFile }) {
  const kind = fileKind('', file.name)
  const Icon = ICONS[kind]
  const isNote = file.name.toLowerCase().endsWith('.md')
  const to = isNote ? `/mitschrift?pfad=${encodeURIComponent(file.path)}` : `/n/${encodeURIComponent(file.path)}`
  return (
    <a className="list-row" href={href(to)}>
      <span className="file-icon">
        <Icon size={17} />
      </span>
      <span className="grow">
        <b className="ellipsis">{file.name.replace(/\.md$/, '')}</b>
        <span className="muted small">{isNote ? 'Mitschrift' : formatSize(file.size)}</span>
      </span>
    </a>
  )
}
