/* A news publisher's site, for its mark on a NEWS row (17 Oct: "can we
   show icons of news?" → "go logos"). Only publishers written here, or a
   name that is itself a site ("GuruFocus.com"): an unknown site's icon
   is a grey globe, and the letter chip says more. Pure, so it is tested. */

const SITES: Record<string, string> = {
  reuters: 'reuters.com',
  bloomberg: 'bloomberg.com',
  cnbc: 'cnbc.com',
  'motley fool': 'fool.com',
  'the motley fool': 'fool.com',
  zacks: 'zacks.com',
  'barrons.com': 'barrons.com',
  "barron's": 'barrons.com',
  marketwatch: 'marketwatch.com',
  "investor's business daily": 'investors.com',
  'yahoo finance': 'yahoo.com',
  'yahoo finance video': 'yahoo.com',
  '24/7 wall st.': '247wallst.com',
  trefis: 'trefis.com',
  benzinga: 'benzinga.com',
  'insider monkey': 'insidermonkey.com',
  'simply wall st.': 'simplywall.st',
  tipranks: 'tipranks.com',
  investopedia: 'investopedia.com',
  'the wall street journal': 'wsj.com',
  'wall street journal': 'wsj.com',
  'financial times': 'ft.com',
  'seeking alpha': 'seekingalpha.com',
  'business insider': 'businessinsider.com',
  "investor's place": 'investorplace.com',
  investorplace: 'investorplace.com',
  'associated press finance': 'apnews.com',
  'ap finance': 'apnews.com',
  forbes: 'forbes.com',
  fortune: 'fortune.com',
  'the telegraph': 'telegraph.co.uk',
  'globe newswire': 'globenewswire.com',
  globenewswire: 'globenewswire.com',
  'business wire': 'businesswire.com',
  'pr newswire': 'prnewswire.com',
  'access newswire': 'accessnewswire.com',
  'the information': 'theinformation.com',
  quartz: 'qz.com',
  'tech crunch': 'techcrunch.com',
  techcrunch: 'techcrunch.com',
  'the verge': 'theverge.com',
  decrypt: 'decrypt.co',
  coindesk: 'coindesk.com',
  kiplinger: 'kiplinger.com',
  thestreet: 'thestreet.com',
  'the street': 'thestreet.com',
}

/** The publisher's site, or undefined when it is not known. */
export function publisherSite(name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (SITES[key]) return SITES[key]
  /* A name that is a site: "GuruFocus.com", "Barrons.com". */
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|co|io|st)$/.test(key)
    ? key
    : undefined
}
