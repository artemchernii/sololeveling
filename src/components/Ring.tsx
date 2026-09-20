/* A ring round a number (20 Sep).

   PLAN.md §1: a progress bar renders only where a target gives it a real
   denominator. So this component cannot be used without one — there is no
   "assumed" target, no typical week, nothing inferred from past behaviour.
   Where he has set no target the caller renders nothing, and the number
   stands on its own as it always did.

   Past the target it fills and stays full rather than running round twice:
   the ring says "there yet?", and the number beside it says how far past. */
export function Ring({
  value,
  target,
  tone,
  size = 44,
}: {
  value: number
  target: number
  tone: 'good' | 'warn' | 'accent'
  size?: number
}) {
  const stroke = 3
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const done = Math.min(1, target > 0 ? value / target : 0)

  const colour =
    tone === 'good'
      ? 'var(--state-good)'
      : tone === 'warn'
        ? 'var(--state-warn)'
        : 'var(--color-accent)'

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--lift)"
        strokeOpacity={0.12}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - done)}
        style={{
          transition:
            'stroke-dashoffset var(--motion-linger) var(--motion-ease)',
        }}
      />
    </svg>
  )
}
