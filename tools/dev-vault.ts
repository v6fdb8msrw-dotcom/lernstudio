import { execFileSync } from 'node:child_process'
import type { Plugin } from 'vite'

/*
 * Nur für die lokale Vorschau: beantwortet die paar GitHub-API-Aufrufe, die die App zum Lesen braucht,
 * direkt aus dem Vault auf dem Mac (git im Ordner VITE_DEV_VAULT). Schreiben ist hier abgeschaltet.
 */
export function devVault(dir: string): Plugin {
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { maxBuffer: 1 << 28 })
  return {
    name: 'dev-vault',
    configureServer(server) {
      server.middlewares.use('/__vault/repos/local/Uni', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const send = (body: unknown, status = 200) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          if (req.method !== 'GET') return send({ message: 'Lokale Vorschau: nur lesen' }, 403)
          const p = decodeURIComponent(url.pathname)
          if (p === '/' || p === '') return send({ private: true, default_branch: 'main', full_name: 'local/Uni' })
          if (p.startsWith('/git/ref/heads/')) return send({ object: { sha: git('rev-parse', 'HEAD').toString().trim() } })
          if (p.startsWith('/git/trees/')) {
            const tree = git('ls-tree', '-r', '-l', p.slice(11)).toString().trim().split('\n').map((line) => {
              const [meta, path] = line.split('\t')
              const [, type, sha, size] = meta.split(/\s+/)
              return { path, type, sha, size: Number(size) || 0 }
            })
            return send({ tree, truncated: false })
          }
          if (p.startsWith('/git/blobs/')) return send({ content: git('cat-file', 'blob', p.slice(11)).toString('base64'), encoding: 'base64' })
          if (p.startsWith('/contents/')) {
            const ref = url.searchParams.get('ref') ?? 'HEAD'
            const sha = git('rev-parse', `${ref}:${p.slice(10)}`).toString().trim()
            return send({ sha })
          }
          send({ message: 'Not Found' }, 404)
        } catch {
          send({ message: 'Not Found' }, 404)
        }
      })
    },
  }
}
