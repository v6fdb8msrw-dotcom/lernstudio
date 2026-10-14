import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OutboxItem, TreeEntry, VaultConfig } from '../types'

/*
 * Lokaler Zwischenspeicher des Vaults in der IndexedDB: Dateibaum, Markdown-Texte, geladene
 * Binärdateien (Bilder, PDFs) und noch nicht gesendete Änderungen.
 * Damit startet die App sofort und funktioniert offline; die Wahrheit bleibt das GitHub-Repo.
 */

interface CachedFile extends TreeEntry {
  /** Text, nur bei Markdown-Dateien, die geladen wurden */
  text?: string
}

interface BinRecord {
  sha: string
  blob: Blob
}

interface Schema extends DBSchema {
  files: { key: string; value: CachedFile }
  bin: { key: string; value: BinRecord }
  outbox: { key: string; value: OutboxItem }
  meta: { key: string; value: { key: string; value: unknown } }
}

export class VaultCache {
  private dbPromise: Promise<IDBPDatabase<Schema>>

  constructor(name = 'lernstudio-vault') {
    this.dbPromise = openDB<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'path' })
        db.createObjectStore('bin', { keyPath: 'sha' })
        db.createObjectStore('outbox', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }

  async files(): Promise<CachedFile[]> {
    return (await this.dbPromise).getAll('files')
  }

  /** Neuen Baum übernehmen: Texte unveränderter Dateien behalten, gelöschte entfernen. */
  async replaceTree(entries: TreeEntry[], texts: Map<string, string>): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction('files', 'readwrite')
    await tx.store.clear()
    for (const e of entries) await tx.store.put({ ...e, text: texts.get(e.path) })
    await tx.done
  }

  async putText(path: string, sha: string, size: number, text: string): Promise<void> {
    const db = await this.dbPromise
    await db.put('files', { path, sha, size, text })
  }

  async bin(sha: string): Promise<Blob | undefined> {
    return (await (await this.dbPromise).get('bin', sha))?.blob
  }

  async putBin(sha: string, blob: Blob): Promise<void> {
    await (await this.dbPromise).put('bin', { sha, blob })
  }

  async outbox(): Promise<OutboxItem[]> {
    const list = await (await this.dbPromise).getAll('outbox')
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async putOutbox(item: OutboxItem): Promise<void> {
    await (await this.dbPromise).put('outbox', item)
  }

  async removeOutbox(id: string): Promise<void> {
    await (await this.dbPromise).delete('outbox', id)
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await (await this.dbPromise).get('meta', key))?.value as T | undefined
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await (await this.dbPromise).put('meta', { key, value })
  }

  async config(): Promise<VaultConfig | undefined> {
    return this.getMeta<VaultConfig>('config')
  }

  /** Alles Vault-bezogene vergessen (z. B. bei Repo-Wechsel). */
  async clearVault(): Promise<void> {
    const db = await this.dbPromise
    await db.clear('files')
    await db.clear('bin')
    await db.delete('meta', 'head')
  }
}
