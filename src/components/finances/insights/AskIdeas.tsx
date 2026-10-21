import { IdeaCard, useQuotes } from './Ideas'
import type { Idea } from '@/lib/marketRead'

/* Ideas named in an ASK answer (21 Oct, mockup
   design/treasury-mockup/ask-ideas.html, his "go on ideas in ASK"). The
   same cards as NEXT, three to a row, every number fetched by the app on
   the same quotes call; a ticker the market does not answer is dropped.
   Never saved — they go with the thread. */

export function AskIdeas({ ideas }: { ideas: Array<Idea> }) {
  const quotes = useQuotes(ideas.map((i) => i.ticker))
  if (quotes === null)
    return (
      <div data-testid="ask-ideas" className="ask-ideas">
        {ideas.map((idea, i) => (
          <div
            key={idea.ticker}
            className="ask-idea-wait"
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="tk">{idea.ticker}</span>
            <span className="co">{idea.name}</span>
            <span className="ask-shim w-3/5" />
            <span className="ask-shim h-[30px]" />
          </div>
        ))}
      </div>
    )
  const found = ideas.flatMap((idea) => {
    const q = quotes.find((x) => x.symbol === idea.ticker)
    return q ? [{ idea, q }] : []
  })
  if (found.length === 0) return null
  return (
    <div data-testid="ask-ideas" className="ask-ideas">
      {found.map(({ idea, q }, i) => (
        <IdeaCard key={idea.ticker} idea={idea} q={q} i={i} in="ask" />
      ))}
    </div>
  )
}
