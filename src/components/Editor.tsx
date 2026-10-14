import { Highlighter, ImagePlus, List, ListOrdered, Quote, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { escapeHtml, sanitize } from '../lib/html'

/*
 * Schreibfeld für Mitschriften: formatiert schreiben wie in Notion (Überschriften, Listen, Markierungen),
 * Fotos einfügen per Knopf, Einfügen oder Drag & Drop. Markdown-Kürzel: „# “, „## “, „- “, „1. “, „> “.
 * Gespeichert wird später als Markdown (lib/html.ts → toMarkdown).
 */

export interface EditorApi {
  html: () => string
  focus: () => void
}

interface Props {
  initialHtml: string
  apiRef: RefObject<EditorApi | null>
  onChange: () => void
  /** Bild speichern; liefert Dateinamen (für ![[…]]) und Anzeige-URL */
  onImage: (file: File) => Promise<{ name: string; url: string } | undefined>
  /** Anzeige-URLs für bereits vorhandene Bilder */
  resolveImage: (name: string) => Promise<string | undefined>
  placeholder?: string
}

export function Editor({ initialHtml, apiRef, onChange, onImage, resolveImage, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saved = useRef<Range | null>(null)
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null)
  const [empty, setEmpty] = useState(true)

  // Inhalt nur beim ersten Anzeigen setzen; danach gehört das Feld dem Nutzer
  useEffect(() => {
    const ed = ref.current!
    ed.innerHTML = sanitize(initialHtml) || '<p><br></p>'
    hydrate(ed)
    setEmpty(isEmpty(ed))
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p')
      document.execCommand('styleWithCSS', false, 'false')
    } catch {
      // ältere Browser
    }
    apiRef.current = { html: () => sanitize(ed.innerHTML), focus: () => ed.focus() }
    return () => {
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function hydrate(root: HTMLElement) {
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[data-file]'))) {
      if (img.src) continue
      void resolveImage(img.dataset.file!).then((url) => {
        if (url) img.src = url
        else img.classList.add('missing')
      })
    }
  }

  const changed = () => {
    const ed = ref.current!
    setEmpty(isEmpty(ed))
    onChange()
  }

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    changed()
  }

  const block = (): HTMLElement | null => {
    const s = getSelection()
    if (!s?.rangeCount) return null
    let n: Node | null = s.anchorNode
    if (n?.nodeType === 3) n = n.parentElement
    const b = (n as Element | null)?.closest?.('h2,h3,p,blockquote,li,pre') as HTMLElement | null
    return b && ref.current!.contains(b) ? b : null
  }

  const remember = () => {
    const s = getSelection()
    if (s?.rangeCount && ref.current!.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange()
  }

  const restore = () => {
    const ed = ref.current!
    ed.focus()
    const s = getSelection()!
    if (saved.current && ed.contains(saved.current.startContainer)) {
      s.removeAllRanges()
      s.addRange(saved.current)
      return
    }
    const r = document.createRange()
    r.selectNodeContents(ed)
    r.collapse(false)
    s.removeAllRanges()
    s.addRange(r)
  }

  const cmd = (c: string) => {
    if (c === 'image') {
      remember()
      fileRef.current?.click()
      return
    }
    ref.current!.focus()
    const tag = block()?.tagName.toLowerCase()
    if (c === 'h2' || c === 'h3') exec('formatBlock', tag === c ? '<p>' : `<${c}>`)
    else if (c === 'quote') exec('formatBlock', block()?.closest('blockquote') ? '<p>' : '<blockquote>')
    else if (c === 'ul') exec('insertUnorderedList')
    else if (c === 'ol') exec('insertOrderedList')
    else if (c === 'mark') toggleMark()
    else exec(c)
  }

  const toggleMark = () => {
    const s = getSelection()
    if (!s?.rangeCount) return
    let n: Node | null = s.anchorNode
    if (n?.nodeType === 3) n = n.parentElement
    const mk = (n as Element | null)?.closest?.('mark')
    if (mk && ref.current!.contains(mk)) {
      mk.replaceWith(...Array.from(mk.childNodes))
      changed()
      return
    }
    if (s.isCollapsed) return
    exec('insertHTML', `<mark>${escapeHtml(s.toString()).replace(/\n/g, '<br>')}</mark>`)
  }

  const autoFormat = () => {
    const b = block()
    if (!b || b.tagName === 'LI') return
    const t = (b.textContent ?? '').replace(/ /g, ' ')
    const rule = ({ '# ': 'h2', '## ': 'h3', '### ': 'h3', '- ': 'ul', '* ': 'ul', '1. ': 'ol', '> ': 'blockquote' } as Record<string, string>)[t]
    if (!rule) return
    b.innerHTML = '<br>'
    const r = document.createRange()
    r.setStart(b, 0)
    r.collapse(true)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
    if (rule === 'ul') exec('insertUnorderedList')
    else if (rule === 'ol') exec('insertOrderedList')
    else exec('formatBlock', `<${rule}>`)
  }

  async function addImages(files: File[]) {
    let first = true
    for (const f of files) {
      const res = await onImage(f)
      if (!res) continue
      if (first) restore()
      first = false
      exec('insertHTML', `<p><img data-file="${escapeHtml(res.name)}" src="${escapeHtml(res.url)}" alt=""></p><p><br></p>`)
    }
  }

  const removeImg = () => {
    if (!selImg) return
    const p = selImg.parentElement
    selImg.remove()
    if (p && p !== ref.current && !p.textContent?.trim() && !p.querySelector('img')) p.remove()
    setSelImg(null)
    changed()
  }

  return (
    <div className="editor-wrap">
      <div className="toolbar" role="toolbar" aria-label="Formatierung" onMouseDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}>
        <button type="button" onClick={() => cmd('h2')} title="Überschrift">H1</button>
        <button type="button" onClick={() => cmd('h3')} title="Zwischenüberschrift">H2</button>
        <span className="tb-div" />
        <button type="button" onClick={() => cmd('bold')} title="Fett">
          <b>B</b>
        </button>
        <button type="button" onClick={() => cmd('italic')} title="Kursiv">
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </button>
        <button type="button" onClick={() => cmd('mark')} title="Markieren">
          <Highlighter size={16} />
        </button>
        <span className="tb-div" />
        <button type="button" onClick={() => cmd('ul')} title="Liste">
          <List size={16} />
        </button>
        <button type="button" onClick={() => cmd('ol')} title="Nummerierte Liste">
          <ListOrdered size={16} />
        </button>
        <button type="button" onClick={() => cmd('quote')} title="Zitat">
          <Quote size={16} />
        </button>
        <span className="tb-div" />
        <button type="button" onClick={() => cmd('image')} title="Foto oder Bild einfügen">
          <ImagePlus size={16} /> Bild
        </button>
      </div>
      <div className="editor-area">
        {empty && <div className="editor-placeholder">{placeholder ?? 'Schreib los … # für Überschrift, - für Liste, Fotos einfach reinziehen'}</div>}
        <div
          ref={ref}
          className="editor md"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Mitschrift"
          spellCheck
          onInput={(e) => {
            const ie = e.nativeEvent as InputEvent
            if (ie.inputType === 'insertText' && ie.data === ' ') autoFormat()
            changed()
          }}
          onKeyUp={remember}
          onMouseUp={remember}
          onBlur={remember}
          onClick={(e) => {
            const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null
            selImg?.classList.remove('sel')
            if (img) img.classList.add('sel')
            setSelImg(img)
          }}
          onKeyDown={(e) => {
            if (selImg && (e.key === 'Backspace' || e.key === 'Delete')) {
              e.preventDefault()
              removeImg()
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
            if (files.length) {
              e.preventDefault()
              remember()
              void addImages(files)
              return
            }
            const html = e.clipboardData.getData('text/html')
            e.preventDefault()
            if (html) exec('insertHTML', sanitize(html) || escapeHtml(e.clipboardData.getData('text/plain')))
            else exec('insertText', e.clipboardData.getData('text/plain'))
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) e.preventDefault()
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
            if (!files.length) return
            e.preventDefault()
            const r = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY)
            if (r) {
              const s = getSelection()!
              s.removeAllRanges()
              s.addRange(r)
            }
            remember()
            void addImages(files)
          }}
        />
        {selImg && (
          <div className="img-bar">
            <button type="button" className="btn btn-sm btn-ghost" onClick={removeImg}>
              <Trash2 size={15} /> Bild entfernen
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) void addImages(files)
        }}
      />
    </div>
  )
}

function isEmpty(ed: HTMLElement): boolean {
  return !ed.textContent?.trim() && !ed.querySelector('img')
}
