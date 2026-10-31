import { Globe } from 'lucide-react'

import { Bars } from '@/components/finances/Logo'
import type { FlagCode } from '@/lib/insightsMarket'

/* A market's flag and the drawn marks beside it (31 Oct, his "proper
   european flag (not emoji)", then "icons are still bad … quality bad and
   overall bad icons old"): round SVG flags from circle-flags, two
   overlapped for a pair, a small tag for what of the country it is (TECH,
   10Y). Gold and silver are the metal's bars on its colour, as Portfolio
   draws them; MSCI World a globe. */

const FLAGS = 'https://cdn.jsdelivr.net/npm/circle-flags@2.8.3/flags'
const fileOf = (c: FlagCode) =>
  c === 'EU' ? 'european_union' : c.toLowerCase()

export function Flag({
  code,
  tag,
  size = 30,
}: {
  code: FlagCode | [FlagCode, FlagCode]
  tag?: string
  size?: number
}) {
  const [a, b] = Array.isArray(code) ? code : [code, null]
  return (
    <span
      className={`ins-flag ${b ? 'two' : ''}`}
      style={{ width: size, height: size }}
      data-flag={Array.isArray(code) ? code.join('-') : code}
    >
      <img src={`${FLAGS}/${fileOf(a)}.svg`} alt="" aria-hidden />
      {b ? <img src={`${FLAGS}/${fileOf(b)}.svg`} alt="" aria-hidden /> : null}
      {tag ? <span className="tag">{tag}</span> : null}
    </span>
  )
}

export function DrawnMark({
  icon,
  size = 30,
}: {
  icon: 'globe' | 'gold' | 'silver'
  size?: number
}) {
  if (icon === 'globe')
    return (
      <span
        className="ins-flag icon globe"
        style={{ width: size, height: size }}
      >
        <Globe size={Math.round(size * 0.58)} aria-hidden />
      </span>
    )
  return (
    <span
      className="ins-flag icon"
      style={{
        width: size,
        height: size,
        background: `var(--metal-${icon === 'gold' ? 'xau' : 'xag'})`,
      }}
    >
      <Bars size={Math.round(size * 0.62)} />
    </span>
  )
}
