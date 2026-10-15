import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Bell as BellIcon,
  CalendarClock,
  FileCheck,
  FileX,
  Laptop,
  Smartphone,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderSVG } from 'uqr'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { deviceOf } from '@/lib/push'

/* N1 (15 Oct). The bell, as design/notifications-mockup draws it: today's
   notifications in a System window — NOW and EARLIER TODAY, an unread dot
   that pings, a row that opens its screen — and the devices that get them.
   No iPhone yet: a QR of /phone instead, for the iPhone's camera. */

function midnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const KIND: Record<
  Doc<'notifications'>['kind'],
  { icon: React.ReactNode; area: string }
> = {
  reminder: {
    icon: <CalendarClock className="size-[18px]" />,
    area: 'var(--color-area-body)',
  },
  file_read: {
    icon: <FileCheck className="size-[18px]" />,
    area: 'var(--color-area-money)',
  },
  file_failed: {
    icon: <FileX className="size-[18px]" />,
    area: 'var(--color-state-danger)',
  },
  test: {
    icon: <BellIcon className="size-[18px]" />,
    area: 'var(--color-lav-400)',
  },
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

function Row({
  n,
  i,
  onOpen,
}: {
  n: Doc<'notifications'>
  i: number
  onOpen: (n: Doc<'notifications'>) => void
}) {
  const k = KIND[n.kind]
  return (
    <button
      type="button"
      data-testid="bell-row"
      onClick={() => onOpen(n)}
      className="glass motion-arrive group flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5"
      style={
        { '--a': k.area, animationDelay: `${i * 70}ms` } as React.CSSProperties
      }
    >
      <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] border border-[color-mix(in_oklch,var(--a)_35%,transparent)] bg-[color-mix(in_oklch,var(--a)_18%,transparent)] text-[var(--a)]">
        {k.icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px]">{n.title}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.08em] text-ink-400 uppercase">
          {n.body}
        </span>
      </span>
      <span className="ml-auto flex flex-col items-end gap-1.5 self-start font-mono text-[10.5px] text-ink-500">
        {time(n.sentAt)}
        {n.readAt === undefined ? (
          <i
            data-testid="bell-unread"
            className="nt-ping block size-[7px] rounded-full bg-lav-400 text-lav-400"
          />
        ) : (
          <span className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        )}
      </span>
    </button>
  )
}

function Devices({
  iphone,
  mac,
  onSetup,
}: {
  iphone: boolean
  mac: boolean
  onSetup: () => void
}) {
  const here =
    typeof navigator === 'undefined' ? 'other' : deviceOf(navigator.userAgent)
  const qr = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : renderSVG(`${window.location.origin}/phone`, { border: 1 }),
    [],
  )
  const dev = (label: string, icon: React.ReactNode, on: boolean) => (
    <button
      type="button"
      onClick={onSetup}
      className="glass flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-[12.5px] transition-transform hover:-translate-y-0.5"
    >
      {icon}
      {label}
      <span
        className={[
          'ml-auto inline-flex items-center gap-1.5 rounded-full border border-current px-2 py-[2px] font-mono text-[9px] tracking-[0.12em]',
          on
            ? 'nt-live bg-state-good/10 text-state-good'
            : 'bg-lift/5 text-ink-400',
        ].join(' ')}
      >
        {on ? 'ON' : 'NOT ON'}
      </span>
    </button>
  )
  /* On the iPhone itself a QR is no use: the row opens the setup. */
  if (!iphone && here !== 'iphone') {
    return (
      <div
        data-testid="bell-qr"
        className="glass flex items-center gap-4 rounded-[14px] p-3.5"
      >
        <div className="relative shrink-0 overflow-hidden rounded-[12px] bg-white p-2 shadow-[0_0_30px_-8px_var(--system-shine)]">
          <div
            className="size-[118px] [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <span className="nt-qr-scan" />
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="nt-live inline-flex items-center gap-1.5 rounded-full border border-current bg-state-warn/10 px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-state-warn">
            NO IPHONE
          </span>
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-ink-200">
            IPHONE CAMERA → CODE
          </span>
          {dev('Mac', <Laptop className="size-4" />, mac)}
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {dev('iPhone', <Smartphone className="size-4" />, iphone)}
      {dev('Mac', <Laptop className="size-4" />, mac)}
    </div>
  )
}

export function Bell() {
  const [open, setOpen] = useState(false)
  const [ring, setRing] = useState(false)
  const since = useMemo(midnight, [])
  const today = useQuery(api.notifications.today, { since })
  const devices = useQuery(api.push.devices, {})
  const markRead = useMutation(api.notifications.markRead)
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)

  const rows = today ?? []
  const unread = rows.filter((n) => n.readAt === undefined).length

  /* A new one arriving rings the bell. */
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (today === undefined) return
    const newest = today[0]?.sentAt ?? 0
    if (seen.current !== null && newest > seen.current) {
      setRing(true)
      const t = setTimeout(() => setRing(false), 1100)
      seen.current = newest
      return () => clearTimeout(t)
    }
    seen.current = newest
  }, [today])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const openRow = (n: Doc<'notifications'>) => {
    setOpen(false)
    if (n.readAt === undefined) void markRead({ id: n._id })
    void navigate({ to: n.url })
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className={[
          'relative grid size-9 place-items-center rounded-[10px] border border-lift/10 transition-colors',
          open
            ? 'bg-lav-400/15 text-lav-300 shadow-[0_0_18px_-6px_var(--system-shine)]'
            : 'bg-sink/20 text-ink-400 hover:text-lav-300',
          ring ? 'nt-ring' : '',
        ].join(' ')}
      >
        <BellIcon className="size-4" />
        {unread > 0 ? (
          <span
            data-testid="bell-count"
            className="motion-pop absolute -top-1 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lav-400 px-1 font-mono text-[10px] font-semibold text-lav-900 shadow-[0_0_10px_var(--system-shine)]"
          >
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          data-testid="bell-panel"
          className="system-frame system-open absolute top-[46px] right-0 z-40 flex w-[min(420px,calc(100vw-24px))] flex-col gap-2.5 rounded-[18px] p-3.5"
        >
          <div className="flex items-center gap-2">
            <span className="system-title">[ TODAY ]</span>
            {unread > 0 ? (
              <span className="nt-live ml-auto inline-flex items-center gap-1.5 rounded-full border border-current bg-lav-400/10 px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-lav-400">
                {unread} NEW
              </span>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-7">
              <span className="grid size-16 place-items-center rounded-[20px] border border-lift/10 bg-lift/[0.04] text-ink-500">
                <BellIcon className="size-7" />
              </span>
              <span className="rounded-full border border-current px-2 py-[3px] font-mono text-[9.5px] tracking-[0.12em] text-ink-400">
                NOTHING TODAY
              </span>
            </div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              <span className="mx-0.5 mt-1 font-mono text-[9px] tracking-[0.2em] text-ink-500">
                NOW
              </span>
              <Row n={rows[0]} i={0} onOpen={openRow} />
              {rows.length > 1 ? (
                <span className="mx-0.5 mt-1 font-mono text-[9px] tracking-[0.2em] text-ink-500">
                  EARLIER TODAY
                </span>
              ) : null}
              {rows.slice(1).map((n, i) => (
                <Row key={n._id} n={n} i={i + 1} onOpen={openRow} />
              ))}
            </div>
          )}
          {devices ? (
            <Devices
              {...devices}
              onSetup={() => {
                setOpen(false)
                void navigate({ to: '/phone' })
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
