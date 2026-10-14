/** Kurze, sortierbare ID (Zeit + Zufall), gültig als Dateiname und in URLs. */
export function uid(): string {
  const rand = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, '0')).join('') : Math.random().toString(36).slice(2, 12)
  return Date.now().toString(36) + rand
}

export function nowIso(): string {
  return new Date().toISOString()
}
