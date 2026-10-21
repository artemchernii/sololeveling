# COPY an ASK answer

Journey: you ask in the ASK drawer and get an answer worth keeping. It
vanishes on reload by design (never stored), so one press copies it — to
Notes, a chat, a doc. Rare, a few times a week; it must never slow ASK.

Screens/files: `src/components/finances/insights/Ask.tsx` (`Answer`'s
stamp row ends with the ⧉ COPY pill), `src/lib/askCopy.ts` (the text,
pure), `docs/journeys/finances.md`. Mockup: `design/treasury-mockup/
copy-answer.html` (the drawer from `insights-tabs.html`, answers from
`ask-copy.html`).

The text (markdown — **bold** stays bold in Notes/Notion, reads plain
anywhere else):

```
## <🌐 ><question>

<icon> <KIND>

<the answer's words, **bold** kept>

FACTS
- <icon> <label> <value>          (the facts it named, as the pills show)
- 💡 IN NEXT · A · B               (ideas answers only)

IDEAS · MODEL · NOT ADVICE         (only when it named ideas)
- <TICKER> · <name> — <why>
  ▲ <bull>
  ▼ <bear>
  ✕ Wrong if <wrong>

SOURCES
- <SITE> · <day> · <url>

✦ <MODEL> · <n SEARCHES · ><D MON HH:MM> · RESEARCH · NOT ADVICE
```

Empty sections are left out. Idea prices are not copied (fetched on
open, and a stale price in a note reads as current).

Scenarios:
- S1 answer → press ⧉ COPY → pill `✓ COPIED` at once (green, pop), the
  card glows once, back to `⧉ COPY` after ~1.8 s; the clipboard holds the
  text above. (e2e, `e2e/insights-ask.spec.ts`)
- S2 the clipboard refuses → pill `✕ NOT COPIED` red, shake, back. (unit
  on nothing; covered by the component's catch)
- S3 an answer with ideas and sources → every section present, in
  order. (unit, `src/lib/askCopy.test.ts`)
- S4 an answer with no facts, no sources → only question, kind, words,
  stamp line. (unit)
- Failed or asking turns have no COPY.

Data: nothing new — the text is what the card already shows. Nothing
saved; no Convex change; no deploy.

Out of scope: copying the whole thread; sharing; saving answers.
