/**
 * Geovault Logo Components — Globe Meridian Design
 * Variants: full (with tagline), compact (navbar), icon-only (favicon/small)
 * Modes: light (white bg), dark (dark bg)
 */

/* ─── Icon Only (globe in hexagon) ─── */
export function GeovaultIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="32" height="32" rx="8" fill="#0b2a5e" />
      <polygon points="16,3 28,9.5 28,22.5 16,29 4,22.5 4,9.5" fill="#0f2d60" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#2563eb" strokeWidth="1.2" />
      <path d="M8.5 16 Q16 13 23.5 16" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M8.5 16 Q16 19 23.5 16" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M16 8.5 Q13 16 16 23.5" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <path d="M16 8.5 Q19 16 16 23.5" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <circle cx="16" cy="16" r="1.8" fill="#60a5fa" />
    </svg>
  )
}

/* ─── Compact Logo (navbar — light bg) ─── */
export function GeovaultLogoCompact({ className }: { className?: string }) {
  return (
    <svg width="168" height="40" viewBox="0 0 168 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="20,2 35,10.5 35,27.5 20,36 5,27.5 5,10.5" fill="#0b2a5e" />
      <circle cx="20" cy="19" r="9" fill="none" stroke="#2563eb" strokeWidth="1.2" />
      <path d="M11 19 Q20 15.5 29 19" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M11 19 Q20 22.5 29 19" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M20 10 Q16.5 19 20 28" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <path d="M20 10 Q23.5 19 20 28" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <circle cx="20" cy="19" r="1.8" fill="#60a5fa" />
      <circle cx="20" cy="19" r="0.8" fill="#0b2a5e" />
      <text x="44" y="24" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="19" fontWeight="700" fill="#0b2a5e" letterSpacing="-0.6">Geo</text>
      <text x="80" y="24" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="19" fontWeight="200" fill="#1d4ed8" letterSpacing="-0.3">vault</text>
    </svg>
  )
}

/* ─── Compact Logo (navbar — dark bg) ─── */
export function GeovaultLogoCompactDark({ className }: { className?: string }) {
  return (
    <svg width="168" height="40" viewBox="0 0 168 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="20,2 35,10.5 35,27.5 20,36 5,27.5 5,10.5" fill="#0f2d60" />
      <circle cx="20" cy="19" r="9" fill="none" stroke="#2563eb" strokeWidth="1.2" />
      <path d="M11 19 Q20 15.5 29 19" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M11 19 Q20 22.5 29 19" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M20 10 Q16.5 19 20 28" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <path d="M20 10 Q23.5 19 20 28" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.8" />
      <circle cx="20" cy="19" r="1.8" fill="#60a5fa" />
      <circle cx="20" cy="19" r="0.8" fill="#07111f" />
      <text x="44" y="24" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="19" fontWeight="700" fill="#ffffff" letterSpacing="-0.6">Geo</text>
      <text x="80" y="24" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="19" fontWeight="200" fill="#60a5fa" letterSpacing="-0.3">vault</text>
    </svg>
  )
}

/* ─── Full Logo (with tagline — light bg) ─── */
export function GeovaultLogoFull({ className }: { className?: string }) {
  return (
    <svg width="224" height="52" viewBox="0 0 224 52" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="26,2 46,13 46,35 26,46 6,35 6,13" fill="#0b2a5e" />
      <polygon points="26,6 43,16 43,32 26,43 9,32 9,16" fill="none" stroke="#1d4ed8" strokeWidth="0.8" opacity="0.6" />
      <circle cx="26" cy="24" r="11.5" fill="none" stroke="#2563eb" strokeWidth="1.4" />
      <path d="M14.5 24 Q26 19.5 37.5 24" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M14.5 24 Q26 28.5 37.5 24" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M17 17.5 Q26 15 35 17.5" fill="none" stroke="#93c5fd" strokeWidth="0.7" opacity="0.7" />
      <path d="M17 30.5 Q26 33 35 30.5" fill="none" stroke="#93c5fd" strokeWidth="0.7" opacity="0.7" />
      <path d="M26 12.5 Q21.5 24 26 35.5" fill="none" stroke="#93c5fd" strokeWidth="0.9" opacity="0.8" />
      <path d="M26 12.5 Q30.5 24 26 35.5" fill="none" stroke="#93c5fd" strokeWidth="0.9" opacity="0.8" />
      <circle cx="26" cy="24" r="2.2" fill="#60a5fa" />
      <circle cx="26" cy="24" r="1" fill="#0b2a5e" />
      <text x="57" y="25" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="21" fontWeight="700" fill="#0b2a5e" letterSpacing="-0.8">Geo</text>
      <text x="97" y="25" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="21" fontWeight="200" fill="#1d4ed8" letterSpacing="-0.4">vault</text>
      <text x="57" y="39" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="7" fontWeight="600" fill="#3b82f6" letterSpacing="2.4">APAC GEO AUTHORITY</text>
    </svg>
  )
}

/* ─── Full Logo (with tagline — dark bg) ─── */
export function GeovaultLogoFullDark({ className }: { className?: string }) {
  return (
    <svg width="224" height="52" viewBox="0 0 224 52" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="26,2 46,13 46,35 26,46 6,35 6,13" fill="#0f2d60" />
      <polygon points="26,6 43,16 43,32 26,43 9,32 9,16" fill="none" stroke="#2563eb" strokeWidth="0.8" opacity="0.5" />
      <circle cx="26" cy="24" r="11.5" fill="none" stroke="#2563eb" strokeWidth="1.4" />
      <path d="M14.5 24 Q26 19.5 37.5 24" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M14.5 24 Q26 28.5 37.5 24" fill="none" stroke="#60a5fa" strokeWidth="0.9" />
      <path d="M17 17.5 Q26 15 35 17.5" fill="none" stroke="#93c5fd" strokeWidth="0.7" opacity="0.7" />
      <path d="M17 30.5 Q26 33 35 30.5" fill="none" stroke="#93c5fd" strokeWidth="0.7" opacity="0.7" />
      <path d="M26 12.5 Q21.5 24 26 35.5" fill="none" stroke="#93c5fd" strokeWidth="0.9" opacity="0.8" />
      <path d="M26 12.5 Q30.5 24 26 35.5" fill="none" stroke="#93c5fd" strokeWidth="0.9" opacity="0.8" />
      <circle cx="26" cy="24" r="2.2" fill="#60a5fa" />
      <circle cx="26" cy="24" r="1" fill="#07111f" />
      <text x="57" y="25" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="21" fontWeight="700" fill="#ffffff" letterSpacing="-0.8">Geo</text>
      <text x="97" y="25" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="21" fontWeight="200" fill="#60a5fa" letterSpacing="-0.4">vault</text>
      <text x="57" y="39" fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" fontSize="7" fontWeight="600" fill="#60a5fa" letterSpacing="2.4">APAC GEO AUTHORITY</text>
    </svg>
  )
}
