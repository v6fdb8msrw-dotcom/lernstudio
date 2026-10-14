/** Bildformate, die alle Browser sicher anzeigen. Andere Fotos (z. B. HEIC vom iPhone) werden in JPEG umgewandelt. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_SIDE = 2400

/** Große Fotos verkleinern und exotische Bildformate in JPEG umwandeln. */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.size < 1_500_000 && IMAGE_TYPES.includes(file.type)) return file
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && IMAGE_TYPES.includes(file.type)) {
    bmp.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', 0.86))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Grobe Art der Datei für Symbol und Anzeige. */
export function fileKind(type: string, name: string): 'pdf' | 'image' | 'text' | 'doc' | 'slides' | 'sheet' | 'audio' | 'video' | 'other' {
  const n = name.toLowerCase()
  if (type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('text/')) return 'text'
  if (/\.(pptx?|key|odp)$/.test(n)) return 'slides'
  if (/\.(xlsx?|numbers|ods|csv)$/.test(n)) return 'sheet'
  if (/\.(docx?|pages|odt|rtf)$/.test(n)) return 'doc'
  return 'other'
}
