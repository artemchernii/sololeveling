import type { Area } from '@/lib/capture-parser'
import { areaVars } from '@/lib/areas'

/* A project's mark (20 Sep). An uploaded image when there is one, and until
   then the project's initial in its goal's area colour — a placeholder that
   says which project this is rather than a grey square that says nothing.

   The letter is not a substitute for the real thing: it exists so the card has
   the same shape before and after he uploads one, and so the row does not jump
   when he does. */
export function ProjectLogo({
  url,
  title,
  area,
  size = 32,
}: {
  url: string | null
  title: string
  area: Area | undefined
  size?: number
}) {
  const style = { width: size, height: size }

  if (url !== null) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        className="shrink-0 rounded-[8px] object-cover"
      />
    )
  }

  return (
    <span
      aria-hidden
      style={{ ...style, ...(area ? areaVars(area) : undefined) }}
      className={`flex shrink-0 items-center justify-center rounded-[8px] text-[14px] font-light ${
        area ? 'bg-(--area)/16 text-area' : 'bg-lift/8 text-ink-500'
      }`}
    >
      {title.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}
