import { BANDS, KIND_NAME } from '@/lib/weekGrid'
import type { Block, WeekKind } from '@/lib/weekGrid'
import { ICONS } from './AreaIcon'

/* THIS WEEK's small pieces, apart from WeekCard (25 Oct) so neither file
   grows past the size it can be read at. */

export const ICON: Record<WeekKind, keyof typeof ICONS> = {
  workout: 'body',
  langs: 'language',
  shake: 'shake',
  post: 'social',
  commits: 'projects',
  task: 'task',
}
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const dayName = (ms: number) => {
  const d = new Date(ms)
  return `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}`
}
const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A pill's word: a session says its language (`PT`, `ENG`). */
export function nameOf(b: Block, short: (area: string) => string): string {
  return b.kind === 'langs' ? short(b.area) : KIND_NAME[b.kind]
}

/** A pill's colour: its area's, but a ticked task is the app's lavender. */
export const areaColour = (b: Block) =>
  b.kind === 'task' ? 'var(--color-lav-400)' : `var(--area-${b.area})`

export function todayIndex(dayStarts: Array<number>, t: number) {
  for (let i = 6; i >= 0; i--) if (t >= dayStarts[i]) return i
  return 0
}

export function isCurrentBand(t: number, band: number) {
  const h = new Date(t).getHours()
  return h >= BANDS[band].startHour && h < BANDS[band].endHour
}

export function BandRow({
  label,
  current,
  children,
}: {
  label: (typeof BANDS)[number]
  current: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <div
        className={`flex items-center font-mono text-[9px] tracking-[0.14em] ${current ? 'text-lav-300' : 'text-ink-500'}`}
      >
        <span className="@2xl:hidden">{label.short}</span>
        <span className="hidden @2xl:inline">{label.name}</span>
      </div>
      {children}
    </>
  )
}

export function BlockPill({
  block,
  name,
  index,
  onTip,
  onDrag,
}: {
  block: Block
  name: string
  index: number
  onTip: (el: HTMLElement | null) => void
  onDrag: (on: boolean) => void
}) {
  const movable = block.id !== undefined
  const Icon = ICONS[ICON[block.kind]]
  return (
    <div
      data-block
      data-testid={`block-${block.kind}`}
      draggable={movable}
      style={{
        ['--area' as string]: areaColour(block),
        animationDelay: `${index * 30 + 200}ms`,
      }}
      onPointerEnter={(e) =>
        e.pointerType === 'mouse' && onTip(e.currentTarget)
      }
      onPointerLeave={() => onTip(null)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', block.id ?? '')
        onDrag(true)
      }}
      onDragEnd={() => onDrag(false)}
      className={`td-block flex h-[18px] min-w-6 items-center justify-center gap-1 rounded-[6px] bg-(--area) px-1.5 font-mono text-[8.5px] text-background transition-transform hover:z-10 hover:scale-110 ${movable ? 'cursor-grab' : 'cursor-default'}`}
    >
      <Icon aria-hidden className="size-[11px] shrink-0" strokeWidth={2} />
      <span className="hidden @2xl:inline">{name}</span>
    </div>
  )
}
