import { useState } from 'react'
import { Banknote } from 'lucide-react'

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
  size = 32,
}: {
  symbol: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const [ink, setInk] = useState<Ink>('dark')
  const base = symbol.split('.')[0]
  const box = { width: size, height: size, borderRadius: size / 3.6 }
  if (failed || ink === 'blank') {
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
      src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(base)}.png`}
      alt=""
      aria-hidden
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={(e) => setInk(inkOf(e.currentTarget))}
      style={{ ...box, padding: size / 10 }}
      className={`shrink-0 object-contain ${ink === 'light' ? 'bg-mark-ink' : 'bg-mark-ground'}`}
    />
  )
}
