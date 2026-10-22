import { Star } from './Ask'
import { askAbout } from './askPrefill'

/* ✦ ASK on cards: the small ✦ on a read line, a box, an allocation line
   or an idea card. A press opens ASK with `q` in the box — never sent. */

export function AskOn({ q, wide = false }: { q: string; wide?: boolean }) {
  return (
    <button
      type="button"
      data-testid="ask-on"
      className={`ask-on ${wide ? 'wide' : ''}`}
      title={q}
      aria-label={q}
      onClick={(e) => {
        e.stopPropagation()
        const el = e.currentTarget
        el.classList.remove('press')
        void el.offsetWidth
        el.classList.add('press')
        askAbout(q)
      }}
    >
      <Star />
      {wide ? 'ASK' : null}
    </button>
  )
}
