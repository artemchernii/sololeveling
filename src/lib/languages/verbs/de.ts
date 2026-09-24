import { de, deStrongPast } from './types'
import type { Verb } from './types'

/* The German verbs you need first. Weak verbs are built from the infinitive;
   strong and mixed ones give the present when it changes (du fährst), the
   past stem and the participle — and sein where the Perfekt takes it. */

export const DE_VERBS: ReadonlyArray<Verb> = [
  de('sein', 'to be', {
    present: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
    past: ['war', 'warst', 'war', 'waren', 'wart', 'waren'],
    participle: 'gewesen',
    aux: 'sein',
  }),
  de('haben', 'to have', {
    present: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
    past: ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'],
    participle: 'gehabt',
  }),
  de('werden', 'to become; will (future)', {
    present: ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'],
    past: ['wurde', 'wurdest', 'wurde', 'wurden', 'wurdet', 'wurden'],
    participle: 'geworden',
    aux: 'sein',
  }),
  de('können', 'can, to be able to', {
    present: ['kann', 'kannst', 'kann', 'können', 'könnt', 'können'],
    past: ['konnte', 'konntest', 'konnte', 'konnten', 'konntet', 'konnten'],
    participle: 'gekonnt',
  }),
  de('müssen', 'must, to have to', {
    present: ['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'],
    past: ['musste', 'musstest', 'musste', 'mussten', 'musstet', 'mussten'],
    participle: 'gemusst',
  }),
  de('wollen', 'to want', {
    present: ['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'],
    past: ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'],
    participle: 'gewollt',
  }),
  de('sollen', 'should, to be supposed to', {
    present: ['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'],
    past: ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'],
    participle: 'gesollt',
  }),
  de('dürfen', 'may, to be allowed to', {
    present: ['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'],
    past: ['durfte', 'durftest', 'durfte', 'durften', 'durftet', 'durften'],
    participle: 'gedurft',
  }),
  de('mögen', 'to like', {
    present: ['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'],
    past: ['mochte', 'mochtest', 'mochte', 'mochten', 'mochtet', 'mochten'],
    participle: 'gemocht',
  }),
  de('wissen', 'to know (a fact)', {
    present: ['weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'],
    past: ['wusste', 'wusstest', 'wusste', 'wussten', 'wusstet', 'wussten'],
    participle: 'gewusst',
  }),
  de('gehen', 'to go (on foot)', {
    past: deStrongPast('ging'),
    participle: 'gegangen',
    aux: 'sein',
  }),
  de('kommen', 'to come', {
    past: deStrongPast('kam'),
    participle: 'gekommen',
    aux: 'sein',
  }),
  de('fahren', 'to drive, to go (by vehicle)', {
    present: ['fahre', 'fährst', 'fährt', 'fahren', 'fahrt', 'fahren'],
    past: deStrongPast('fuhr'),
    participle: 'gefahren',
    aux: 'sein',
  }),
  de('laufen', 'to run; to walk', {
    present: ['laufe', 'läufst', 'läuft', 'laufen', 'lauft', 'laufen'],
    past: deStrongPast('lief'),
    participle: 'gelaufen',
    aux: 'sein',
  }),
  de('bleiben', 'to stay', {
    past: deStrongPast('blieb'),
    participle: 'geblieben',
    aux: 'sein',
  }),
  de('sehen', 'to see', {
    present: ['sehe', 'siehst', 'sieht', 'sehen', 'seht', 'sehen'],
    past: deStrongPast('sah'),
    participle: 'gesehen',
  }),
  de('geben', 'to give', {
    present: ['gebe', 'gibst', 'gibt', 'geben', 'gebt', 'geben'],
    past: deStrongPast('gab'),
    participle: 'gegeben',
  }),
  de('nehmen', 'to take', {
    present: ['nehme', 'nimmst', 'nimmt', 'nehmen', 'nehmt', 'nehmen'],
    past: deStrongPast('nahm'),
    participle: 'genommen',
  }),
  de('essen', 'to eat', {
    present: ['esse', 'isst', 'isst', 'essen', 'esst', 'essen'],
    past: deStrongPast('aß'),
    participle: 'gegessen',
  }),
  de('trinken', 'to drink', {
    past: deStrongPast('trank'),
    participle: 'getrunken',
  }),
  de('lesen', 'to read', {
    present: ['lese', 'liest', 'liest', 'lesen', 'lest', 'lesen'],
    past: ['las', 'last', 'las', 'lasen', 'last', 'lasen'],
    participle: 'gelesen',
  }),
  de('sprechen', 'to speak', {
    present: [
      'spreche',
      'sprichst',
      'spricht',
      'sprechen',
      'sprecht',
      'sprechen',
    ],
    past: deStrongPast('sprach'),
    participle: 'gesprochen',
  }),
  de('schreiben', 'to write', {
    past: deStrongPast('schrieb'),
    participle: 'geschrieben',
  }),
  de('finden', 'to find', {
    past: deStrongPast('fand'),
    participle: 'gefunden',
  }),
  de('schlafen', 'to sleep', {
    present: [
      'schlafe',
      'schläfst',
      'schläft',
      'schlafen',
      'schlaft',
      'schlafen',
    ],
    past: deStrongPast('schlief'),
    participle: 'geschlafen',
  }),
  de('helfen', 'to help', {
    present: ['helfe', 'hilfst', 'hilft', 'helfen', 'helft', 'helfen'],
    past: deStrongPast('half'),
    participle: 'geholfen',
  }),
  de('denken', 'to think', {
    past: ['dachte', 'dachtest', 'dachte', 'dachten', 'dachtet', 'dachten'],
    participle: 'gedacht',
  }),
  de('bringen', 'to bring', {
    past: [
      'brachte',
      'brachtest',
      'brachte',
      'brachten',
      'brachtet',
      'brachten',
    ],
    participle: 'gebracht',
  }),
  de('machen', 'to do, to make'),
  de('arbeiten', 'to work'),
  de('lernen', 'to learn'),
  de('wohnen', 'to live (somewhere)'),
  de('spielen', 'to play'),
  de('kaufen', 'to buy'),
  de('brauchen', 'to need'),
  de('sagen', 'to say'),
  de('fragen', 'to ask'),
  de('hören', 'to hear, to listen'),
  de('warten', 'to wait'),
  de('antworten', 'to answer'),
  de('suchen', 'to look for'),
  de('zeigen', 'to show'),
  de('glauben', 'to believe'),
  de('lieben', 'to love'),
  de('kochen', 'to cook'),
  de('leben', 'to live'),
  de('kosten', 'to cost'),
]
