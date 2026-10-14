import { useState } from 'react'
import { Banknote } from 'lucide-react'

import { metalOf } from '@/lib/holdingLine'
import { isCoin, logoSrc } from '@/lib/logo'
import { payeeSite } from '@/lib/payeeSites'

/* Real marks (27 Sep: "in portfolio i want icons of broker"). An account's
   logo comes from its own site's icon, by the domain he gave it; a ticker's
   from the market's logo service. Either falls back to letters rather than
   a broken image. */

export function AccountLogo({
  name,
  domain,
  size = 32,
}: {
  name: string
  domain?: string | null
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size, borderRadius: size / 3.2 }
  /* Cash has no site to take a mark from: a banknote on the cash colour,
     not the letters "CA" (27 Sep: "looks weird"). */
  if (!domain && /^cash$|\bnotes\b|wallet/i.test(name.trim())) {
    return (
      <span
        aria-hidden
        style={box}
        className="grid shrink-0 place-items-center bg-money-cash text-background"
      >
        <Banknote style={{ width: size * 0.58, height: size * 0.58 }} />
      </span>
    )
  }
  if (!domain || failed) {
    return (
      <span
        aria-hidden
        style={box}
        className="grid shrink-0 place-items-center bg-(--area)/15 font-mono text-[12px] text-area"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
      alt=""
      aria-hidden
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ ...box, padding: size / 9 }}
      className="shrink-0 bg-mark-ground object-contain"
    />
  )
}

/** A payee's mark on a money row: its site's icon when the shop is one
    the app knows (src/lib/payeeSites.ts), else its two letters. */
export function PayeeLogo({
  name,
  size = 26,
}: {
  name: string
  size?: number
}) {
  const site = payeeSite(name)
  if (site !== null)
    return <AccountLogo name={name} domain={site} size={size} />
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: size / 3.2 }}
      className="grid shrink-0 place-items-center bg-lav-400/12 font-mono text-[9.5px] text-lav-300"
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </span>
  )
}

/* Some marks come as white drawn on nothing (Uber's does): on the white
   square they vanish (27 Sep: "icons sometimes are just white"). Once
   loaded, the picture is looked at: white on clear sits on the dark
   square instead, and one with nothing drawn falls back to letters. */
type Ink = 'dark' | 'light' | 'blank'

function inkOf(img: HTMLImageElement): Ink {
  try {
    const n = 24
    const c = document.createElement('canvas')
    c.width = n
    c.height = n
    const g = c.getContext('2d')
    if (!g) return 'dark'
    g.drawImage(img, 0, 0, n, n)
    const d = g.getImageData(0, 0, n, n).data
    let seen = 0
    let light = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue
      seen++
      if (Math.min(d[i], d[i + 1], d[i + 2]) > 225) light++
    }
    if (seen < n * n * 0.02) return 'blank'
    /* Opaque white ground with a mark on it is an ordinary logo. */
    if (seen > n * n * 0.9) return light === seen ? 'blank' : 'dark'
    return light / seen > 0.9 ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function TickerLogo({
  symbol,
  type,
  name,
  size = 32,
}: {
  symbol: string
  /** What it is (EQUITY, ETF, CRYPTOCURRENCY) and its name: a fund's mark
      is its issuer's, a coin's its own (src/lib/logo). */
  type?: string
  name?: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const [ink, setInk] = useState<Ink>('dark')
  const src = logoSrc({ symbol, type, name })
  const coin = isCoin({ symbol, type })
  /* A fund's mark is its issuer's site icon, which cannot be read for its
     colours (no CORS): asked for plainly, or it fails and shows letters
     (13 Oct: "why etfs dont have icons?"). */
  const site = src?.includes('/s2/favicons') ?? false
  const base = symbol.split(/[.-]/)[0]
  const box = {
    width: size,
    height: size,
    borderRadius: coin ? size / 2 : size / 3.6,
  }
  /* A metal is three bars on its own colour (14 Oct, his picture: the
     element's letters spilled out of a small circle). Not "GC=F", the
     future its price is read from (10 Oct). */
  const metal = metalOf(symbol)
  if (metal) {
    return (
      <span
        aria-hidden
        style={{
          ...box,
          borderRadius: size / 2,
          background: `var(--metal-${metal.toLowerCase()})`,
        }}
        className="grid shrink-0 place-items-center"
      >
        <Bars size={size * 0.62} />
      </span>
    )
  }
  if (src === null || failed || ink === 'blank') {
    return (
      <span
        aria-hidden
        style={box}
        className="grid shrink-0 place-items-center bg-mark-ground font-mono text-[10px] font-medium text-mark-ink"
      >
        {base.slice(0, 4)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      crossOrigin={coin || site ? undefined : 'anonymous'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={(e) =>
        coin || site ? undefined : setInk(inkOf(e.currentTarget))
      }
      style={coin ? box : { ...box, padding: size / 10 }}
      className={`shrink-0 object-contain ${coin ? '' : ink === 'light' ? 'bg-mark-ink' : 'bg-mark-ground'}`}
    />
  )
}

/** A metal's three bars — its mark, and the GOLD badge's icon. */
export function Bars({
  size,
  fill = 'white',
}: {
  size: number
  fill?: string
}) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill={fill}>
      <path d="M9.2 4.5h5.6l2.4 5.6H6.8z" />
      <path d="M3.6 12.7h6.1l2.4 5.6H1.2z" />
      <path d="M14.3 12.7h6.1l2.4 5.6H11.9z" />
    </svg>
  )
}
