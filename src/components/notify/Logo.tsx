import { useId } from 'react'

/* His logo (15 Oct), the same mark as public/logo.svg, drawn inline so its
   bars can grow and its dot breathe. `still` for small places. */
export function Logo({
  className,
  still = false,
}: {
  className?: string
  still?: boolean
}) {
  const id = useId()
  return (
    <svg
      viewBox="0 0 128 128"
      className={[still ? '' : 'nt-logo', className].join(' ')}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5d5294" />
          <stop offset=".55" stopColor="#9184d9" />
          <stop offset="1" stopColor="#d2cefd" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" fill="#14131c" />
      <g fill={`url(#${id})`}>
        <rect className="nt-bar" x="24" y="78" width="18" height="26" rx="6" />
        <rect className="nt-bar" x="49" y="60" width="18" height="44" rx="6" />
        <rect className="nt-bar" x="74" y="42" width="18" height="62" rx="6" />
      </g>
      <circle className="nt-dot" cx="107" cy="30" r="9" fill="#d2cefd" />
    </svg>
  )
}
