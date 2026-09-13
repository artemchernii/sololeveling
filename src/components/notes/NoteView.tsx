import { parseBlocks } from '@/lib/note-text'

/* A note body as it reads, not as it was typed: bullets instead of asterisks,
   headings set apart, and one quiet gap wherever there were blank lines.

   Tinted in the knowledge colour — a note is knowledge, and the bullets and
   heading rules are the colour, so the text itself stays easy to read. */
export function NoteView({ body }: { body: string }) {
  const blocks = parseBlocks(body)

  if (blocks.length === 0) {
    return (
      <p className="text-[14px] text-ink-600">
        Just a title. Often that is the whole thought.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'gap':
            return <div key={i} className="h-3" />
          case 'heading':
            return (
              <h3
                key={i}
                className="mt-2 mb-1.5 flex items-center gap-2.5 text-[14.5px] font-medium tracking-[0.01em] text-foreground first:mt-0"
              >
                <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-area-knowledge" />
                {block.text}
              </h3>
            )
          case 'item':
            return (
              <div
                key={i}
                style={{ paddingLeft: `${block.depth * 20}px` }}
                className="flex items-baseline gap-2.5 py-[3px] text-[14.5px] leading-[1.55] text-ink-200"
              >
                {block.ordered ? (
                  <span className="w-5 shrink-0 text-right font-mono text-[12px] text-area-knowledge">
                    {block.ordered}
                  </span>
                ) : (
                  <span className="size-[5px] shrink-0 translate-y-[-3px] rounded-full bg-area-knowledge/80" />
                )}
                <span className="min-w-0">{block.text}</span>
              </div>
            )
          case 'paragraph':
            return (
              <p
                key={i}
                className="py-[2px] text-[14.5px] leading-[1.6] text-ink-200"
              >
                {block.text}
              </p>
            )
        }
      })}
    </div>
  )
}
