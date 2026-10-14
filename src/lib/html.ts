/*
 * Der Mitschrift-Editor arbeitet mit stark eingeschränktem HTML. Alles, was hineinkommt
 * (Tippen, Einfügen aus Word/Web, geladene Mitschriften), läuft durch sanitize(): Nur einfache
 * Blöcke und Auszeichnungen bleiben, Skripte, Styles und fremde Bilder fliegen raus.
 * Bilder stehen als <img data-file="name.jpg"> ohne src im HTML (Dateiname in raw/assets/),
 * die Anzeige setzt src. Beim Speichern werden sie zu Obsidian-Einbettungen ![[name.jpg]].
 */

/** Erlaubte Dateinamen für eingebettete Bilder (keine Pfadteile, keine Steuerzeichen). */
// oxlint-disable-next-line no-control-regex
export const FILE_NAME_RE = /^[^\\/<>:"|?*\u0000-\u001f]{1,160}$/

const BLOCK: Record<string, string> = {
  P: 'p', DIV: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3',
  UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', PRE: 'pre',
  TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TH: 'th', TD: 'td',
}
const INLINE: Record<string, string> = {
  B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's',
  CODE: 'code', MARK: 'mark', SUB: 'sub', SUP: 'sup', BR: 'br',
}
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS'])

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** HTML in ein Fragment parsen, ohne dass Bilder laden oder Skripte laufen. */
function parse(html: string): DocumentFragment {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content
}

export function sanitize(html: string): string {
  const out = document.createElement('template')
  const walk = (src: ParentNode, dst: ParentNode) => {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) {
        dst.appendChild(document.createTextNode(n.nodeValue ?? ''))
        continue
      }
      if (n.nodeType !== 1) continue
      const el = n as Element
      const tag = el.tagName.toUpperCase()
      if (DROP.has(tag)) continue
      if (tag === 'IMG') {
        const name = el.getAttribute('data-file')
        if (name && FILE_NAME_RE.test(name)) {
          const img = document.createElement('img')
          img.setAttribute('data-file', name)
          img.setAttribute('alt', (el.getAttribute('alt') ?? '').slice(0, 200))
          dst.appendChild(img)
        }
        continue
      }
      if (tag === 'A') {
        // eingebettete Datei (Foliensatz): nur der Dateiname zählt
        const file = el.getAttribute('data-file')
        if (file !== null) {
          if (FILE_NAME_RE.test(file)) {
            const a = document.createElement('a')
            a.setAttribute('data-file', file)
            a.textContent = `📄 ${file}`
            dst.appendChild(a)
          }
          continue
        }
        const href = el.getAttribute('href') ?? ''
        if (/^https?:\/\//i.test(href)) {
          const a = document.createElement('a')
          a.setAttribute('href', href)
          a.setAttribute('target', '_blank')
          a.setAttribute('rel', 'noopener noreferrer')
          walk(el, a)
          dst.appendChild(a)
        } else walk(el, dst)
        continue
      }
      const t = BLOCK[tag] ?? INLINE[tag]
      if (t) {
        const clean = document.createElement(t)
        if (t !== 'br') walk(el, clean)
        dst.appendChild(clean)
      } else walk(el, dst)
    }
  }
  walk(parse(html), out.content)
  return out.innerHTML
}

/**
 * Kann der App-Editor diese Notiz bearbeiten, ohne etwas kaputt zu machen? Er kennt Absätze,
 * Überschriften, einfache Listen, Zitate, Markierungen, Bilder und Datei-Einbettungen.
 * Callouts/aufklappbare Kästen, Tabellen, Formeln, Links auf andere Notes, eingerückte Listen
 * und HTML gehen beim Speichern verloren, solche Notizen bearbeitet man in Obsidian.
 */
export function canEditInApp(markdownBody: string): boolean {
  const body = markdownBody.replace(/```[\s\S]*?```/g, '')
  return !(
    /^\s*>\s*\[!/m.test(body) || // Callout
    /^\s*\|.*\|\s*$/m.test(body) || // Tabelle
    /\$\$|\$[^$\s][^$\n]*\$/.test(body) || // Formel
    /(^|[^!])\[\[/.test(body) || // Link auf andere Note
    /^[ \t]+([-*+]|\d+\.)\s/m.test(body) || // eingerückte Liste
    /<\/?(details|summary|table|div|span)\b/i.test(body) // HTML
  )
}

export function imagesIn(html: string): string[] {
  return Array.from(parse(html).querySelectorAll('img[data-file]'))
    .map((i) => i.getAttribute('data-file') ?? '')
    .filter((n) => FILE_NAME_RE.test(n))
}

/** Editor-HTML → Markdown (Obsidian-kompatibel, Bilder als ![[name]]). */
export function toMarkdown(html: string): string {
  const walk = (node: ParentNode): string => {
    let s = ''
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        s += (n.nodeValue ?? '').replace(/ /g, ' ')
        continue
      }
      if (n.nodeType !== 1) continue
      const el = n as Element
      const t = el.tagName.toUpperCase()
      switch (t) {
        case 'BR':
          s += '\n'
          break
        case 'IMG':
          s += `\n![[${el.getAttribute('data-file') ?? ''}]]\n`
          break
        case 'MARK':
          s += `==${walk(el)}==`
          break
        case 'H2':
          s += `\n## ${walk(el).trim()}\n`
          break
        case 'H3':
          s += `\n### ${walk(el).trim()}\n`
          break
        case 'P':
          s += `\n${walk(el).trim()}\n`
          break
        case 'BLOCKQUOTE':
          s += `\n${walk(el).trim().split('\n').map((l) => `> ${l}`).join('\n')}\n`
          break
        case 'PRE':
          s += `\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n`
          break
        case 'UL':
        case 'OL': {
          let i = 0
          s += '\n'
          for (const li of Array.from(el.children)) {
            if (li.tagName.toUpperCase() !== 'LI') continue
            i++
            s += `${t === 'OL' ? `${i}.` : '-'} ${walk(li).trim().replace(/\n+/g, ' ')}\n`
          }
          break
        }
        case 'STRONG':
        case 'B':
          s += `**${walk(el)}**`
          break
        case 'EM':
        case 'I':
          s += `*${walk(el)}*`
          break
        case 'CODE':
          s += `\`${walk(el)}\``
          break
        case 'S':
          s += `~~${walk(el)}~~`
          break
        case 'A':
          if (el.hasAttribute('data-file')) s += `\n![[${el.getAttribute('data-file')}]]\n`
          else s += `[${walk(el)}](${el.getAttribute('href') ?? ''})`
          break
        case 'TR':
          s += `\n| ${Array.from(el.children).map((c) => walk(c).trim().replace(/\|/g, '/')).join(' | ')} |`
          break
        case 'TABLE':
          s += `\n${walk(el).trim()}\n`
          break
        default:
          s += walk(el)
      }
    }
    return s
  }
  return walk(parse(html)).replace(/\n{3,}/g, '\n\n').trim()
}
