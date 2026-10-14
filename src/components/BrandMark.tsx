import { useId } from 'react'

/** Logo: ein „L“ in Silber über einem beigen Textmarker-Strich. */
export function BrandMark({ size = 22 }: { size?: number }) {
  const id = `bm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9bec6" />
          <stop offset="0.5" stopColor="#8d939c" />
          <stop offset="1" stopColor="#5f656e" />
        </linearGradient>
      </defs>
      <rect x="6" y="18.5" width="20" height="5" rx="1.6" fill="#e2cfa8" />
      <path d="M10 6.5v14.5h13" stroke={`url(#${id})`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="8" r="1.8" fill="#c4a979" />
    </svg>
  )
}
