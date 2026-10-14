const DE_SHORT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' })
const DE_LONG = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
const DE_FULL = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
const DE_TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function formatDateLong(d = new Date()): string {
  return DE_LONG.format(d)
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return DE_FULL.format(new Date(y, m - 1, d))
}

/** „gerade eben“, „vor 5 Min.“, „heute 14:20“, „gestern“, „12. Okt.“ */
export function relativeTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const minutes = (now.getTime() - d.getTime()) / 60000
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${Math.round(minutes)} Min.`
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= day0) return `heute ${DE_TIME.format(d)}`
  if (d.getTime() >= day0 - 86_400_000) return 'gestern'
  return DE_SHORT.format(d)
}

export interface ExamInfo {
  days: number
  text: string
  tone: 'past' | 'now' | 'soon' | 'later'
}

/** Countdown bis zur Klausur. `date` ist JJJJ-MM-TT. */
export function examInfo(date: string | undefined, now = new Date()): ExamInfo | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  const [y, m, d] = date.split('-').map(Number)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((new Date(y, m - 1, d).getTime() - today) / 86_400_000)
  if (days < 0) return { days, text: 'Klausur vorbei', tone: 'past' }
  if (days === 0) return { days, text: 'Klausur heute', tone: 'now' }
  if (days === 1) return { days, text: 'Klausur morgen', tone: 'now' }
  return { days, text: `Klausur in ${days} Tagen`, tone: days <= 14 ? 'soon' : 'later' }
}

export function greeting(h = new Date().getHours()): string {
  if (h < 5) return 'Späte Lernschicht'
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  if (h < 23) return 'Guten Abend'
  return 'Späte Lernschicht'
}
