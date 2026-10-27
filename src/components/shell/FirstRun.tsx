import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { LANGUAGES } from '@/lib/languages/catalog'
import type { LanguageCode } from '@/lib/languages/catalog'

/* R8 · S2 (26 Oct, docs/specs/2026-10-26-first-run.md, mockup
   design/firstrun-mockup/index.html): a friend's first open is one System
   window — the language they are learning, or NONE, and the zone read from
   their device. Name and avatar are Clerk's. Artem never sees it: his logs
   say he is not new (convex/profiles.ts `mine`). */

type Pick = LanguageCode | 'none'
type Phase = 'pick' | 'saving' | 'saved' | 'closing' | 'done'

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon'
  } catch {
    return 'Europe/Lisbon'
  }
}

export function FirstRun() {
  const me = useQuery(api.profiles.mine, {})
  const [phase, setPhase] = useState<Phase>('pick')
  if (me === undefined || phase === 'done') return null
  if (!me.needsFirstRun && phase === 'pick') return null
  return <Window phase={phase} setPhase={setPhase} />
}

function Window({
  phase,
  setPhase,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
}) {
  const finish = useMutation(api.profiles.finishFirstRun)
  const [pick, setPick] = useState<Pick | null>(null)
  const [zone] = useState(deviceZone)
  const [failed, setFailed] = useState(false)

  async function go() {
    if (pick === null || phase !== 'pick') return
    setFailed(false)
    setPhase('saving')
    try {
      await finish({ lang: pick === 'none' ? null : pick, timezone: zone })
      setPhase('saved')
      setTimeout(() => setPhase('closing'), 700)
      setTimeout(() => setPhase('done'), 1000)
    } catch {
      setFailed(true)
      setPhase('pick')
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-sink/60 p-4 backdrop-blur-sm transition-opacity duration-300 ${phase === 'closing' ? 'opacity-0' : ''}`}
    >
      <section
        role="dialog"
        aria-label="First run"
        className="motion-arrive relative w-full max-w-[460px] overflow-hidden px-[18px] pt-[22px] pb-[18px] system-frame sm:px-[26px] sm:pt-[26px] sm:pb-[22px]"
      >
        <h2 className="system-title">[ First run ]</h2>

        <div className="mt-[22px] font-mono text-[10.5px] tracking-[0.2em] text-ink-400 uppercase">
          Language
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={pick === l.code}
              onClick={() => setPick(l.code)}
              className={`group relative h-[84px] overflow-hidden rounded-[12px] border text-left transition-[transform,border-color,box-shadow] hover:-translate-y-px sm:h-[92px] ${pick === l.code ? 'border-lav-400 shadow-[0_0_0_1px_var(--color-lav-400)_inset,0_0_22px_-6px_var(--system-shine)]' : 'border-lift/10'}`}
            >
              <img
                src={l.photo}
                alt=""
                style={{ objectPosition: l.focus }}
                className={`absolute inset-0 size-full object-cover transition-[filter] ${pick === l.code ? 'brightness-75' : 'brightness-[.55] saturate-[.85] group-hover:brightness-70'}`}
              />
              <span className="absolute inset-0 bg-gradient-to-t from-sink/85 to-transparent" />
              <Tick on={pick === l.code} />
              <span className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
                <span>
                  <span className="block text-[15px] font-medium text-ink-100">
                    {l.name}
                  </span>
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-300 uppercase">
                    {l.native}
                  </span>
                </span>
                <span className="text-[18px]">{l.flag}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={pick === 'none'}
            onClick={() => setPick('none')}
            className={`relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border bg-sink/20 transition-[border-color,box-shadow] sm:h-[92px] ${pick === 'none' ? 'border-lav-400 shadow-[0_0_0_1px_var(--color-lav-400)_inset]' : 'border-lift/10'}`}
          >
            <Tick on={pick === 'none'} />
            <span className="font-mono text-[11px] tracking-[0.2em] text-ink-300">
              NONE
            </span>
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400">
              NO LANGUAGES ROOM
            </span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.2em] text-ink-400">
            TIMEZONE
          </span>
          <span
            data-testid="first-run-zone"
            className="font-mono text-[11px] tracking-[0.06em] text-ink-100"
          >
            {zone}
          </span>
          <span className="rounded-full border border-ink-400 px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.14em] text-ink-400">
            FROM THIS DEVICE
          </span>
        </div>

        <div className="mt-[22px] flex items-center justify-between gap-2.5">
          <span
            role="status"
            className="font-mono text-[10.5px] tracking-[0.14em] text-state-danger"
          >
            {failed ? 'NOT SAVED' : ''}
          </span>
          <button
            type="button"
            onClick={go}
            disabled={pick === null || phase !== 'pick'}
            className={`inline-flex h-[42px] min-w-[132px] items-center justify-center gap-2 rounded-full px-5 font-mono text-[11.5px] font-medium tracking-[0.22em] text-lav-900 shadow-[0_0_24px_-6px_var(--system-shine)] transition-[background,transform,opacity] hover:-translate-y-px disabled:cursor-default disabled:hover:translate-y-0 ${phase === 'saved' || phase === 'closing' ? 'bg-state-good' : phase === 'saving' ? 'bg-lav-500/60' : 'bg-lav-500 disabled:opacity-40'}`}
          >
            {phase === 'saving' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                SAVING
              </>
            ) : phase === 'saved' || phase === 'closing' ? (
              <>
                <Check className="motion-pop size-3.5" strokeWidth={3} />
                SAVED
              </>
            ) : (
              'GO'
            )}
          </button>
        </div>
      </section>
    </div>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-[9px] right-[9px] grid size-5 place-items-center rounded-full bg-lav-400 text-lav-900 transition-transform duration-200 ${on ? 'scale-100' : 'scale-0'}`}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  )
}
