import { Maximize2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { href, navigate } from '../state/router'
import type { Graph, GraphNode } from '../vault/graph'

/*
 * Graph-Ansicht wie in Obsidian: graue Knoten, dünne Linien, Größe nach Anzahl der Links, Beschriftung
 * blendet beim Heranzoomen ein, Hover hebt Knoten und Nachbarn hervor. Kräfte, Filter und Farbgruppen
 * kommen aus .obsidian/graph.json. Ziehen verschiebt, Mausrad/Pinch zoomt, Antippen öffnet die Notiz.
 */

interface SimNode {
  node: GraphNode
  x: number
  y: number
  vx: number
  vy: number
  r: number
  fixed: boolean
}

// Farben des hellen Obsidian-Themes
const C = {
  node: '#8b8b93',
  unresolved: '#c4c4c8',
  attachment: '#e0ac00',
  tag: '#08b94e',
  focus: '#8a5cf5',
  line: 'rgba(160, 160, 168, 0.55)',
  text: '#222222',
}
const ALPHA_MIN = 0.004

/** Gleiche Startpositionen bei jedem Laden, damit das Netz nicht springt. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

function layout(graph: Graph, positions: Map<string, SimNode>) {
  const s = graph.settings
  const spread = Math.max(60, s.linkDistance) * Math.sqrt(graph.nodes.length + 1) * 0.6
  let fresh = 0
  const nodes: SimNode[] = graph.nodes.map((n) => {
    // Größe wie in Obsidian: wächst mit der Wurzel der Linkanzahl, begrenzt
    const r = s.nodeSizeMultiplier * Math.max(8, Math.min(3 * Math.sqrt((n.size ?? n.weight) + 1), 30)) * 0.6
    let p = positions.get(n.id)
    if (!p) {
      const a = hash(n.id) * Math.PI * 2
      const d = Math.sqrt(hash(`${n.id}#d`)) * spread
      p = { node: n, x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, r, fixed: false }
      positions.set(n.id, p)
      fresh++
    }
    p.node = n
    p.r = r
    return p
  })
  const count = new Array<number>(nodes.length).fill(0)
  for (const e of graph.edges) {
    count[e.a]++
    count[e.b]++
  }
  const neighbors = nodes.map(() => new Set<number>())
  const edges = graph.edges.map((e) => {
    neighbors[e.a].add(e.b)
    neighbors[e.b].add(e.a)
    return { ...e, strength: s.linkStrength / Math.min(count[e.a], count[e.b]), bias: count[e.a] / (count[e.a] + count[e.b]) }
  })
  // Nach einem Abgleich nur neue Knoten einsortieren, statt alles neu zu würfeln
  const heat = !fresh ? 0.12 : fresh > nodes.length / 3 ? 1 : 0.5
  return { nodes, edges, neighbors, s, heat }
}

export function KnowledgeGraph({ graph, mode }: { graph: Graph; mode: 'preview' | 'full' }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const positions = useRef(new Map<string, SimNode>())

  useEffect(() => {
    const el = canvas.current
    const box = wrap.current
    if (!el || !box) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const { nodes, edges, neighbors, s, heat } = layout(graph, positions.current)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cam = { x: 0, y: 0, k: 1 }
    let w = 0
    let h = 0
    let dpr = 1
    let alpha = heat
    let raf = 0
    let hover = -1
    let userMoved = false

    const repel = s.repelStrength * 28
    const center = s.centerStrength * 0.3
    const tick = () => {
      const n = nodes.length
      const maxD = (s.linkDistance + 100) * 4
      for (let i = 0; i < n; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let l = dx * dx + dy * dy
          if (l > maxD * maxD) continue
          if (l < 1) {
            dx = hash(a.node.id + b.node.id) - 0.5
            dy = hash(b.node.id + a.node.id) - 0.5
            l = dx * dx + dy * dy + 0.01
          }
          const f = (repel * alpha) / l
          a.vx -= dx * f
          a.vy -= dy * f
          b.vx += dx * f
          b.vy += dy * f
        }
      }
      for (const e of edges) {
        const a = nodes[e.a]
        const b = nodes[e.b]
        const dx = b.x + b.vx - a.x - a.vx
        const dy = b.y + b.vy - a.y - a.vy
        const l = Math.sqrt(dx * dx + dy * dy) || 1
        const k = ((l - s.linkDistance) / l) * alpha * e.strength
        b.vx -= dx * k * e.bias
        b.vy -= dy * k * e.bias
        a.vx += dx * k * (1 - e.bias)
        a.vy += dy * k * (1 - e.bias)
      }
      for (const p of nodes) {
        p.vx -= p.x * center * alpha
        p.vy -= p.y * center * alpha
        if (p.fixed) {
          p.vx = p.vy = 0
          continue
        }
        p.vx *= 0.6
        p.vy *= 0.6
        p.x += p.vx
        p.y += p.vy
      }
      alpha += (0 - alpha) * 0.0228
    }

    const fit = () => {
      if (!nodes.length || !w) return
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const p of nodes) {
        x0 = Math.min(x0, p.x - p.r)
        y0 = Math.min(y0, p.y - p.r)
        x1 = Math.max(x1, p.x + p.r)
        y1 = Math.max(y1, p.y + p.r)
      }
      const pad = 40
      cam.x = (x0 + x1) / 2
      cam.y = (y0 + y1) / 2 + 6
      cam.k = Math.min(1.6, Math.max(0.05, Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (y1 - y0 || 1))))
    }

    const sx = (p: SimNode) => (p.x - cam.x) * cam.k + w / 2
    const sy = (p: SimNode) => (p.y - cam.y) * cam.k + h / 2
    const toWorld = (x: number, y: number) => [(x - w / 2) / cam.k + cam.x, (y - h / 2) / cam.k + cam.y] as const
    const fill = (n: GraphNode) => (n.kind === 'unresolved' ? C.unresolved : n.kind === 'attachment' ? C.attachment : n.kind === 'tag' ? C.tag : (n.color ?? C.node))
    const screenR = (p: SimNode) => Math.max(1.5, p.r * cam.k)

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const near = hover >= 0 ? neighbors[hover] : undefined
      const lit = (i: number) => !near || i === hover || near.has(i)

      ctx.lineCap = 'round'
      const lw = Math.max(0.4, s.lineSizeMultiplier * Math.min(2, Math.max(0.5, cam.k)))
      for (const e of edges) {
        const on = hover >= 0 && (e.a === hover || e.b === hover)
        ctx.globalAlpha = near && !on ? 0.2 : 1
        ctx.strokeStyle = on ? C.focus : C.line
        ctx.lineWidth = on ? lw * 1.6 : lw
        ctx.beginPath()
        ctx.moveTo(sx(nodes[e.a]), sy(nodes[e.a]))
        ctx.lineTo(sx(nodes[e.b]), sy(nodes[e.b]))
        ctx.stroke()
      }

      nodes.forEach((p, i) => {
        const x = sx(p)
        const y = sy(p)
        const r = screenR(p)
        if (x < -r || y < -r || x > w + r || y > h + r) return
        ctx.globalAlpha = (lit(i) ? 1 : 0.2) * (p.node.kind === 'unresolved' ? 0.7 : 1)
        ctx.fillStyle = i === hover ? C.focus : fill(p.node)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })

      // Beschriftung: blendet beim Heranzoomen ein (textFadeMultiplier wie in Obsidian), Hover zeigt Nachbarn
      const threshold = 0.9 * Math.pow(2, s.textFadeMultiplier * 0.6)
      const fade = Math.min(1, Math.max(0, (cam.k - threshold * 0.6) / (threshold * 0.5)))
      const size = 12 * Math.min(1.25, Math.max(0.85, cam.k))
      ctx.font = `500 ${size}px Manrope Variable, Manrope, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      nodes.forEach((p, i) => {
        const a = near ? (lit(i) ? 1 : 0) : fade
        if (a <= 0.02) return
        const x = sx(p)
        const y = sy(p) + screenR(p) + 4
        if (x < -120 || x > w + 120 || y < -20 || y > h + 20) return
        ctx.globalAlpha = a
        ctx.fillStyle = C.text
        ctx.fillText(p.node.label, x, y)
      })
      ctx.globalAlpha = 1
    }

    const frame = () => {
      raf = 0
      if (alpha > ALPHA_MIN) {
        tick()
        if (nodes.length < 600) tick()
        if (!userMoved) fit()
      }
      draw()
      if (alpha > ALPHA_MIN) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // Anlaufen lassen, damit man nicht das Anfangs-Durcheinander sieht
    for (let i = 0, n = reduce ? 500 : heat >= 1 ? 140 : 0; i < n && alpha > ALPHA_MIN; i++) tick()

    const resize = () => {
      const rect = box.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = rect.width
      h = rect.height
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      if (!userMoved) fit()
      draw()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    resize()
    if (!reduce) kick()

    // ── Bedienung ──
    const pointers = new Map<number, { x: number; y: number }>()
    let drag = -1
    let down: { x: number; y: number; t: number; hit: number } | undefined
    let pinch: { d: number; k: number } | undefined

    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top] as const
    }
    const hitTest = (x: number, y: number) => {
      let best = -1
      let bestD = Infinity
      nodes.forEach((p, i) => {
        const r = Math.max(8, screenR(p) + 3)
        const d = (sx(p) - x) ** 2 + (sy(p) - y) ** 2
        if (d < r * r && d < bestD) {
          best = i
          bestD = d
        }
      })
      return best
    }
    const onDown = (e: PointerEvent) => {
      const [x, y] = local(e)
      pointers.set(e.pointerId, { x, y })
      el.setPointerCapture(e.pointerId)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k }
        down = undefined
        drag = -1
        return
      }
      const hit = hitTest(x, y)
      down = { x, y, t: performance.now(), hit }
      if (hit >= 0) {
        drag = hit
        nodes[hit].fixed = true
      }
    }
    const onMove = (e: PointerEvent) => {
      const [x, y] = local(e)
      const prev = pointers.get(e.pointerId)
      if (!prev) {
        if (e.pointerType === 'mouse') {
          const hit = hitTest(x, y)
          if (hit !== hover) {
            hover = hit
            el.style.cursor = hit >= 0 && nodes[hit].node.to ? 'pointer' : 'default'
            draw()
          }
        }
        return
      }
      pointers.set(e.pointerId, { x, y })
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        cam.k = Math.min(6, Math.max(0.03, (pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d))
        userMoved = true
        draw()
        return
      }
      if (!down || Math.hypot(x - down.x, y - down.y) < 4) return
      userMoved = true
      if (drag >= 0) {
        const [wx, wy] = toWorld(x, y)
        nodes[drag].x = wx
        nodes[drag].y = wy
        hover = drag
        alpha = Math.max(alpha, 0.3)
        kick()
      } else {
        cam.x -= (x - prev.x) / cam.k
        cam.y -= (y - prev.y) / cam.k
        draw()
      }
    }
    const end = (e: PointerEvent, cancelled: boolean) => {
      const [x, y] = local(e)
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = undefined
      if (drag >= 0) nodes[drag].fixed = false
      const click = !cancelled && down && Math.hypot(x - down.x, y - down.y) < 6 && performance.now() - down.t < 600
      const target = click && down!.hit >= 0 ? nodes[down!.hit].node.to : undefined
      drag = -1
      down = undefined
      if (e.pointerType !== 'mouse' && hover >= 0) {
        hover = -1
        draw()
      }
      if (target) navigate(target)
    }
    const onUp = (e: PointerEvent) => end(e, false)
    const onCancel = (e: PointerEvent) => end(e, true)
    const onLeave = () => {
      if (hover >= 0 && drag < 0) {
        hover = -1
        draw()
      }
    }
    const onWheel = (e: WheelEvent) => {
      // Auf der Startseite scrollt das Mausrad weiter die Seite; Zoomen dort mit ⌘/Strg oder Trackpad-Pinch
      if (mode === 'preview' && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const [x, y] = local(e)
      const [wx, wy] = toWorld(x, y)
      cam.k = Math.min(6, Math.max(0.03, cam.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))))
      cam.x = wx - (x - w / 2) / cam.k
      cam.y = wy - (y - h / 2) / cam.k
      userMoved = true
      draw()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
    }
  }, [graph, mode])

  return (
    <div className={`graph-view graph-view-${mode}`} ref={wrap}>
      <canvas ref={canvas} role="img" aria-label={`Graph-Ansicht aus Obsidian: ${graph.nodes.length} Notizen, ${graph.edges.length} Links. Antippen öffnet die Notiz.`} />
      {!graph.nodes.length && <p className="graph-view-empty muted small">Noch keine verlinkten Notizen.</p>}
      {mode === 'preview' && (
        <a className="btn btn-icon sm graph-view-expand" href={href('/netz')} aria-label="Graph-Ansicht im Vollbild">
          <Maximize2 size={15} />
        </a>
      )}
    </div>
  )
}
