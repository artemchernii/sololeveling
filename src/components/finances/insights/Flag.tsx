import {
  AR,
  BR,
  CH,
  CL,
  DE,
  DK,
  ES,
  EU,
  FR,
  GB,
  HK,
  IN,
  IT,
  JP,
  KR,
  MX,
  NL,
  PE,
  SE,
  TW,
  US,
} from 'country-flag-icons/react/3x2'
import { Globe } from 'lucide-react'

import type { FlagCode } from '@/lib/insightsMarket'

/* A market's flag and the drawn icons beside it (31 Oct, his "proper
   european flag (not emoji)"): SVG flags from country-flag-icons, one
   tile, two overlapped for a pair, a small tag for what of the country it
   is (TECH, 10Y). Gold and silver are bars, MSCI World the globe. */

const FLAGS: Record<FlagCode, typeof US> = {
  US,
  EU,
  JP,
  HK,
  BR,
  MX,
  AR,
  DK,
  FR,
  DE,
  CH,
  GB,
  NL,
  ES,
  IT,
  SE,
  TW,
  KR,
  IN,
  CL,
  PE,
}

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
  const A = FLAGS[a]
  const B = b ? FLAGS[b] : null
  return (
    <span
      className={`ins-flag ${B ? 'two' : ''}`}
      style={{ width: size, height: size }}
      data-flag={Array.isArray(code) ? code.join('-') : code}
    >
      <A title="" aria-hidden preserveAspectRatio="xMidYMid slice" />
      {B ? (
        <B title="" aria-hidden preserveAspectRatio="xMidYMid slice" />
      ) : null}
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
      <span className="ins-flag icon" style={{ width: size, height: size }}>
        <Globe size={Math.round(size * 0.55)} aria-hidden />
      </span>
    )
  const [fill, top, edge] =
    icon === 'gold'
      ? ['#e6b437', '#f2cd5c', '#b8871a']
      : ['#cfd3da', '#e7eaef', '#8a909b']
  return (
    <span className="ins-flag icon" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        aria-hidden
      >
        <path
          d="M3 19 6.5 10h11L21 19z"
          fill={fill}
          stroke={edge}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 10 8.7 6h6.6l1.2 4"
          fill={top}
          stroke={edge}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
