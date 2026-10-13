/* A token's colour as the chart library takes it. It cannot parse
   oklch() (1 Oct: the gold token, `oklch(0.83 0.1 85)`, threw and drew
   nothing), so the browser converts it by painting one pixel. */

export const token = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

/** `rgb()`, or `rgba()` when an `alpha` is given. */
export const css = (name: string, fallback: string, alpha?: number) => {
  const v = token(name, '')
  const ctx = v ? document.createElement('canvas').getContext('2d') : null
  if (!ctx) return fallback
  ctx.fillStyle = v
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return alpha === undefined
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}
