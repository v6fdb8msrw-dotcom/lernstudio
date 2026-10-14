import DOMPurify from 'dompurify'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import { escapeHtml } from '../lib/html'

/*
 * Obsidian-Markdown → sicheres HTML.
 * - [[Ziel]], [[Ziel|Text]], [[Ziel#Abschnitt]] werden zu App-Links (data-link)
 * - ![[bild.png]] und ![](relativer/pfad.png) werden zu <img data-vault="pfad"> (Bild lädt die Komponente aus dem Vault)
 * - > [!tip] Titel  /  > [!question]- Frage  werden zu Callouts (mit „-“ zugeklappt, mit „+“ aufgeklappt)
 * - ==markiert== → <mark>, $Formel$ → <code class="math">
 * - dataview-Blöcke gibt es nur in Obsidian und werden durch einen Hinweis ersetzt
 */

export interface RenderOptions {
  /** Wikilink-Ziel → Vault-Pfad (oder undefined, wenn es die Note nicht gibt) */
  resolve: (target: string) => string | undefined
  /** Pfad der Note, für relative Bildpfade */
  notePath?: string
}

const wikilink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start: (src) => src.match(/!?\[\[/)?.index,
  tokenizer(src) {
    const m = src.match(/^(!?)\[\[([^\]\n]+?)\]\]/)
    if (!m) return undefined
    const [target, alias] = m[2].split('|')
    return { type: 'wikilink', raw: m[0], embed: m[1] === '!', target: target.trim(), alias: alias?.trim() }
  },
  renderer(token) {
    const t = token as unknown as { embed: boolean; target: string; alias?: string }
    if (t.embed) return `<img data-embed="${escapeHtml(t.target)}" alt="${escapeHtml(t.alias ?? t.target)}">`
    const label = t.alias ?? t.target.split('#')[0].split('/').pop() ?? t.target
    return `<a data-link="${escapeHtml(t.target)}">${escapeHtml(label || t.target)}</a>`
  },
}

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    const m = src.match(/^==(?!=)([^=\n]+?)==/)
    return m ? { type: 'highlight', raw: m[0], text: m[1] } : undefined
  },
  renderer(token) {
    return `<mark>${escapeHtml((token as unknown as { text: string }).text)}</mark>`
  },
}

const math: TokenizerAndRendererExtension = {
  name: 'math',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    const m = src.match(/^\$\$([\s\S]+?)\$\$/) ?? src.match(/^\$(?!\s)([^$\n]+?)(?<!\s)\$/)
    return m ? { type: 'math', raw: m[0], text: m[1] } : undefined
  },
  renderer(token) {
    return `<code class="math">${escapeHtml((token as unknown as { text: string }).text.trim())}</code>`
  },
}

const marked = new Marked({ gfm: true, breaks: false })
marked.use({
  extensions: [wikilink, highlight, math],
  renderer: {
    code({ text, lang }) {
      if (lang && /^dataview/.test(lang)) return '<div class="obsidian-only">Diese Ansicht gibt es nur in Obsidian (Dataview).</div>'
      return `<pre><code>${escapeHtml(text)}</code></pre>`
    },
  },
})

function dirOf(path?: string): string {
  if (!path) return ''
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function joinPath(dir: string, rel: string): string {
  const parts = (dir ? `${dir}/${rel}` : rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

const CALLOUT = /^\[!(\w+)\]([+-]?)\s*(.*)$/
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|heif)$/i

/** Callout-Typen auf wenige Stile abbilden. */
function calloutKind(type: string): string {
  const t = type.toLowerCase()
  if (['question', 'faq', 'help'].includes(t)) return 'question'
  if (['tip', 'hint', 'important', 'success', 'check', 'done'].includes(t)) return 'tip'
  if (['warning', 'caution', 'attention', 'danger', 'error', 'bug', 'failure'].includes(t)) return 'warning'
  if (['example', 'quote', 'cite'].includes(t)) return 'example'
  return 'note'
}

function transformCallouts(root: ParentNode) {
  for (const bq of Array.from(root.querySelectorAll('blockquote'))) {
    const first = bq.firstElementChild
    if (!first || first.tagName !== 'P') continue
    const firstLine = (first.innerHTML.split('\n')[0] ?? '').trim()
    const m = firstLine.match(CALLOUT)
    if (!m) continue
    const kind = calloutKind(m[1])
    const fold = m[2]
    const title = m[3] || m[1][0].toUpperCase() + m[1].slice(1)
    // Titelzeile aus dem ersten Absatz entfernen
    const rest = first.innerHTML.split('\n').slice(1).join('\n').trim()
    if (rest) first.innerHTML = rest
    else first.remove()
    const box = document.createElement(fold ? 'details' : 'div')
    box.className = `callout callout-${kind}`
    if (fold === '+') box.setAttribute('open', '')
    const head = document.createElement(fold ? 'summary' : 'div')
    head.className = 'callout-title'
    head.innerHTML = title
    const body = document.createElement('div')
    body.className = 'callout-body'
    while (bq.firstChild) body.appendChild(bq.firstChild)
    box.append(head, body)
    bq.replaceWith(box)
  }
}

/** Markdown (ohne Frontmatter) in bereinigtes HTML verwandeln. */
export function renderMarkdown(markdown: string, opts: RenderOptions): string {
  const html = marked.parse(markdown, { async: false }) as string
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-link', 'data-embed', 'target', 'open'],
    ADD_TAGS: ['details', 'summary'],
    FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
  })
  const tpl = document.createElement('template')
  tpl.innerHTML = clean
  const root = tpl.content
  transformCallouts(root)

  // Wikilinks auflösen
  for (const a of Array.from(root.querySelectorAll('a[data-link]'))) {
    const path = opts.resolve(a.getAttribute('data-link') ?? '')
    if (path) {
      a.setAttribute('href', `#/n/${encodeURIComponent(path)}`)
      a.classList.add('wikilink')
    } else {
      a.classList.add('wikilink', 'missing')
      a.setAttribute('title', 'Diese Note gibt es (noch) nicht')
    }
    a.removeAttribute('data-link')
  }
  // Eingebettete Bilder und relative Bildpfade
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const embed = img.getAttribute('data-embed')
    const src = img.getAttribute('src') ?? ''
    // ![[folien.pdf]] oder ![[Andere Note]]: als Datei-Karte zeigen, nicht als Bild
    if (embed && !IMAGE_EXT.test(embed.split(/[#|]/)[0])) {
      const target = opts.resolve(embed)
      const a = document.createElement('a')
      a.className = 'file-embed'
      a.textContent = `📄 ${embed.split(/[#|]/)[0].split('/').pop()}`
      if (target) {
        a.setAttribute('href', `#/n/${encodeURIComponent(target)}`)
        a.setAttribute('data-vault', target)
      } else a.classList.add('missing')
      img.replaceWith(a)
      continue
    }
    let path: string | undefined
    if (embed) path = opts.resolve(embed)
    else if (src && !/^(https?:|data:|blob:)/i.test(src)) path = joinPath(dirOf(opts.notePath), decodeURIComponent(src))
    img.removeAttribute('data-embed')
    if (path) {
      img.setAttribute('data-vault', path)
      img.removeAttribute('src')
    } else if (embed) {
      const span = document.createElement('span')
      span.className = 'embed-missing'
      span.textContent = `Eingebettet: ${embed}`
      img.replaceWith(span)
      continue
    }
    img.setAttribute('loading', 'lazy')
  }
  // Externe Links in neuem Tab
  for (const a of Array.from(root.querySelectorAll('a[href^="http"]'))) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  }
  const out = document.createElement('div')
  out.appendChild(root)
  return out.innerHTML
}
