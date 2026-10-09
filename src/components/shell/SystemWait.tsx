import { cn } from '@/lib/utils'

/* While the app itself is still arriving (9 Oct, loading.html: "waiting for
   clerk auth … felt weird, like nothing is going on"): the System window at
   once, a light running along its top edge, and one line per real step —
   ticked when it has happened, the current one still going. Never a blank
   page and never a step that has not really happened. */
export function SystemWait({
  title,
  lines,
}: {
  title: string
  lines: ReadonlyArray<{ text: string; done: boolean }>
}) {
  return (
    <div
      role="status"
      aria-label={title}
      className="flex flex-col items-center gap-7"
    >
      <span className="flex items-center gap-[9px]">
        <span
          className="system-pulse size-3.5 rounded-[4px] bg-lav-500"
          aria-hidden
        />
        <span className="text-[11px] font-medium tracking-[0.2em]">
          SOLO LEVELING
        </span>
      </span>
      <div className="system-frame relative flex w-[min(340px,calc(100vw-32px))] flex-col gap-4 overflow-hidden px-6 py-6">
        <span
          aria-hidden
          className="motion-wait-scan absolute inset-x-0 top-0 h-0.5"
        />
        <span className="system-title text-center">[ {title} ]</span>
        <ul className="flex flex-col gap-2 font-mono text-[11.5px] text-ink-400">
          {lines.map((l) => (
            <li
              key={l.text}
              className={cn(
                'motion-arrive flex items-center gap-2.5',
                l.done && 'text-ink-300',
              )}
            >
              <span className="w-3.5 text-lav-400">{l.done ? '✓' : '›'}</span>
              <span className={l.done ? undefined : 'motion-wait-dots'}>
                {l.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
