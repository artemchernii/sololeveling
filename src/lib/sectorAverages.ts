/* The sector averages beside a company's P/E in its ⓘ card (16 Oct,
   mockup fundamentals.html): Aswath Damodaran's industry table (NYU
   Stern), published each January — the forward P/E of each US
   industry and of the whole market. Read here, stored by
   convex/sectorAverages.ts, shown only in the card, never in the rule. */

export const DAMODARAN_PE =
  'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/pedata.html'
/** Damodaran's own name for every US firm together. */
export const MARKET = 'Total Market'

export type SectorRow = { industry: string; firms: number; forwardPe: number }

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** Every industry of the table with its forward P/E, and the year in
    its "Updated in January 2026" line. Null when the page has neither. */
export function parsePeTable(
  html: string,
): { year: number; rows: Array<SectorRow> } | null {
  const year = /Updated in [A-Za-z]+ (\d{4})/.exec(html)?.[1]
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const cells = trs.map((tr) =>
    (tr.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(text),
  )
  const head = cells.findIndex((c) => c.some((x) => /forward pe/i.test(x)))
  if (year === undefined || head < 0) return null
  const col = cells[head].findIndex((x) => /forward pe/i.test(x))
  const firmsCol = cells[head].findIndex((x) => /number of firms/i.test(x))
  const rows = cells.slice(head + 1).flatMap((c) => {
    const pe = Number(c[col])
    const firms = Number((c[firmsCol] ?? '').replace(/,/g, ''))
    return c[0] && Number.isFinite(pe) && pe > 0
      ? [
          {
            industry: c[0],
            firms: Number.isFinite(firms) ? firms : 0,
            forwardPe: pe,
          },
        ]
      : []
  })
  return rows.length ? { year: Number(year), rows } : null
}

/* Yahoo's industry (assetProfile.industry) to Damodaran's. One name to
   one name, written by hand; an industry not here has no sector bar in
   its card, only the market's. */
const MAP: Record<string, string> = {
  Semiconductors: 'Semiconductor',
  'Semiconductor Equipment & Materials': 'Semiconductor Equip',
  'Software - Infrastructure': 'Software (System & Application)',
  'Software - Application': 'Software (System & Application)',
  'Electronic Gaming & Multimedia': 'Software (Entertainment)',
  'Internet Content & Information': 'Software (Internet)',
  'Information Technology Services': 'Computer Services',
  'Computer Hardware': 'Computers/Peripherals',
  'Consumer Electronics': 'Electronics (Consumer & Office)',
  'Electronic Components': 'Electronics (General)',
  'Scientific & Technical Instruments': 'Electronics (General)',
  'Communication Equipment': 'Telecom. Equipment',
  'Telecom Services': 'Telecom. Services',
  'Internet Retail': 'Retail (General)',
  'Discount Stores': 'Retail (General)',
  'Department Stores': 'Retail (General)',
  'Specialty Retail': 'Retail (Special Lines)',
  'Home Improvement Retail': 'Retail (Building Supply)',
  'Grocery Stores': 'Retail (Grocery and Food)',
  'Auto & Truck Dealerships': 'Retail (Automotive)',
  'Auto Manufacturers': 'Auto & Truck',
  'Auto Parts': 'Auto Parts',
  'Banks - Diversified': 'Bank (Money Center)',
  'Banks - Regional': 'Banks (Regional)',
  'Capital Markets': 'Brokerage & Investment Banking',
  'Asset Management': 'Investments & Asset Management',
  'Credit Services': 'Financial Svcs. (Non-bank & Insurance)',
  'Financial Data & Stock Exchanges': 'Financial Svcs. (Non-bank & Insurance)',
  'Insurance - Life': 'Insurance (Life)',
  'Insurance - Property & Casualty': 'Insurance (Prop/Cas.)',
  'Insurance - Diversified': 'Insurance (General)',
  'Insurance - Reinsurance': 'Reinsurance',
  'Drug Manufacturers - General': 'Drugs (Pharmaceutical)',
  'Drug Manufacturers - Specialty & Generic': 'Drugs (Pharmaceutical)',
  Biotechnology: 'Drugs (Biotechnology)',
  'Medical Devices': 'Healthcare Products',
  'Medical Instruments & Supplies': 'Healthcare Products',
  'Diagnostics & Research': 'Healthcare Products',
  'Healthcare Plans': 'Healthcare Support Services',
  'Medical Care Facilities': 'Hospitals/Healthcare Facilities',
  'Health Information Services': 'Heathcare Information and Technology',
  'Aerospace & Defense': 'Aerospace/Defense',
  Airlines: 'Air Transport',
  Railroads: 'Transportation (Railroads)',
  Trucking: 'Trucking',
  'Integrated Freight & Logistics': 'Transportation',
  'Specialty Industrial Machinery': 'Machinery',
  'Farm & Heavy Construction Machinery': 'Machinery',
  'Electrical Equipment & Parts': 'Electrical Equipment',
  'Engineering & Construction': 'Engineering/Construction',
  Conglomerates: 'Diversified',
  'Oil & Gas Integrated': 'Oil/Gas (Integrated)',
  'Oil & Gas E&P': 'Oil/Gas (Production and Exploration)',
  'Oil & Gas Midstream': 'Oil/Gas Distribution',
  'Oil & Gas Equipment & Services': 'Oilfield Svcs/Equip.',
  'Utilities - Regulated Electric': 'Utility (General)',
  'Utilities - Diversified': 'Utility (General)',
  'Utilities - Regulated Water': 'Utility (Water)',
  'Utilities - Renewable': 'Green & Renewable Energy',
  Solar: 'Green & Renewable Energy',
  'Beverages - Non-Alcoholic': 'Beverage (Soft)',
  'Beverages - Brewers': 'Beverage (Alcoholic)',
  'Beverages - Wineries & Distilleries': 'Beverage (Alcoholic)',
  'Packaged Foods': 'Food Processing',
  'Household & Personal Products': 'Household Products',
  Tobacco: 'Tobacco',
  Restaurants: 'Restaurant/Dining',
  'Apparel Manufacturing': 'Apparel',
  'Footwear & Accessories': 'Shoe',
  'Resorts & Casinos': 'Hotel/Gaming',
  Lodging: 'Hotel/Gaming',
  Entertainment: 'Entertainment',
  'Advertising Agencies': 'Advertising',
  Broadcasting: 'Broadcasting',
  Publishing: 'Publishing & Newspapers',
  Chemicals: 'Chemical (Basic)',
  'Specialty Chemicals': 'Chemical (Specialty)',
  Steel: 'Steel',
  Gold: 'Precious Metals',
  Silver: 'Precious Metals',
  'Other Industrial Metals & Mining': 'Metals & Mining',
  Copper: 'Metals & Mining',
  'Building Materials': 'Building Materials',
  'Residential Construction': 'Homebuilding',
  'Waste Management': 'Environmental & Waste Services',
  'REIT - Diversified': 'R.E.I.T.',
  'REIT - Industrial': 'R.E.I.T.',
  'REIT - Office': 'R.E.I.T.',
  'REIT - Residential': 'R.E.I.T.',
  'REIT - Specialty': 'R.E.I.T.',
  'REIT - Retail': 'Retail (REITs)',
  'Real Estate Services': 'Real Estate (Operations & Services)',
  'Education & Training Services': 'Education',
}

/** Damodaran's industry for Yahoo's, or undefined. */
export const industryOf = (yahoo: string | undefined) =>
  yahoo === undefined ? undefined : MAP[yahoo]
