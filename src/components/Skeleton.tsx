import { cn } from '@/lib/utils'

/* §3d.2: loading shows shape, never values. A bar stands where text will be
   and carries no number, no "0", no plausible figure.

   One lavender light crosses every bar on the page together
   (motion-loading, 9 Oct) — the bars used to breathe each on their own, and
   read as cheap and as a page that had died. The rows it stands in for still
   swap in without a transition, so nothing reflows. */

/* Fixed, not random: a skeleton that changes shape between renders is itself
   motion nobody asked for. */
const WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3', 'w-[55%]', 'w-[45%]']

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'motion-loading block h-3 rounded-full bg-lift/[0.08]',
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
