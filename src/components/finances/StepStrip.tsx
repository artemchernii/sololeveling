import { Check } from 'lucide-react'

import { STEPS } from '@/components/finances/AddDrop'

/* The four steps of the drop area, in the window's header once a file is
   in (11 Oct, design/treasury-mockup/update-account.html): the ones behind
   are ticked green, the one it is on is lit. On a phone they take their
   own line and only the lit one keeps its words. */
export function StepStrip({ step }: { step: number }) {
  return (
    <ol
      data-testid="steps"
      className="motion-land -ml-1.5 flex flex-wrap gap-1 sm:ml-0 sm:justify-end"
    >
      {STEPS.map(([Icon, label], i) => {
        const now = i === step
        const Mark = i < step ? Check : Icon
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase ${
              now
                ? 'bg-lav-400/16 text-foreground ring-1 ring-lav-400/40 ring-inset'
                : i < step
                  ? 'text-state-good'
                  : 'text-ink-600'
            }`}
          >
            <Mark className="size-3" />
            <span className={now ? '' : 'hidden sm:inline'}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
