import { PromptBlock } from './PromptBlock'
import { VideoBlock } from './VideoBlock'
import { parseBlocks } from '@/lib/note-text'
import { parseInline } from '@/lib/note-format'

/* A line as it reads (24 Sep): **bold**, *italic*, `code`, and links you can
   press. Opened in a new tab — a note is where you come back to. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((run, i) => {
        switch (run.type) {
          case 'text':
            return run.text
          case 'bold':
            return (
              <strong key={i} className="font-semibold text-foreground">
                {run.text}
              </strong>
            )
          case 'italic':
            return <em key={i}>{run.text}</em>
          case 'code':
            return (
              <code
                key={i}
                className="rounded-[5px] bg-lift/[0.07] px-[5px] py-px font-mono text-[0.88em] text-ink-100"
              >
                {run.text}
              </code>
            )
          case 'link':
            return (
              <a
                key={i}
                href={run.href}
                target="_blank"
                rel="noreferrer"
                className="text-area-knowledge underline decoration-area-knowledge/40 underline-offset-[3px] transition-colors hover:decoration-area-knowledge"
              >
                {run.text}
              </a>
            )
        }
      })}
    </>
  )
}

const HEADING_SIZE = {
  1: 'mt-3 text-[20px] font-light',
  2: 'mt-2.5 text-[16.5px] font-normal',
  3: 'mt-2 text-[14.5px] font-medium tracking-[0.01em]',
} as const

const HEADING_RULE = { 1: 'h-5', 2: 'h-4', 3: 'h-3.5' } as const

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
          case 'fence':
            return <PromptBlock key={i} text={block.text} />
          case 'video':
            return <VideoBlock key={i} id={block.id} />
          case 'heading':
            return (
              <div
                key={i}
                role="heading"
                aria-level={block.level + 1}
                className={`mb-1.5 flex items-center gap-2.5 text-foreground first:mt-0 ${HEADING_SIZE[block.level]}`}
              >
                <span
                  className={`w-[3px] shrink-0 rounded-full bg-area-knowledge ${HEADING_RULE[block.level]}`}
                />
                <span className="min-w-0">
                  <Inline text={block.text} />
                </span>
              </div>
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
                <span className="min-w-0">
                  <Inline text={block.text} />
                </span>
              </div>
            )
          case 'paragraph':
            return (
              <p
                key={i}
                className="py-[2px] text-[14.5px] leading-[1.6] text-ink-200"
              >
                <Inline text={block.text} />
              </p>
            )
        }
      })}
    </div>
  )
}
