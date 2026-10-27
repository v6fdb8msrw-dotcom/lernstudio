import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { uid, nowIso } from '../lib/id'
import type { OutboxItem, Todo, TreeEntry, VaultConfig } from '../types'
import { VaultCache } from '../vault/cache'
import { applyEdit, type EditOp } from '../vault/edits'
import { blobToBase64, explainGitHubError, GitHubClient, GitHubError, textToBase64 } from '../vault/github'
import { buildModel, mimeFor, wantsText, type VaultModel } from '../vault/model'

/*
 * Die Verbindung der App zum Vault. Startet sofort aus dem lokalen Zwischenspeicher,
 * gleicht dann mit GitHub ab und hält alles bereit, was die Seiten brauchen.
 */

export type SyncState = 'unconfigured' | 'loading' | 'syncing' | 'ready' | 'offline' | 'error'

export interface Vault {
  config?: VaultConfig
  state: SyncState
  error?: string
  model: VaultModel
  lastSync?: string
  /** Noch nicht gesendete Änderungen */
  pending: number
  /** Ist das Vault-Repo privat? (undefined = unbekannt) */
  isPrivate?: boolean
  saveConfig(cfg: VaultConfig): Promise<void>
  disconnect(): Promise<void>
  sync(force?: boolean): Promise<void>
  text(path: string): Promise<string | undefined>
  /** Sofort verfügbarer Text (falls schon geladen) */
  textNow(path: string): string | undefined
  fileUrl(path: string): Promise<string | undefined>
  fileBlob(path: string): Promise<Blob | undefined>
  write(message: string, files: { path: string; content: Blob | string }[], edits?: ({ path: string } & EditOp)[], deletes?: string[]): Promise<'sent' | 'queued'>
  toggleTodo(title: string): Promise<void>
  addTodo(todo: Todo): Promise<void>
  exists(path: string): boolean
}

const EMPTY_MODEL = buildModel([], new Map())
const TODOS = 'wiki/dashboard/todos.md'
const DEV_VAULT: VaultConfig = { owner: 'local', repo: 'Uni', branch: 'main', token: 'local-preview', obsidianVault: 'Uni' }
/** Wie oft die offene App bei GitHub nach Neuem schaut (ein kleiner Abruf, wenn sich nichts geändert hat). */
const POLL_MS = 60_000

const VaultContext = createContext<Vault | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new VaultCache())
  const [config, setConfig] = useState<VaultConfig>()
  const [state, setState] = useState<SyncState>('loading')
  const [error, setError] = useState<string>()
  const [model, setModel] = useState<VaultModel>(EMPTY_MODEL)
  const [lastSync, setLastSync] = useState<string>()
  const [pending, setPending] = useState(0)
  const [isPrivate, setPrivate] = useState<boolean>()
  const entries = useRef<Map<string, TreeEntry>>(new Map())
  const texts = useRef<Map<string, string>>(new Map())
  const urls = useRef<Map<string, string>>(new Map())
  const syncing = useRef<Promise<void> | null>(null)
  const configRef = useRef<VaultConfig | undefined>(undefined)

  const client = useCallback(() => (configRef.current ? new GitHubClient(configRef.current) : undefined), [])

  const rebuild = useCallback(() => {
    setModel(buildModel([...entries.current.values()], texts.current))
  }, [])

  const refreshPending = useCallback(async () => setPending((await cache.outbox()).length), [cache])

  /** Ausstehende Änderungen nacheinander senden. */
  const flush = useCallback(async () => {
    const gh = client()
    if (!gh) return
    for (const item of await cache.outbox()) {
      const edits = item.edits ?? []
      await gh.commit({
        message: item.message,
        files: item.files,
        deletes: item.deletes,
        editPaths: [...new Set(edits.map((e) => e.path))],
        edit: (path, current) => edits.filter((e) => e.path === path).reduce<string | undefined>((t, e) => applyEdit(t, { op: e.op, arg: e.arg } as EditOp), current),
      })
      await cache.removeOutbox(item.id)
    }
    await refreshPending()
  }, [cache, client, refreshPending])

  const doSync = useCallback(
    async (force = false) => {
      const gh = client()
      if (!gh) {
        setState('unconfigured')
        return
      }
      setState((s) => (s === 'loading' ? 'loading' : 'syncing'))
      try {
        await flush()
        const head = await gh.headSha()
        const known = await cache.getMeta<string>('head')
        if (force || head !== known || !entries.current.size) {
          const { entries: list } = await gh.tree(head)
          const old = entries.current
          const next = new Map(list.map((e) => [e.path, e]))
          const toLoad = list.filter((e) => wantsText(e.path) && (old.get(e.path)?.sha !== e.sha || !texts.current.has(e.path)))
          const queue = [...toLoad]
          const worker = async () => {
            for (let e = queue.shift(); e; e = queue.shift()) texts.current.set(e.path, await gh.blobText(e.sha))
          }
          await Promise.all(Array.from({ length: 6 }, worker))
          for (const p of [...texts.current.keys()]) if (!next.has(p)) texts.current.delete(p)
          entries.current = next
          await cache.replaceTree(list, texts.current)
          await cache.setMeta('head', head)
          rebuild()
        }
        const now = nowIso()
        setLastSync(now)
        await cache.setMeta('lastSync', now)
        setError(undefined)
        setState('ready')
        gh.repoInfo()
          .then((r) => setPrivate(r.private))
          .catch(() => undefined)
      } catch (e) {
        if (e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          setState('offline')
        } else {
          setError(explainGitHubError(e))
          setState('error')
        }
      }
    },
    [cache, client, flush, rebuild],
  )

  const sync = useCallback(
    async (force = false) => {
      if (syncing.current) return syncing.current
      syncing.current = doSync(force).finally(() => {
        syncing.current = null
      })
      return syncing.current
    },
    [doSync],
  )

  // Start: Zwischenspeicher laden, dann abgleichen
  useEffect(() => {
    let alive = true
    void (async () => {
      // Lokale Vorschau (npm run dev:vault): liest den Vault direkt vom Mac, nur lesend
      const cfg = import.meta.env.VITE_DEV_VAULT ? DEV_VAULT : await cache.config()
      configRef.current = cfg
      if (!alive) return
      setConfig(cfg)
      const files = await cache.files()
      entries.current = new Map(files.map((f) => [f.path, { path: f.path, sha: f.sha, size: f.size }]))
      texts.current = new Map(files.filter((f) => f.text !== undefined).map((f) => [f.path, f.text!]))
      setLastSync(await cache.getMeta<string>('lastSync'))
      await refreshPending()
      if (files.length) {
        rebuild()
        setState('ready')
      }
      if (cfg) await sync()
      else setState('unconfigured')
    })()
    return () => {
      alive = false
    }
  }, [cache, rebuild, refreshPending, sync])

  // Wieder online, App wieder im Vordergrund und jede Minute, solange sie sichtbar ist: abgleichen.
  // So erscheint, was in Obsidian geschrieben wurde (der Mac schickt es alle 2 Minuten zu GitHub), von selbst.
  useEffect(() => {
    const on = () => {
      if (configRef.current && document.visibilityState === 'visible' && navigator.onLine !== false) void sync()
    }
    const timer = window.setInterval(on, POLL_MS)
    window.addEventListener('online', on)
    window.addEventListener('focus', on)
    document.addEventListener('visibilitychange', on)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', on)
      window.removeEventListener('focus', on)
      document.removeEventListener('visibilitychange', on)
    }
  }, [sync])

  const saveConfig = useCallback(
    async (cfg: VaultConfig) => {
      const prev = configRef.current
      const changedRepo = !prev || prev.owner !== cfg.owner || prev.repo !== cfg.repo || prev.branch !== cfg.branch
      await cache.setMeta('config', cfg)
      configRef.current = cfg
      setConfig(cfg)
      if (changedRepo) {
        await cache.clearVault()
        entries.current = new Map()
        texts.current = new Map()
        rebuild()
      }
      await sync(true)
    },
    [cache, rebuild, sync],
  )

  const disconnect = useCallback(async () => {
    await cache.setMeta('config', undefined)
    await cache.clearVault()
    configRef.current = undefined
    entries.current = new Map()
    texts.current = new Map()
    setConfig(undefined)
    rebuild()
    setState('unconfigured')
  }, [cache, rebuild])

  const text = useCallback(
    async (path: string) => {
      const have = texts.current.get(path)
      if (have !== undefined) return have
      const entry = entries.current.get(path)
      if (!entry) return undefined
      // Gerade lokal geschrieben und noch nicht abgeglichen
      const local = entry.sha.startsWith('local-') ? await cache.bin(entry.sha) : undefined
      if (local) return local.text()
      const gh = client()
      if (!gh) return undefined
      const t = await gh.blobText(entry.sha)
      texts.current.set(path, t)
      await cache.putText(path, entry.sha, entry.size, t)
      return t
    },
    [cache, client],
  )

  const textNow = useCallback((path: string) => texts.current.get(path), [])

  const fileBlob = useCallback(
    async (path: string) => {
      const entry = entries.current.get(path)
      if (!entry) return undefined
      const cached = await cache.bin(entry.sha)
      if (cached) return cached
      const gh = client()
      if (!gh) return undefined
      const bytes = await gh.blobBytes(entry.sha)
      const blob = new Blob([bytes as BlobPart], { type: mimeFor(path) })
      // Große Dateien (Bücher) nicht dauerhaft zwischenspeichern
      if (entry.size < 25_000_000) await cache.putBin(entry.sha, blob)
      return blob
    },
    [cache, client],
  )

  const fileUrl = useCallback(
    async (path: string) => {
      const entry = entries.current.get(path)
      if (!entry) return undefined
      const have = urls.current.get(entry.sha)
      if (have) return have
      const blob = await fileBlob(path)
      if (!blob) return undefined
      const url = URL.createObjectURL(blob)
      urls.current.set(entry.sha, url)
      return url
    },
    [fileBlob],
  )

  const write = useCallback(
    async (message: string, files: { path: string; content: Blob | string }[], edits: ({ path: string } & EditOp)[] = [], deletes: string[] = []): Promise<'sent' | 'queued'> => {
      const item: OutboxItem = {
        id: uid(),
        message,
        createdAt: nowIso(),
        files: await Promise.all(files.map(async (f) => ({ path: f.path, base64: typeof f.content === 'string' ? textToBase64(f.content) : await blobToBase64(f.content) }))),
        edits: edits.map((e) => ({ path: e.path, op: e.op, arg: e.arg })),
        ...(deletes.length ? { deletes } : {}),
      }
      for (const d of deletes) {
        entries.current.delete(d)
        texts.current.delete(d)
      }
      // Sofort lokal sichtbar machen (Texte und Bäume), bis der nächste Abgleich die echten SHAs bringt
      for (const f of files) {
        const size = typeof f.content === 'string' ? new Blob([f.content]).size : f.content.size
        entries.current.set(f.path, { path: f.path, sha: `local-${item.id}-${f.path}`, size })
        if (typeof f.content === 'string' && wantsText(f.path)) texts.current.set(f.path, f.content)
        if (typeof f.content !== 'string') {
          await cache.putBin(`local-${item.id}-${f.path}`, f.content)
        } else await cache.putBin(`local-${item.id}-${f.path}`, new Blob([f.content], { type: mimeFor(f.path) }))
      }
      for (const e of edits) {
        const next = applyEdit(texts.current.get(e.path), e)
        if (next !== undefined) texts.current.set(e.path, next)
      }
      rebuild()
      await cache.putOutbox(item)
      await refreshPending()
      if (!configRef.current) return 'queued'
      try {
        await flush()
        void sync(true)
        return 'sent'
      } catch (e) {
        if (e instanceof GitHubError && e.status !== 422) {
          setError(explainGitHubError(e))
          setState('error')
        } else setState('offline')
        return 'queued'
      }
    },
    [cache, flush, rebuild, refreshPending, sync],
  )

  const toggleTodo = useCallback(async (title: string) => void (await write(`Todo: ${title} abgehakt`, [], [{ path: TODOS, op: 'toggleTodo', arg: title }])), [write])
  const addTodo = useCallback(async (todo: Todo) => void (await write(`Todo: ${todo.title}`, [], [{ path: TODOS, op: 'addTodo', arg: JSON.stringify(todo) }])), [write])
  const exists = useCallback((path: string) => entries.current.has(path), [])

  const value = useMemo<Vault>(
    () => ({ config, state, error, model, lastSync, pending, isPrivate, saveConfig, disconnect, sync, text, textNow, fileUrl, fileBlob, write, toggleTodo, addTodo, exists }),
    [config, state, error, model, lastSync, pending, isPrivate, saveConfig, disconnect, sync, text, textNow, fileUrl, fileBlob, write, toggleTodo, addTodo, exists],
  )
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): Vault {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault außerhalb von VaultProvider')
  return ctx
}
