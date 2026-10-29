/* Whose mark a money row gets (11 Oct: "icons for statements like BP or
   Spotify are not there"). A payee's name does not say where its logo
   lives, and most rows come from CSVs the app parses itself, so no reader
   names a site. This is a list of the shops and services he is likely to
   see, matched on whole words of the row's name; a payee not in it gets
   its two letters. Add a line here when one keeps showing letters. */

const SITES: ReadonlyArray<readonly [string, string]> = [
  /* Groceries */
  ['continente', 'continente.pt'],
  ['pingo doce', 'pingodoce.pt'],
  ['lidl', 'lidl.pt'],
  ['aldi', 'aldi.pt'],
  ['auchan', 'auchan.pt'],
  ['mercadona', 'mercadona.pt'],
  ['intermarche', 'intermarche.pt'],
  ['minipreco', 'minipreco.pt'],
  ['el corte ingles', 'elcorteingles.pt'],
  ['celeiro', 'celeiro.pt'],
  /* Fuel and getting around */
  ['bp', 'bp.com'],
  ['galp', 'galp.com'],
  ['repsol', 'repsol.pt'],
  ['prio', 'prio.pt'],
  ['cepsa', 'cepsa.pt'],
  ['shell', 'shell.com'],
  ['bolt', 'bolt.eu'],
  ['uber', 'uber.com'],
  ['free now', 'free-now.com'],
  ['cp comboios', 'cp.pt'],
  ['comboios de portugal', 'cp.pt'],
  ['metro de lisboa', 'metrolisboa.pt'],
  ['carris', 'carris.pt'],
  ['via verde', 'viaverde.pt'],
  ['viaverde', 'viaverde.pt'],
  ['metropolitano de lisboa', 'metrolisboa.pt'],
  ['norauto', 'norauto.pt'],
  ['flixbus', 'flixbus.pt'],
  ['rede expressos', 'rede-expressos.pt'],
  ['ryanair', 'ryanair.com'],
  ['easyjet', 'easyjet.com'],
  ['tap air', 'flytap.com'],
  ['tap portugal', 'flytap.com'],
  ['wizz', 'wizzair.com'],
  ['lufthansa', 'lufthansa.com'],
  ['booking', 'booking.com'],
  ['airbnb', 'airbnb.com'],
  /* Food */
  ['glovo', 'glovoapp.com'],
  ['uber eats', 'ubereats.com'],
  ['mcdonalds', 'mcdonalds.com'],
  ['burger king', 'burgerking.pt'],
  ['kfc', 'kfc.pt'],
  ['starbucks', 'starbucks.com'],
  ['telepizza', 'telepizza.pt'],
  ['dominos', 'dominos.pt'],
  ['padaria portuguesa', 'apadariaportuguesa.pt'],
  /* Subscriptions and software */
  ['spotify', 'spotify.com'],
  ['netflix', 'netflix.com'],
  ['youtube', 'youtube.com'],
  ['disney', 'disneyplus.com'],
  ['hbo', 'max.com'],
  ['prime video', 'primevideo.com'],
  ['amazon', 'amazon.com'],
  ['apple', 'apple.com'],
  ['google', 'google.com'],
  ['microsoft', 'microsoft.com'],
  ['github', 'github.com'],
  ['claude', 'claude.ai'],
  ['anthropic', 'anthropic.com'],
  ['openai', 'openai.com'],
  ['chatgpt', 'openai.com'],
  ['cloudflare', 'cloudflare.com'],
  ['vercel', 'vercel.com'],
  ['notion', 'notion.so'],
  ['figma', 'figma.com'],
  ['linkedin', 'linkedin.com'],
  ['preply', 'preply.com'],
  ['duolingo', 'duolingo.com'],
  ['audible', 'audible.com'],
  ['kindle', 'amazon.com'],
  ['dropbox', 'dropbox.com'],
  ['steam', 'steampowered.com'],
  ['playstation', 'playstation.com'],
  ['paypal', 'paypal.com'],
  /* Shops */
  ['ikea', 'ikea.com'],
  ['fnac', 'fnac.pt'],
  ['worten', 'worten.pt'],
  ['decathlon', 'decathlon.pt'],
  ['zara', 'zara.com'],
  ['mango', 'mango.com'],
  ['gant', 'gant.com'],
  ['intimissimi', 'intimissimi.com'],
  ['primark', 'primark.com'],
  ['leroy merlin', 'leroymerlin.pt'],
  ['aliexpress', 'aliexpress.com'],
  ['temu', 'temu.com'],
  ['vinted', 'vinted.pt'],
  ['wells', 'wells.pt'],
  ['sport zone', 'sportzone.pt'],
  /* Home, phone, health */
  ['vodafone', 'vodafone.pt'],
  ['meo', 'meo.pt'],
  ['nos', 'nos.pt'],
  ['digi', 'digi.pt'],
  ['edp', 'edp.pt'],
  ['endesa', 'endesa.pt'],
  ['epal', 'epal.pt'],
  ['ctt', 'ctt.pt'],
  ['fitness hut', 'fitnesshut.pt'],
  ['holmes place', 'holmesplace.pt'],
  ['allianz', 'allianz.pt'],
  ['fidelidade', 'fidelidade.pt'],
  ['solinca', 'solinca.pt'],
  /* Banks and brokers, when one is a row and not an account */
  ['revolut', 'revolut.com'],
  ['trade republic', 'traderepublic.com'],
  ['trading 212', 'trading212.com'],
  ['activobank', 'activobank.pt'],
  ['bpi', 'bancobpi.pt'],
  ['bnp paribas', 'bnpparibas.com'],
  ['wise', 'wise.com'],
  ['mb way', 'mbway.pt'],
  ['mbway', 'mbway.pt'],
  ['binance', 'binance.com'],
  ['coinbase', 'coinbase.com'],
]

/* Longest name first, so "uber eats" is not "uber" and "prime video" is
   not "amazon". */
const BY_LENGTH = [...SITES].sort((a, b) => b[0].length - a[0].length)

/** Lower case, accents and apostrophes gone, everything else a space. */
function plain(name: string): string {
  return ` ${name
    .normalize('NFD')
    .replace(/[̀-ͯ'’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/** The site whose icon stands for this payee, or null: letters then. */
export function payeeSite(name: string): string | null {
  const words = plain(name)
  if (words.trim() === '') return null
  /* MB Way to a person is still MB Way (29 Oct: "TRF MB WAY P ANA
     SILVA" kept its arrow): the app sent it, whoever got it. */
  if (/ mb ?way /.test(words)) return 'mbway.pt'
  /* Money sent to a person is not a shop: "Transfer to Claude Martin" is
     not the Claude subscription. A wrong mark is worse than letters. */
  if (/^ (transfer|transferencia|trf|to|from|sent) /.test(words)) return null
  return BY_LENGTH.find(([shop]) => words.includes(` ${shop} `))?.[1] ?? null
}

/** Who sent a transfer in, when the bank's line ends with a sender the
 * list knows by its whole name: "TRF CR SEPA+ 0000021 DE BNP PARIBAS"
 * (13 Oct, his salary). The whole name only — "DE CLAUDE MARTIN" is a
 * person, not the Claude subscription. */
export function senderSite(line: string): string | null {
  const sender = /\s(?:DE|FROM)\s+([^\d]+)$/i.exec(line)?.[1]
  if (sender === undefined) return null
  const words = plain(sender)
  return BY_LENGTH.find(([shop]) => words === ` ${shop} `)?.[1] ?? null
}
