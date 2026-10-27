import type { TreeEntry, VaultConfig } from '../types'

/*
 * Schlanker Client für die GitHub-REST-API (kostenlos, 5.000 Anfragen pro Stunde mit Token).
 * Gelesen wird der Git-Baum und einzelne Blobs; geschrieben wird über die Git-Data-API,
 * damit viele Dateien in einem einzigen Commit landen.
 */

const API = import.meta.env.VITE_DEV_VAULT ? '/__vault' : 'https://api.github.com'

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fehler in Sätze übersetzen, die man versteht. */
export function explainGitHubError(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'Der GitHub-Zugangsschlüssel ist ungültig oder abgelaufen. Trag unter Einstellungen einen neuen ein.'
    if (e.status === 403) return 'GitHub verweigert den Zugriff. Prüfe, ob der Schlüssel Lese- und Schreibrechte („Contents“) für das Vault-Repo hat.'
    if (e.status === 404) return 'Repo nicht gefunden. Prüfe Besitzer und Name unter Einstellungen und ob der Schlüssel Zugriff auf dieses Repo hat.'
    if (e.status === 409) return 'Das Repo ist leer oder der Branch fehlt.'
    if (e.status === 422) return 'GitHub hat die Änderung abgelehnt (vermutlich gleichzeitig von woanders geändert). Versuch es nochmal.'
    return `GitHub meldet einen Fehler (${e.status}): ${e.message}`
  }
  if (e instanceof TypeError) return 'Keine Verbindung zu GitHub. Bist du offline?'
  return e instanceof Error ? e.message : String(e)
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export class GitHubClient {
  private cfg: VaultConfig
  constructor(cfg: VaultConfig) {
    this.cfg = cfg
  }

  private get base(): string {
    return `${API}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path.startsWith('http') ? path : this.base + path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      let msg = res.statusText
      try {
        msg = ((await res.json()) as { message?: string }).message ?? msg
      } catch {
        // kein JSON
      }
      throw new GitHubError(res.status, msg)
    }
    return (await res.json()) as T
  }

  /** Prüft Zugang und liefert, ob das Repo privat ist. */
  async repoInfo(): Promise<{ private: boolean; defaultBranch: string; fullName: string }> {
    const r = await this.req<{ private: boolean; default_branch: string; full_name: string }>('')
    return { private: r.private, defaultBranch: r.default_branch, fullName: r.full_name }
  }

  async headSha(): Promise<string> {
    const r = await this.req<{ object: { sha: string } }>(`/git/ref/heads/${encodePath(this.cfg.branch)}`)
    return r.object.sha
  }

  /** Ganzer Dateibaum (nur Dateien). */
  async tree(commitSha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    const r = await this.req<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(`/git/trees/${commitSha}?recursive=1`)
    return {
      entries: r.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha, size: t.size ?? 0 })),
      truncated: r.truncated,
    }
  }

  async blobBase64(sha: string): Promise<string> {
    const r = await this.req<{ content: string; encoding: string }>(`/git/blobs/${sha}`)
    return r.content.replace(/\n/g, '')
  }

  async blobText(sha: string): Promise<string> {
    return base64ToText(await this.blobBase64(sha))
  }

  async blobBytes(sha: string): Promise<Uint8Array> {
    return base64ToBytes(await this.blobBase64(sha))
  }

  /** Gibt es die Datei in diesem Stand? */
  async existsAt(path: string, ref: string): Promise<boolean> {
    try {
      await this.req(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)
      return true
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return false
      throw e
    }
  }

  /** Textinhalt einer Datei in einem bestimmten Stand, undefined wenn es sie nicht gibt. */
  async textAt(path: string, ref: string): Promise<string | undefined> {
    try {
      const r = await this.req<{ sha: string; content?: string; encoding?: string }>(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)
      if (r.content && r.encoding === 'base64') return base64ToText(r.content.replace(/\n/g, ''))
      return this.blobText(r.sha)
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return undefined
      throw e
    }
  }

  /**
   * Schreibt Dateien (und löscht optional welche) in einem Commit auf den Branch.
   * Ist der Branch inzwischen weiter (z. B. Claude Code hat gepusht), wird auf den neuen Stand
   * aufgesetzt und erneut versucht. `edit` darf Textdateien auf Basis des neuesten Stands anpassen.
   */
  async commit(opts: {
    message: string
    files: { path: string; base64: string }[]
    deletes?: string[]
    edit?: (path: string, current: string | undefined) => string | undefined
    editPaths?: string[]
  }): Promise<string> {
    const blobShas = new Map<string, string>()
    for (const f of opts.files) {
      const r = await this.req<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.base64, encoding: 'base64' }) })
      blobShas.set(f.path, r.sha)
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.headSha()
      const headCommit = await this.req<{ tree: { sha: string } }>(`/git/commits/${head}`)
      const tree: { path: string; mode: string; type: string; sha: string | null }[] = [...blobShas].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }))
      // Nur löschen, was es auf dem Branch gibt (sonst lehnt GitHub den ganzen Commit ab)
      for (const path of opts.deletes ?? []) if (!blobShas.has(path) && (await this.existsAt(path, head))) tree.push({ path, mode: '100644', type: 'blob', sha: null })
      if (opts.edit && opts.editPaths?.length) {
        for (const path of opts.editPaths) {
          const text = await this.textAt(path, head)
          const next = opts.edit(path, text)
          if (next === undefined || next === text) continue
          const b = await this.req<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: textToBase64(next), encoding: 'base64' }) })
          tree.push({ path, mode: '100644', type: 'blob', sha: b.sha })
        }
      }
      if (!tree.length) return head
      const newTree = await this.req<{ sha: string }>('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }) })
      const commit = await this.req<{ sha: string }>('/git/commits', { method: 'POST', body: JSON.stringify({ message: opts.message, tree: newTree.sha, parents: [head] }) })
      try {
        await this.req(`/git/refs/heads/${encodePath(this.cfg.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
        return commit.sha
      } catch (e) {
        // Branch hat sich bewegt: neu aufsetzen
        if (e instanceof GitHubError && e.status === 422 && attempt < 3) continue
        throw e
      }
    }
    throw new GitHubError(422, 'Branch ändert sich zu schnell')
  }
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function base64ToText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64))
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}
