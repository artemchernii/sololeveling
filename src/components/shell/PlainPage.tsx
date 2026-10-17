/* A page of plain words outside the app (11 Oct): what a bank's consent
   screen links to when an account is connected — who runs this, what is
   kept, where. No sign-in, no data. */
export function PlainPage({
  title,
  parts,
}: {
  title: string
  parts: ReadonlyArray<{ heading: string; lines: ReadonlyArray<string> }>
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-8 px-6 py-14">
      <div className="flex items-center gap-[9px]">
        <img
          src="/logo.svg"
          alt=""
          aria-hidden
          className="size-6 rounded-[6px]"
        />
        <span className="text-[11px] font-medium tracking-[0.2em]">
          SOLO LEVELING
        </span>
      </div>
      <h1 className="text-[30px] font-light text-foreground">{title}</h1>
      {parts.map((p) => (
        <section key={p.heading} className="flex flex-col gap-2.5">
          <h2 className="font-mono text-[10.5px] tracking-[0.18em] text-lav-400 uppercase">
            {p.heading}
          </h2>
          {p.lines.map((line) => (
            <p
              key={line}
              className="text-[14.5px] leading-relaxed text-ink-200"
            >
              {line}
            </p>
          ))}
        </section>
      ))}
      <p className="font-mono text-[10.5px] text-ink-500">
        Last changed 11 October 2026
      </p>
    </main>
  )
}
