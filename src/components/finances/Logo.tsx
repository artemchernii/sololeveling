import { useState } from 'react'

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

export function TickerLogo({
  symbol,
  size = 32,
}: {
  symbol: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const base = symbol.split('.')[0]
  const box = { width: size, height: size, borderRadius: size / 3.6 }
  if (failed) {
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
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ ...box, padding: size / 10 }}
      className="shrink-0 bg-mark-ground object-contain"
    />
  )
}
