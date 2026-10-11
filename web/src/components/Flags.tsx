import { cx } from './cx'

// The U.S. flag is simplified for small sizes. It uses america.gov's
// 16×9 layout (stars as a dot grid) and its favicon colors.

const starRows = [
  { y: 1, xs: [1, 2.67, 4.33, 6] },
  { y: 1.81, xs: [1.83, 3.5, 5.17] },
  { y: 2.5, xs: [1, 2.67, 4.33, 6] },
  { y: 3.18, xs: [1.83, 3.5, 5.17] },
  { y: 4, xs: [1, 2.67, 4.33, 6] },
]

export function USFlag({ width = 24, className }: { width?: number; className?: string }) {
  return (
    <svg
      width={width}
      height={(width * 9) / 16}
      viewBox="0 0 16 9"
      className={className}
      role="img"
      aria-label="United States flag"
    >
      <rect width="16" height="9" fill="#fff" />
      {[0, 2, 4, 6, 8].map((y) => (
        <rect key={y} x={y < 6 ? 7 : 0} y={y} width={y < 6 ? 9 : 16} height="1" fill="var(--color-flag-red)" />
      ))}
      <rect width="7" height="5" fill="var(--color-flag-blue)" />
      {starRows.flatMap((r) =>
        r.xs.map((x) => (
          <path key={`${x}-${r.y}`} d={`M${x} ${r.y - 0.38}l.38.38-.38.38-.38-.38Z`} fill="#fff" />
        )),
      )}
    </svg>
  )
}

// The official Bear Flag (public domain; original by Donald Graeme Kelley,
// SVG from Wikimedia Commons: File:Flag_of_California.svg).
export function CaliforniaFlag({ width = 24, className }: { width?: number; className?: string }) {
  return (
    <img
      src="/ca-flag.svg"
      width={width}
      height={(width * 2) / 3}
      alt="California flag"
      decoding="async"
      draggable={false}
      className={cx('inline-block shrink-0 object-cover', className)}
    />
  )
}
