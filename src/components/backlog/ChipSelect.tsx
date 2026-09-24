import type { CSSProperties, ReactNode } from 'react'

/* A chip that is a native select underneath (24 Sep). The backlog's pickers
   were bordered form fields — "unbound" in a grey box on every row — which
   is what made the list read as a form rather than a list of things to do.
   The chip shows what is chosen, or a faint prompt; the select on top of it
   keeps the platform's own picker on a phone, which is why it is native. */
export function ChipSelect({
  label,
  value,
  text,
  onChange,
  children,
  icon,
  style,
  className = '',
  iconOnlyOnPhone = false,
}: {
  /** For screen readers: what this picks. */
  label: string
  value: string
  /** What the chip says — the chosen thing, or a prompt when nothing is. */
  text: string
  onChange: (next: string) => void
  /** The <option>s. */
  children: ReactNode
  icon?: ReactNode
  style?: CSSProperties
  className?: string
  /** A prompt, not a value: on a phone the icon says it in less room. */
  iconOnlyOnPhone?: boolean
}) {
  return (
    <span
      style={style}
      className={`motion-press relative inline-flex max-w-[14rem] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] whitespace-nowrap transition-colors ${className}`}
    >
      {icon}
      <span
        className={`pointer-events-none truncate ${iconOnlyOnPhone ? 'hidden md:inline' : ''}`}
      >
        {text}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {children}
      </select>
    </span>
  )
}
