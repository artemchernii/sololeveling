/* A group a payee's own name points to (13 Oct: "it says Bar. Probably
   fun."). Plain words a place calls itself, in Portuguese and English —
   no reader is asked. It is only ever offered: the row stays with no
   group until the hint is pressed. Ids are src/lib/money.ts's. */

const WORDS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  [
    'eating out',
    [
      'cafe',
      'coffee',
      'cafetaria',
      'restaurante',
      'restaurant',
      'rest',
      'pizzaria',
      'pizza',
      'pastelaria',
      'padaria',
      'hamburgueria',
      'burger',
      'sushi',
      'tasca',
      'churrasqueira',
      'gelataria',
      'kebab',
      'grill',
      'cervejaria',
      'marisqueira',
      'bistro',
      'ramen',
      'food',
    ],
  ],
  [
    'fun',
    [
      'bar',
      'pub',
      'club',
      'cinema',
      'cinemas',
      'teatro',
      'museu',
      'museum',
      'bowling',
      'discoteca',
      'karaoke',
      'casino',
    ],
  ],
  [
    'groceries',
    [
      'supermercado',
      'minimercado',
      'mercado',
      'mercearia',
      'talho',
      'frutaria',
      'peixaria',
      'supermarket',
      'grocery',
    ],
  ],
  [
    'health',
    [
      'farmacia',
      'pharmacy',
      'clinica',
      'dentista',
      'hospital',
      'optica',
      'fisioterapia',
    ],
  ],
  [
    'car',
    [
      'estacionamento',
      'parque',
      'parking',
      'portagem',
      'combustivel',
      'gasolina',
      'oficina',
      'lavagem',
    ],
  ],
  ['transport', ['taxi', 'metro', 'comboios', 'autocarro', 'bus']],
  ['travel', ['hotel', 'hostel', 'pousada', 'airlines', 'airways']],
  ['clothes', ['sapataria', 'boutique', 'alfaiate']],
  ['learning', ['escola', 'livraria', 'universidade', 'school', 'academy']],
]

const BY_WORD = new Map(
  WORDS.flatMap(([group, words]) => words.map((w) => [w, group] as const)),
)

/** The group the first telling word of a name points to, or null. */
export function groupHint(name: string): string | null {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
  /* Money sent to a person says nothing about a place. */
  if (['transfer', 'transferencia', 'trf'].includes(words[0])) return null
  for (const w of words) {
    const group = BY_WORD.get(w)
    if (group !== undefined) return group
  }
  return null
}
