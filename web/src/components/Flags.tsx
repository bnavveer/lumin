// Simplified flags for small sizes. The U.S. flag uses america.gov's
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

export function CaliforniaFlag({ width = 24, className }: { width?: number; className?: string }) {
  return (
    <svg
      width={width}
      height={(width * 2) / 3}
      viewBox="0 0 30 20"
      className={className}
      role="img"
      aria-label="California flag"
    >
      <rect width="30" height="20" fill="#fff" />
      <rect y="16.6" width="30" height="3.4" fill="#b8202f" />
      <path
        d="m3.6 1.6.62 1.9h2l-1.62 1.17.62 1.9-1.62-1.17-1.62 1.17.62-1.9L1.38 3.5h2Z"
        fill="#b8202f"
      />
      <rect x="7" y="14.1" width="17" height="0.7" rx="0.35" fill="#5b7f2a" />
      <path
        d="M8 9.2C8 8 9 7.4 10 7.6l1.2.3c1.8-.7 4.8-.9 7.3-.3 2 .5 3.5 1.6 3.9 3.2l.4 2.4-1.2.2-.6-1.6c-.4.5-.8.8-1.2 1l.2 1.2-1.2.1-.4-1.2c-1.9.2-3.9.2-5.4-.1l-.2 1.2-1.2.1v-1.7c-.6-.3-1-.8-1.2-1.4l.2 3-1.2.1-.2-3.5c-.7-.2-1.4-.4-1.8-.7Z"
        fill="#5a3a1e"
      />
    </svg>
  )
}
