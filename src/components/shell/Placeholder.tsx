/* Phase 0 ships destinations, not screens. This says which phase fills a route
   in, so an empty page reads as "not yet" rather than "broken". Delete each
   usage as its phase lands. */
export function Placeholder({
  title,
  phase,
}: {
  title: string
  phase: string
}) {
  return (
    <div className="glass flex min-h-[220px] flex-col justify-end rounded-[22px] p-6">
      <div className="label-caps">{phase}</div>
      <h1 className="mt-1 text-[28px] font-light text-foreground">{title}</h1>
    </div>
  )
}
