import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { LanguagePanel } from '@/components/languages/LanguagePanel'
import { areaVars } from '@/lib/areas'
import { LANGUAGES, languageByCode } from '@/lib/languages/catalog'
import type { Language } from '@/lib/languages/catalog'

/* Languages (R6b-b; rebuilt 25 Sep). "Languages is not Portuguese only. And
   I see zero mentions that this is Portuguese, not even a flag anywhere."

   A flag tab per language area, always shown — even one — and + Add
   language right here, one tap from the catalogue, no trip to Settings.
   Under the tabs, the language itself: its flag, its own name, its variant.

   `api.areas.list({})` excludes retired areas, which matters: `areas.retire`
   leaves `track` set so restoring brings the tab back, and a list that
   included retired rows would bring it back on its own. */
export function LanguageTabs() {
  const areas = useQuery(api.areas.list, {})
  const [selected, setSelected] = useState<string | undefined>(undefined)

  if (areas === undefined) return null

  const languages = areas.filter((a) => a.track === 'language')
  const active = languages.find((a) => a.slug === selected) ?? languages.at(0)

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="relative z-30 flex flex-wrap items-center gap-2">
        {languages.map((a) => {
          const on = a.slug === active?.slug
          const lang = languageByCode(a.lang)
          return (
            <button
              key={a.slug}
              type="button"
              onClick={() => setSelected(a.slug)}
              aria-pressed={on}
              style={areaVars(a.slug)}
              className={`motion-press inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2 text-[13px] ring-1 transition-colors ${
                on
                  ? 'bg-(--area)/20 text-foreground ring-(--area)/50 shadow-[0_0_18px_-6px_var(--area)]'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-(--area)/35'
              }`}
            >
              <span className="text-[18px] leading-none">
                {lang?.flag ?? '🏳️'}
              </span>
              {lang?.native ?? a.label}
            </button>
          )
        })}
        <AddLanguage
          taken={languages.map((a) => a.lang)}
          onAdded={setSelected}
        />
      </div>

      {active === undefined ? (
        <p className="text-[13.5px] text-ink-400">
          No language yet. Press{' '}
          <span className="font-mono text-ink-200">+ Add language</span> and
          pick the one you are learning.
        </p>
      ) : (
        <>
          {languageByCode(active.lang) === undefined ? (
            <WhichLanguage area={active} />
          ) : null}
          {/* Keyed on the slug so switching tabs mounts a fresh panel with
              only the new language's queries open. */}
          <LanguagePanel
            key={active.slug}
            slug={active.slug}
            label={active.label}
            lang={active.lang}
          />
        </>
      )}
    </div>
  )
}

/* Until an area knows which language it is, it asks — one tap, the likely
   one first. Once it knows, the panel's own header says it big. */
function WhichLanguage({ area }: { area: Doc<'areas'> }) {
  const setLang = useMutation(api.areas.setLang)
  const guess = LANGUAGES.filter((l) =>
    area.label.toLowerCase().includes(l.name.toLowerCase()),
  )
  const offer = guess.length > 0 ? guess : LANGUAGES
  return (
    <section
      style={areaVars(area.slug)}
      className="glass motion-arrive flex flex-col gap-3 rounded-[22px] p-5 sm:p-6"
    >
      <h2 className="text-[18px] font-light text-foreground">
        Which language is <span className="text-(--area)">{area.label}</span>?
      </h2>
      <div className="flex flex-wrap gap-2">
        {offer.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => void setLang({ slug: area.slug, lang: l.code })}
            className="motion-press inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] text-ink-200 ring-1 ring-lift/15 transition-colors hover:bg-(--area)/12 hover:text-foreground hover:ring-(--area)/45"
          >
            <span className="text-[20px] leading-none">{l.flag}</span>
            {l.native}
          </button>
        ))}
      </div>
    </section>
  )
}

function AddLanguage({
  taken,
  onAdded,
}: {
  taken: Array<string | undefined>
  onAdded: (slug: string) => void
}) {
  const add = useMutation(api.areas.addLanguage)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function away(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const offer = LANGUAGES.filter((l) => !taken.includes(l.code))

  function pick(l: Language) {
    setOpen(false)
    void add({ lang: l.code }).then(onAdded)
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="motion-press inline-flex items-center gap-1.5 rounded-full border border-dashed border-lift/20 px-3 py-1.5 text-[13px] text-ink-400 transition-colors hover:border-lift/40 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add language
      </button>
      {/* glass-modal, not glass-menu: the menu drops over the hero's 40px
          name, and glass-menu's 55% ground let "Português" read straight
          through it (25 Sep) — the same fix EventDialog got. */}
      {open ? (
        <div className="glass-modal motion-arrive absolute top-full left-0 z-40 mt-2 grid w-64 grid-cols-1 gap-0.5 rounded-[16px] p-1.5">
          {offer.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => pick(l)}
              className="motion-press flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] text-ink-200 transition-colors hover:bg-lift/10 hover:text-foreground"
            >
              <span className="text-[20px] leading-none">{l.flag}</span>
              <span className="flex-1">{l.native}</span>
              <span className="font-mono text-[10px] text-ink-500">
                {l.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
