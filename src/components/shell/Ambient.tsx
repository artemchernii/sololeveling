/* The wireframe's ground is not flat. Three heavily blurred colour fields sit
   behind every screen (artboard 4a) — this is the violet the design reads as,
   and the reason the ground token is near-black rather than navy.

   Static, non-interactive, and behind everything, so the frosted panels above
   have something to frost. The only place in the app where colour carries
   atmosphere instead of meaning; the lavender accent stays reserved for live
   and focus things per PLAN.md §3. */
export function Ambient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute -top-[300px] -left-[180px] size-[660px] rounded-full bg-lav-700 opacity-45 blur-[130px]" />
      <div className="absolute top-[160px] -right-[160px] size-[560px] rounded-full bg-lav-900 opacity-70 blur-[120px]" />
      <div className="absolute -bottom-[260px] left-[36%] size-[520px] rounded-full bg-lav-800 opacity-45 blur-[130px]" />
    </div>
  )
}
