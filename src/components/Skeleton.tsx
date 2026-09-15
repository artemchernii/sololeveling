import { cn } from '@/lib/utils'

/* §3d.2: loading shows shape, never values. A bar stands where text will be
   and carries no number, no "0", no plausible figure.

   It breathes (motion-breathe, PLAN §3d.2). Built still at first, by §3d.1's
   rule that the app moving on its own does not animate — and a still grey bar
   read as a page that had died. Only opacity moves; the rows it stands in for
   still swap in without a transition, so nothing reflows. Every bar mounts at
   the same moment, so they breathe together. */

/* Fixed, not random: a skeleton that changes shape between renders is itself
   motion nobody asked for. */
const WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3', 'w-[55%]', 'w-[45%]']

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'motion-breathe block h-3 rounded-full bg-lift/[0.08]',
        className,
      )}
    />
  )
}

/* Rows with the same padding and hairlines as the list that replaces them, so
   nothing below jumps when it arrives. `line` is the height of one line of the
   real row's text; `twoLine` adds the second line projects carry. */
export function SkeletonRows({
  rows,
  twoLine = false,
  rowClassName = 'py-2.5',
  line = 'h-5',
  bar,
}: {
  rows: number
  twoLine?: boolean
  rowClassName?: string
  line?: string
  bar?: string
}) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(
            'flex flex-col gap-1 border-b border-lift/[0.05] last:border-b-0',
            rowClassName,
          )}
        >
          <div className={cn('flex items-center', line)}>
            <Skeleton className={cn(WIDTHS[i % WIDTHS.length], bar)} />
          </div>
          {twoLine ? (
            <div className="flex h-5 items-center">
              <Skeleton className="h-2.5 w-1/4" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
