import { ExternalLink, Newspaper, RotateCw, TriangleAlert } from 'lucide-react'

import { Empty } from '@/components/finances/FundamentalsParts'
import type { News } from '@/components/finances/usePositionFeeds'

/* The NEWS tab (13 Oct: "we simply fetch it and show"; mockup
   fundamentals.html): Yahoo Finance's headlines for the ticker, fetched
   on open, never stored — publisher, headline, time, out to the story
   in a new tab. None, not loaded with TRY AGAIN, and loading rows. */

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})
const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const when = (t: number) =>
  new Date(t).toDateString() === new Date().toDateString()
    ? TIME.format(new Date(t))
    : DAY.format(new Date(t))
/* A publisher's chip: its initials. */
const initials = (p: string) =>
  p
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 3) || '·'

export function PositionNews({
  news,
  onRetry,
}: {
  news: News
  onRetry: () => void
}) {
  const head =
    'flex flex-wrap items-center gap-2 px-2 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.1em] text-ink-500 uppercase'
  if (news.state === 'loading')
    return (
      <div data-testid="news-loading" className="flex flex-col">
        <div className={head}>
          <Newspaper className="size-3" />
          yahoo finance
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 text-lav-300">
            <i className="size-[7px] animate-pulse rounded-full bg-lav-400" />
            loading
          </span>
        </div>
        {[0, 1, 2, 3, 4].map((k) => (
          <div
            key={k}
            className="my-1.5 h-[52px] animate-pulse rounded-[10px] bg-lift/[0.06]"
            style={{ animationDelay: `${k * 120}ms` }}
          />
        ))}
      </div>
    )
  if (news.state === 'failed')
    return (
      <Empty
        testid="news-failed"
        icon={<TriangleAlert className="size-5" />}
        tone="text-state-warn bg-state-warn/12 ring-state-warn/30"
      >
        <span className="text-state-warn">news not loaded · yahoo finance</span>
        <button
          type="button"
          onClick={onRetry}
          className="motion-press mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] tracking-[0.12em] ring-1 ring-lift/20 ring-inset hover:bg-lift/7"
        >
          <RotateCw className="size-3.5" />
          try again
        </button>
      </Empty>
    )
  if (news.items.length === 0)
    return (
      <Empty testid="news-none" icon={<Newspaper className="size-5" />}>
        no headlines · 30 days
        <span className="mt-1.5 block w-fit rounded-full bg-lift/5 px-2 py-[3px] text-[10.5px] tracking-[0.04em] text-ink-300">
          yahoo finance · {TIME.format(new Date(news.at))}
        </span>
      </Empty>
    )
  return (
    <div className="flex flex-col">
      <div data-testid="news-source" className={head}>
        <span className="inline-flex items-center gap-2">
          <Newspaper className="size-3 shrink-0" />
          <span>
            yahoo finance · {news.items.length} headlines ·{' '}
            {TIME.format(new Date(news.at))}
          </span>
        </span>
        <span className="flex-1" />
        <span>not stored</span>
      </div>
      <div className="mt-1 flex flex-col">
        {news.items.map((h, i) => (
          <a
            key={h.link}
            data-testid="headline"
            href={h.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ animationDelay: `${150 + i * 50}ms` }}
            className="motion-arrive group grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border-t border-lift/6 px-2 py-[11px] transition-colors first:border-t-0 hover:bg-lift/[0.04]"
          >
            <span
              className={`grid size-[30px] place-items-center rounded-[8px] bg-lav-400/14 font-mono font-medium text-lav-300 ring-1 ring-lav-400/30 ring-inset ${initials(h.publisher).length > 2 ? 'text-[8.5px]' : 'text-[10.5px]'}`}
            >
              {initials(h.publisher)}
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 text-[14px] leading-snug text-foreground">
                {h.title}
              </span>
              <span className="mt-0.5 block font-mono text-[10.5px] tracking-[0.06em] text-ink-500 uppercase">
                <b className="font-normal text-ink-300">{h.publisher}</b> ·{' '}
                {when(h.at)}
              </span>
            </span>
            <ExternalLink className="size-4 text-ink-500 transition-colors group-hover:text-lav-300" />
          </a>
        ))}
      </div>
    </div>
  )
}
