type Props = { size?: number; className?: string }

const wrap = (children: React.ReactNode) => ({ size = 18, className }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
)

export const SearchIcon = wrap(
  <>
    <circle cx={11} cy={11} r={7} />
    <path d="m20 20-3.4-3.4" />
  </>
)
export const CogIcon = wrap(
  <>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>
)
export const KeyIcon = wrap(
  <>
    <circle cx={8} cy={15} r={4} />
    <path d="m11 12 9-9M16 7l3 3M14 9l3 3" />
  </>
)
export const SunIcon = wrap(
  <>
    <circle cx={12} cy={12} r={4} />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </>
)
export const ArrowIcon = wrap(<path d="M5 12h14M13 6l6 6-6 6" />)
export const BackIcon = wrap(<path d="M19 12H5M11 18l-6-6 6-6" />)
export const PowerIcon = wrap(
  <>
    <path d="M12 3v9" />
    <path d="M5.6 7.4a8 8 0 1 0 12.8 0" />
  </>
)
export const CodeIcon = wrap(<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />)
export const RefreshIcon = wrap(
  <>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </>
)

export function BrandMark({ size = 14 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect width="16" height="16" rx="3.6" fill="currentColor" />
      <text
        x="8"
        y="11.6"
        textAnchor="middle"
        fontFamily="-apple-system, Helvetica, Arial, sans-serif"
        fontWeight="700"
        fontSize="10.5"
        fill="var(--panel)"
      >
        R
      </text>
    </svg>
  )
}

export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="kg">
      {keys.map((k, i) => (
        <span key={i} className="kbd">
          {k}
        </span>
      ))}
    </span>
  )
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      Rift
    </span>
  )
}
