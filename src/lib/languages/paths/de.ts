import type { PathTopic } from '../path'

/* German, A1 to C1 (25 Sep) — the grammar each level carries, in the order
   it is usually learned. Explanations in English, examples in German with
   the English under them. Reference content: nothing is his until he
   presses PRACTISED or SOLID.

   An id is permanent once shipped — his progress is stored against it. */

export const DE: ReadonlyArray<PathTopic> = [
  /* ---------------------------------------------------------------- A1 */
  {
    id: 'a1-artikel',
    level: 'A1',
    title: 'Der, die, das',
    en: 'three genders',
    explain:
      'Every noun has a gender you learn with it: der (masculine), die (feminine), das (neuter); plural is always die. Learn “der Tisch”, never just “Tisch”.',
    examples: [
      { text: 'Der Kaffee ist heiß.', gloss: 'The coffee is hot.' },
      { text: 'Die Stadt ist schön.', gloss: 'The city is beautiful.' },
      { text: 'Das Buch liegt hier.', gloss: 'The book is here.' },
    ],
  },
  {
    id: 'a1-praesens',
    level: 'A1',
    title: 'Präsens',
    en: 'the present tense',
    explain:
      'Stem + -e, -st, -t, -en, -t, -en. It covers now, habits and the near future: “Ich fahre morgen” is a plan, not a present.',
    examples: [
      { text: 'Ich wohne in Lissabon.', gloss: 'I live in Lisbon.' },
      {
        text: 'Wir fahren morgen nach Berlin.',
        gloss: 'We’re going to Berlin tomorrow.',
      },
    ],
  },
  {
    id: 'a1-sein-haben',
    level: 'A1',
    title: 'Sein und haben',
    en: 'to be and to have',
    explain:
      'The two verbs everything else leans on — and both build the Perfekt later. Learn them as whole sets: bin, bist, ist, sind, seid, sind / habe, hast, hat, haben, habt, haben.',
    examples: [
      { text: 'Ich bin müde.', gloss: 'I’m tired.' },
      { text: 'Hast du Zeit?', gloss: 'Do you have time?' },
    ],
  },
  {
    id: 'a1-verbzweit',
    level: 'A1',
    title: 'Verb an Position 2',
    en: 'the verb comes second',
    explain:
      'In a statement the conjugated verb is always the second element — whatever comes first. Put time first and the subject moves behind the verb.',
    examples: [
      { text: 'Ich trinke heute Kaffee.', gloss: 'I’m drinking coffee today.' },
      { text: 'Heute trinke ich Kaffee.', gloss: 'Today I’m drinking coffee.' },
    ],
  },
  {
    id: 'a1-fragen',
    level: 'A1',
    title: 'Fragen',
    en: 'asking',
    explain:
      'Yes/no questions start with the verb. W-questions start with the W-word, then the verb: wer, was, wo, wann, wie, warum, woher.',
    examples: [
      { text: 'Kommst du mit?', gloss: 'Are you coming along?' },
      { text: 'Woher kommst du?', gloss: 'Where are you from?' },
    ],
  },
  {
    id: 'a1-akkusativ',
    level: 'A1',
    title: 'Akkusativ',
    en: 'the direct object',
    explain:
      'The thing you have, want, see or buy is in the accusative. Only the masculine changes: der → den, ein → einen.',
    examples: [
      { text: 'Ich habe einen Bruder.', gloss: 'I have a brother.' },
      { text: 'Siehst du den Hund?', gloss: 'Do you see the dog?' },
    ],
  },
  {
    id: 'a1-negation',
    level: 'A1',
    title: 'Nicht oder kein',
    en: 'saying no',
    explain:
      'Kein negates a noun that would have ein or no article; nicht negates everything else — verbs, adjectives, nouns with der/die/das.',
    examples: [
      { text: 'Ich habe kein Auto.', gloss: 'I don’t have a car.' },
      { text: 'Das ist nicht mein Auto.', gloss: 'That’s not my car.' },
    ],
  },
  {
    id: 'a1-modalverben',
    level: 'A1',
    title: 'Modalverben',
    en: 'können, müssen, wollen…',
    explain:
      'The modal is conjugated in position 2; the main verb goes to the very end, in the infinitive. Ich/er forms have no ending: ich kann, er muss.',
    examples: [
      { text: 'Ich kann heute nicht kommen.', gloss: 'I can’t come today.' },
      { text: 'Du musst mehr schlafen.', gloss: 'You need to sleep more.' },
    ],
  },

  /* ---------------------------------------------------------------- A2 */
  {
    id: 'a2-perfekt',
    level: 'A2',
    title: 'Perfekt',
    en: 'the spoken past',
    explain:
      'haben or sein + participle at the end. Sein for movement from A to B and change of state (gehen, fahren, werden, bleiben); haben for everything else.',
    examples: [
      { text: 'Ich habe gestern gearbeitet.', gloss: 'I worked yesterday.' },
      { text: 'Wir sind nach Hause gegangen.', gloss: 'We went home.' },
    ],
  },
  {
    id: 'a2-dativ',
    level: 'A2',
    title: 'Dativ',
    en: 'to whom, and after mit, bei, von…',
    explain:
      'The person something is given to, and every noun after aus, bei, mit, nach, seit, von, zu. dem / der / dem, plural den + -n.',
    examples: [
      {
        text: 'Ich gebe dem Kind das Buch.',
        gloss: 'I give the child the book.',
      },
      { text: 'Ich fahre mit dem Zug.', gloss: 'I’m going by train.' },
    ],
  },
  {
    id: 'a2-trennbar',
    level: 'A2',
    title: 'Trennbare Verben',
    en: 'aufstehen → ich stehe auf',
    explain:
      'Verbs with a prefix like an-, auf-, aus-, ein-, mit-, zu- split: the prefix jumps to the end. In the participle, ge sits inside: aufgestanden.',
    examples: [
      { text: 'Ich stehe um sieben auf.', gloss: 'I get up at seven.' },
      { text: 'Rufst du mich später an?', gloss: 'Will you call me later?' },
    ],
  },
  {
    id: 'a2-wechsel',
    level: 'A2',
    title: 'Wechselpräpositionen',
    en: 'in, an, auf — where or where to',
    explain:
      'Nine prepositions take the accusative for movement (wohin?) and the dative for position (wo?): in, an, auf, über, unter, vor, hinter, neben, zwischen.',
    examples: [
      {
        text: 'Ich lege das Buch auf den Tisch.',
        gloss: 'I put the book on the table.',
      },
      {
        text: 'Das Buch liegt auf dem Tisch.',
        gloss: 'The book is on the table.',
      },
    ],
  },
  {
    id: 'a2-nebensatz',
    level: 'A2',
    title: 'Nebensätze mit weil, dass, wenn',
    en: 'the verb goes to the end',
    explain:
      'After weil, dass, wenn, ob and the like, the conjugated verb goes to the end of the clause.',
    examples: [
      {
        text: 'Ich bleibe zu Hause, weil ich krank bin.',
        gloss: 'I’m staying home because I’m ill.',
      },
      { text: 'Ich glaube, dass er recht hat.', gloss: 'I think he’s right.' },
    ],
  },
  {
    id: 'a2-possessiv',
    level: 'A2',
    title: 'Possessivartikel',
    en: 'mein, dein, sein, ihr…',
    explain:
      'They take the endings of ein: mein Bruder, meine Schwester, meinen Bruder (accusative). Sein = his, ihr = her/their, Ihr = your (formal).',
    examples: [
      { text: 'Das ist meine Wohnung.', gloss: 'This is my flat.' },
      { text: 'Kennst du ihren Freund?', gloss: 'Do you know her boyfriend?' },
    ],
  },
  {
    id: 'a2-komparativ',
    level: 'A2',
    title: 'Komparativ und Superlativ',
    en: 'größer als, am größten',
    explain:
      '-er + als to compare, am …-sten for the most; so … wie for equal. Many short adjectives add an umlaut: alt → älter, groß → größer. Irregular: gut, besser, am besten.',
    examples: [
      {
        text: 'Berlin ist größer als Lissabon.',
        gloss: 'Berlin is bigger than Lisbon.',
      },
      { text: 'Das ist am besten.', gloss: 'That is best.' },
    ],
  },
  {
    id: 'a2-reflexiv',
    level: 'A2',
    title: 'Reflexive Verben',
    en: 'sich freuen, sich erinnern',
    explain:
      'Many German verbs take sich where English has none: mich, dich, sich, uns, euch, sich.',
    examples: [
      {
        text: 'Ich freue mich auf das Wochenende.',
        gloss: 'I’m looking forward to the weekend.',
      },
      { text: 'Erinnerst du dich?', gloss: 'Do you remember?' },
    ],
  },

  /* ---------------------------------------------------------------- B1 */
  {
    id: 'b1-praeteritum',
    level: 'B1',
    title: 'Präteritum',
    en: 'the written past',
    explain:
      'Stories, news and books use it; speech uses the Perfekt — except for sein, haben and the modals, which are said in the Präteritum too: ich war, ich hatte, ich konnte.',
    examples: [
      {
        text: 'Es war einmal ein König.',
        gloss: 'Once upon a time there was a king.',
      },
      { text: 'Ich musste lange warten.', gloss: 'I had to wait a long time.' },
    ],
  },
  {
    id: 'b1-adjektivendungen',
    level: 'B1',
    title: 'Adjektivendungen',
    en: 'ein guter Wein, der gute Wein',
    explain:
      'If the article already shows the case and gender, the adjective takes a weak -e/-en; if not, the adjective has to show it itself. The grammar most learners fight longest.',
    examples: [
      { text: 'Der alte Mann liest.', gloss: 'The old man is reading.' },
      { text: 'Ein alter Mann liest.', gloss: 'An old man is reading.' },
      { text: 'Ich trinke kalten Kaffee.', gloss: 'I drink cold coffee.' },
    ],
  },
  {
    id: 'b1-konjunktiv2',
    level: 'B1',
    title: 'Konjunktiv II',
    en: 'würde, hätte, wäre — would',
    explain:
      'Wishes, polite requests and unreal “if”: würde + infinitive for most verbs, but hätte, wäre, könnte, müsste as one word.',
    examples: [
      { text: 'Ich hätte gern einen Kaffee.', gloss: 'I’d like a coffee.' },
      {
        text: 'Wenn ich Zeit hätte, würde ich reisen.',
        gloss: 'If I had time, I would travel.',
      },
      { text: 'Könntest du mir helfen?', gloss: 'Could you help me?' },
    ],
  },
  {
    id: 'b1-relativsaetze',
    level: 'B1',
    title: 'Relativsätze',
    en: 'der Mann, der…',
    explain:
      'The relative pronoun takes its gender from the noun and its case from its job in the new clause; the verb goes to the end.',
    examples: [
      {
        text: 'Der Mann, der dort steht, ist mein Chef.',
        gloss: 'The man standing there is my boss.',
      },
      {
        text: 'Die Frau, mit der ich spreche, ist Ärztin.',
        gloss: 'The woman I’m talking to is a doctor.',
      },
    ],
  },
  {
    id: 'b1-passiv',
    level: 'B1',
    title: 'Passiv',
    en: 'wird gemacht',
    explain:
      'werden + participle when the action matters more than who did it. Past: wurde gemacht; Perfekt: ist gemacht worden.',
    examples: [
      {
        text: 'Das Haus wird renoviert.',
        gloss: 'The house is being renovated.',
      },
      {
        text: 'Die Brücke wurde 1990 gebaut.',
        gloss: 'The bridge was built in 1990.',
      },
    ],
  },
  {
    id: 'b1-genitiv',
    level: 'B1',
    title: 'Genitiv',
    en: 'des Mannes, wegen des Wetters',
    explain:
      'Possession in writing, and after wegen, trotz, während, statt. In speech von + dative often replaces it.',
    examples: [
      {
        text: 'Das ist das Auto meines Vaters.',
        gloss: 'That’s my father’s car.',
      },
      {
        text: 'Wegen des Regens bleiben wir hier.',
        gloss: 'Because of the rain we’re staying here.',
      },
    ],
  },
  {
    id: 'b1-zu-infinitiv',
    level: 'B1',
    title: 'Infinitiv mit zu',
    en: 'Ich habe keine Lust, zu…',
    explain:
      'After many verbs and phrases the next verb takes zu: versuchen, vergessen, anfangen, Lust haben, es ist wichtig. Um … zu = in order to.',
    examples: [
      {
        text: 'Ich versuche, jeden Tag zu lernen.',
        gloss: 'I try to study every day.',
      },
      {
        text: 'Ich lerne Deutsch, um in Berlin zu arbeiten.',
        gloss: 'I’m learning German to work in Berlin.',
      },
    ],
  },
  {
    id: 'b1-futur',
    level: 'B1',
    title: 'Futur I',
    en: 'werden + infinitive',
    explain:
      'For promises, predictions and guesses. For plans German prefers the present with a time word.',
    examples: [
      { text: 'Es wird morgen regnen.', gloss: 'It will rain tomorrow.' },
      { text: 'Er wird wohl krank sein.', gloss: 'He’s probably ill.' },
    ],
  },

  /* ---------------------------------------------------------------- B2 */
  {
    id: 'b2-konjunktiv2-vergangenheit',
    level: 'B2',
    title: 'Konjunktiv II der Vergangenheit',
    en: 'hätte gemacht — would have',
    explain:
      'hätte / wäre + participle for regrets and unreal past; with a modal, a double infinitive at the end.',
    examples: [
      {
        text: 'Wenn ich das gewusst hätte, wäre ich gekommen.',
        gloss: 'If I’d known, I would have come.',
      },
      {
        text: 'Du hättest mich anrufen sollen.',
        gloss: 'You should have called me.',
      },
    ],
  },
  {
    id: 'b2-konjunktiv1',
    level: 'B2',
    title: 'Konjunktiv I',
    en: 'er sagte, er sei krank',
    explain:
      'Reported speech in news and formal writing: er sei, er habe, er komme. It marks the words as someone else’s.',
    examples: [
      {
        text: 'Der Minister sagte, er habe nichts gewusst.',
        gloss: 'The minister said he had known nothing.',
      },
    ],
  },
  {
    id: 'b2-n-deklination',
    level: 'B2',
    title: 'N-Deklination',
    en: 'den Kollegen, dem Studenten',
    explain:
      'A group of masculine nouns — people and animals ending in -e, and words like Student, Mensch, Herr — add -(e)n in every case but the nominative.',
    examples: [
      { text: 'Ich frage meinen Kollegen.', gloss: 'I’ll ask my colleague.' },
      { text: 'Kennst du den Studenten?', gloss: 'Do you know the student?' },
    ],
  },
  {
    id: 'b2-verben-praepositionen',
    level: 'B2',
    title: 'Verben mit Präpositionen',
    en: 'warten auf, denken an',
    explain:
      'Many verbs fix their preposition and its case: warten auf + Akk., denken an + Akk., sich interessieren für, abhängen von. Da-/wo-words stand in for the thing: darauf, woran.',
    examples: [
      { text: 'Ich warte auf den Bus.', gloss: 'I’m waiting for the bus.' },
      {
        text: 'Woran denkst du? — Daran, dass…',
        gloss: 'What are you thinking about? — About the fact that…',
      },
    ],
  },
  {
    id: 'b2-konnektoren',
    level: 'B2',
    title: 'Konnektoren',
    en: 'obwohl, trotzdem, deshalb',
    explain:
      'Which word order each takes is the point: obwohl sends the verb to the end; trotzdem, deshalb and außerdem take position 1 and the verb follows at once.',
    examples: [
      {
        text: 'Obwohl es regnet, gehe ich laufen.',
        gloss: 'Although it’s raining, I’m going running.',
      },
      {
        text: 'Es regnet. Trotzdem gehe ich laufen.',
        gloss: 'It’s raining. I’m going running anyway.',
      },
    ],
  },
  {
    id: 'b2-partizip-adjektiv',
    level: 'B2',
    title: 'Partizipien als Adjektive',
    en: 'das laufende Jahr, die gelesene Zeitung',
    explain:
      'Participle I (-end) for what is going on, participle II for what is done — both used before a noun with adjective endings. A written-German skill.',
    examples: [
      { text: 'Das schlafende Kind.', gloss: 'The sleeping child.' },
      {
        text: 'Die reparierte Maschine läuft wieder.',
        gloss: 'The repaired machine runs again.',
      },
    ],
  },
  {
    id: 'b2-modalpartikeln',
    level: 'B2',
    title: 'Modalpartikeln',
    en: 'doch, mal, ja, eben',
    explain:
      'Small words with no translation that carry the tone of spoken German: mal softens, doch pushes, ja says “as we both know”.',
    examples: [
      { text: 'Komm doch mit!', gloss: 'Oh come on, come along!' },
      {
        text: 'Kannst du mal kurz helfen?',
        gloss: 'Could you help for a sec?',
      },
    ],
  },

  /* ---------------------------------------------------------------- C1 */
  {
    id: 'c1-nominalstil',
    level: 'C1',
    title: 'Nominalstil',
    en: 'writing like a report',
    explain:
      'Formal German turns verbs into nouns: weil er krank war → wegen seiner Krankheit. Dense, precise, and expected in work writing.',
    examples: [
      {
        text: 'Nach Abschluss des Projekts…',
        gloss: 'After the project was finished…',
      },
    ],
  },
  {
    id: 'c1-erweitertes-attribut',
    level: 'C1',
    title: 'Erweitertes Partizipialattribut',
    en: 'the long thing before the noun',
    explain:
      'A whole relative clause packed in front of a noun: die von der Regierung beschlossene Reform. Read it from the article to the noun, then back.',
    examples: [
      {
        text: 'Die seit Jahren geplante Reform tritt morgen in Kraft.',
        gloss: 'The reform planned for years takes effect tomorrow.',
      },
    ],
  },
  {
    id: 'c1-passiversatz',
    level: 'C1',
    title: 'Passiversatz',
    en: 'lässt sich machen, ist zu machen',
    explain:
      'Ways to say “can be / must be done” without werden: sich lassen, sein + zu, -bar adjectives.',
    examples: [
      {
        text: 'Das lässt sich leicht erklären.',
        gloss: 'That can be easily explained.',
      },
      {
        text: 'Die Rechnung ist bis Freitag zu bezahlen.',
        gloss: 'The bill must be paid by Friday.',
      },
    ],
  },
  {
    id: 'c1-subjektive-modalverben',
    level: 'C1',
    title: 'Modalverben für Vermutungen',
    en: 'er muss krank sein',
    explain:
      'Modals also grade how sure you are: muss (certain), dürfte (likely), kann (possible), soll (they say), will (he claims).',
    examples: [
      {
        text: 'Er muss schon zu Hause sein.',
        gloss: 'He must be home already.',
      },
      {
        text: 'Sie soll sehr reich sein.',
        gloss: 'She’s said to be very rich.',
      },
    ],
  },
  {
    id: 'c1-redewendungen',
    level: 'C1',
    title: 'Redewendungen',
    en: 'what people actually say',
    explain: 'Idioms you hear every week and cannot work out word by word.',
    examples: [
      { text: 'Das ist nicht mein Bier.', gloss: 'That’s not my problem.' },
      { text: 'Ich verstehe nur Bahnhof.', gloss: 'It’s all Greek to me.' },
      { text: 'Da steppt der Bär.', gloss: 'That’s where the party is.' },
    ],
  },
  {
    id: 'c1-register',
    level: 'C1',
    title: 'Register',
    en: 'Sie and du, written and spoken',
    explain:
      'When to switch from Sie to du (usually the older or senior person offers), and how emails, meetings and friends each sound.',
    examples: [
      {
        text: 'Sehr geehrte Frau Weber, …',
        gloss: 'Dear Ms Weber, … (formal letter)',
      },
      {
        text: 'Wollen wir uns duzen?',
        gloss: 'Shall we say du to each other?',
      },
    ],
  },
]
