/* N4 (22 Oct): the push an Ask answer rings with when it landed off
   screen — the period and the model's headline, or what failed and what
   it cost, with the question. Shown as the mockup
   design/notifications-mockup/n4.html draws it. */

export type ReplyLike = {
  question: string
  range: string
  answer?: { headline: string }
  error?: string
  cost?: number
}

const MAX_BODY = 160

export function replyNote(r: ReplyLike): { title: string; body: string } {
  if (r.answer !== undefined)
    return {
      title: `✦ Ask · ${r.range}`,
      body: clip(r.answer.headline || r.question),
    }
  const paid =
    (r.cost ?? 0) > 0 ? `$${r.cost!.toFixed(2)}` : '$0.00 · NOTHING PAID'
  return {
    title: `✕ Ask · ${r.error ?? 'NOT REACHED'}`,
    body: clip(`${paid} · ${r.question}`),
  }
}

const clip = (s: string) =>
  s.length > MAX_BODY ? `${s.slice(0, MAX_BODY - 1).trimEnd()}…` : s
