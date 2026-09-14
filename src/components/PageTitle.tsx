import type { ReactNode } from 'react'

/* A page's title and the one line under it that says what the page is for.
   One component, because five pages wrote it by hand and every one of them
   set the caps line straight under the title's tight 1.12 line-height, so the
   two touched. The gap between them lives here now, once. */
export function PageTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[22px] text-foreground">{title}</h1>
      <p className="label-caps">{subtitle}</p>
    </div>
  )
}
