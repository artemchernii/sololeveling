import { Share, SquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Logo } from './Logo'

/* N1 (15 Oct). The three taps that put the app on the home screen, drawn
   as iOS draws them and playing by themselves. The colours here are
   Apple's (Safari's blue, its light sheet), not the app's: it is a
   picture of the phone's own screens, so it has to look like them. */

const STEPS = ['1 · SHARE', '2 · ADD', '3 · OPEN'] as const
const APPS = ['Phone', 'Safari', 'Maps', 'Revolut', 'Notes', 'Photos', 'Camera']

function SafariBar() {
  return (
    <div className="relative h-full overflow-hidden rounded-[16px] bg-[#10101a]">
      <div className="flex flex-col gap-2 p-4">
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-lav-300">
          SOLO LEVELING
        </span>
        <i className="block h-2.5 w-[70%] rounded bg-[#fff]/10" />
        <i className="block h-2.5 rounded bg-[#fff]/10" />
        <i className="block h-14 w-[60%] rounded-xl bg-[#fff]/10" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[86px] bg-[#f5f5f7] px-3.5 pt-2 text-[#0a7aff]">
        <div className="grid h-9 place-items-center rounded-xl bg-[#e3e3e8] text-[13px] text-[#333]">
          {typeof window === 'undefined' ? '' : window.location.host}
        </div>
        <div className="flex justify-between px-2.5 pt-2">
          <span className="grid size-8 place-items-center">‹</span>
          <span className="grid size-8 place-items-center">›</span>
          <span className="nt-hit-ring grid size-8 place-items-center rounded-full bg-[#0a7aff]/15">
            <Share className="size-5" />
          </span>
          <span className="grid size-8 place-items-center">▢</span>
          <span className="grid size-8 place-items-center">⧉</span>
        </div>
      </div>
      <span className="nt-finger bottom-4 left-[calc(50%-20px)]" />
    </div>
  )
}

function ShareSheet() {
  const rows = ['Copy', 'Add to Reading List', 'Add Bookmark']
  return (
    <div className="relative h-full overflow-hidden rounded-[16px] bg-[#f2f2f7]">
      <div className="nt-sheet-up absolute inset-x-2 bottom-2 overflow-hidden rounded-[14px] bg-[#fff] text-[15px] text-[#000]">
        {rows.map((r) => (
          <div key={r} className="border-b border-[#e5e5ea] px-3.5 py-3">
            {r}
          </div>
        ))}
        <div className="flex items-center justify-between bg-[#0a7aff]/10 px-3.5 py-3 font-semibold text-[#0a7aff]">
          Add to Home Screen <SquarePlus className="size-5" />
        </div>
        <div className="border-t border-[#e5e5ea] px-3.5 py-3">
          Find on Page
        </div>
      </div>
      <span className="nt-finger bottom-[62px] left-[46%]" />
    </div>
  )
}

function HomeScreen() {
  return (
    <div className="relative grid h-full grid-cols-4 content-start gap-x-2.5 gap-y-4 overflow-hidden rounded-[16px] bg-[radial-gradient(260px_240px_at_80%_20%,#5b4bd1,transparent_70%),#0b0a1a] px-4 py-5">
      {APPS.map((a) => (
        <div
          key={a}
          className="flex flex-col items-center gap-1 text-[10.5px] text-[#fff]"
        >
          <i className="block size-12 rounded-xl bg-[#fff]/15" />
          {a}
        </div>
      ))}
      <div className="flex flex-col items-center gap-1 text-[10.5px] text-[#fff]">
        <span className="nt-land-icon block size-12 overflow-hidden rounded-xl">
          <Logo />
        </span>
        Leveling
      </div>
      <span className="nt-finger top-[78px] right-6" />
    </div>
  )
}

export function Taps() {
  const [step, setStep] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => setStep((s) => (s + 1) % 3), 2800)
    return () => clearInterval(t)
  }, [auto])

  return (
    <div className="flex flex-col gap-2.5">
      <div key={step} className="motion-arrive h-[280px]">
        {step === 0 ? (
          <SafariBar />
        ) : step === 1 ? (
          <ShareSheet />
        ) : (
          <HomeScreen />
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setAuto(false)
              setStep(i)
            }}
            className={[
              'rounded-xl py-2.5 font-mono text-[10px] tracking-[0.12em] transition-all',
              i === step
                ? 'bg-lav-400/15 text-foreground ring-1 ring-lav-400'
                : 'bg-lift/[0.04] text-ink-400 ring-1 ring-lift/10',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
