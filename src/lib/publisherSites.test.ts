import { describe, expect, it } from 'vitest'

import { publisherSite } from './publisherSites'

describe('publisherSite', () => {
  it('knows the publishers Yahoo names, in any case', () => {
    expect(publisherSite('Reuters')).toBe('reuters.com')
    expect(publisherSite('Motley Fool')).toBe('fool.com')
    expect(publisherSite("Investor's Business Daily")).toBe('investors.com')
    expect(publisherSite('24/7 Wall St.')).toBe('247wallst.com')
    expect(publisherSite(' ZACKS ')).toBe('zacks.com')
  })

  it('takes a name that is itself a site', () => {
    expect(publisherSite('GuruFocus.com')).toBe('gurufocus.com')
    expect(publisherSite('Barrons.com')).toBe('barrons.com')
  })

  it('says nothing for a publisher it does not know', () => {
    expect(publisherSite('Some Local Gazette')).toBeUndefined()
    expect(publisherSite('')).toBeUndefined()
  })
})
