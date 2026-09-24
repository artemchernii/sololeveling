import type { PathTopic } from '../path'

/* English, A1 to C1 (25 Sep). Explanations in English; each example has its
   European Portuguese under it, since that is the language he is learning
   alongside. The lower levels are short — the value is from B1 up, where
   English stops being guessable. Reference content: nothing is his until he
   presses PRACTISED or SOLID.

   An id is permanent once shipped — his progress is stored against it. */

export const EN: ReadonlyArray<PathTopic> = [
  /* ---------------------------------------------------------------- A1 */
  {
    id: 'a1-present-simple',
    level: 'A1',
    title: 'Present simple',
    en: 'habits and facts',
    explain:
      'Base form, with -s for he/she/it. Questions and negatives need do/does — and then the -s moves to does.',
    examples: [
      { text: 'She works from home.', gloss: 'Ela trabalha a partir de casa.' },
      { text: 'Does he like coffee?', gloss: 'Ele gosta de café?' },
    ],
  },
  {
    id: 'a1-present-continuous',
    level: 'A1',
    title: 'Present continuous',
    en: 'happening now',
    explain:
      'am/is/are + -ing for what is going on right now or around now — and for fixed plans.',
    examples: [
      {
        text: 'I’m reading a great book.',
        gloss: 'Estou a ler um livro ótimo.',
      },
      { text: 'We’re meeting at six.', gloss: 'Vamos encontrar-nos às seis.' },
    ],
  },
  {
    id: 'a1-articles',
    level: 'A1',
    title: 'A, an, the — or nothing',
    en: 'articles',
    explain:
      'A/an for one of many, the for a specific one — and no article for things in general, where Portuguese uses one: “Life is short”, not “The life”.',
    examples: [
      { text: 'Coffee keeps me awake.', gloss: 'O café mantém-me acordado.' },
      { text: 'The coffee here is good.', gloss: 'O café aqui é bom.' },
    ],
  },
  {
    id: 'a1-there-is',
    level: 'A1',
    title: 'There is / there are',
    en: 'há',
    explain:
      'Portuguese há, split by number: there is + singular, there are + plural.',
    examples: [
      { text: 'There’s a café near here.', gloss: 'Há um café aqui perto.' },
      { text: 'There are two problems.', gloss: 'Há dois problemas.' },
    ],
  },
  {
    id: 'a1-prepositions-time',
    level: 'A1',
    title: 'At, on, in (time)',
    en: 'at six, on Monday, in May',
    explain:
      'At for clock times, on for days and dates, in for months, years and parts of the day.',
    examples: [
      { text: 'See you on Monday at nine.', gloss: 'Até segunda às nove.' },
      { text: 'I was born in May.', gloss: 'Nasci em maio.' },
    ],
  },

  /* ---------------------------------------------------------------- A2 */
  {
    id: 'a2-past-simple',
    level: 'A2',
    title: 'Past simple',
    en: 'finished past',
    explain:
      '-ed for regular verbs; the irregular ones are in Verbs below. Questions and negatives use did + base form.',
    examples: [
      {
        text: 'I moved to Lisbon last year.',
        gloss: 'Mudei-me para Lisboa no ano passado.',
      },
      { text: 'Did you see it?', gloss: 'Viste isso?' },
    ],
  },
  {
    id: 'a2-going-to-will',
    level: 'A2',
    title: 'Going to vs will',
    en: 'plan or decision',
    explain:
      'Going to for something already decided or visibly coming; will for a decision made now, a promise or a prediction.',
    examples: [
      { text: 'I’m going to learn German.', gloss: 'Vou aprender alemão.' },
      { text: 'I’ll call you back.', gloss: 'Já te ligo.' },
    ],
  },
  {
    id: 'a2-comparatives',
    level: 'A2',
    title: 'Comparatives',
    en: 'bigger than, more expensive than',
    explain:
      'Short adjectives take -er / -est; long ones take more / most. Irregular: good, better, best; bad, worse, worst.',
    examples: [
      {
        text: 'Porto is smaller than Lisbon.',
        gloss: 'O Porto é mais pequeno do que Lisboa.',
      },
      { text: 'This is the best option.', gloss: 'Esta é a melhor opção.' },
    ],
  },
  {
    id: 'a2-countable',
    level: 'A2',
    title: 'Much, many, a lot of',
    en: 'countable and not',
    explain:
      'Many for things you count, much for things you don’t (mostly in questions and negatives); a lot of works for both.',
    examples: [
      { text: 'How much time do we have?', gloss: 'Quanto tempo temos?' },
      { text: 'There weren’t many people.', gloss: 'Não havia muita gente.' },
    ],
  },
  {
    id: 'a2-modals-basic',
    level: 'A2',
    title: 'Can, have to, should',
    en: 'ability, obligation, advice',
    explain:
      'Modals take no -s and no to: she can swim. Have to is the everyday “must”; should is advice.',
    examples: [
      { text: 'You should rest.', gloss: 'Devias descansar.' },
      { text: 'I have to go.', gloss: 'Tenho de ir.' },
    ],
  },

  /* ---------------------------------------------------------------- B1 */
  {
    id: 'b1-present-perfect',
    level: 'B1',
    title: 'Present perfect',
    en: 'have done — past linked to now',
    explain:
      'Experience, changes and things that started in the past and continue. The trap for Portuguese speakers: with a finished time (yesterday, in 2020) English uses the past simple.',
    examples: [
      {
        text: 'I’ve lived here for two years.',
        gloss: 'Moro cá há dois anos.',
      },
      {
        text: 'Have you ever been to Berlin?',
        gloss: 'Já alguma vez foste a Berlim?',
      },
      { text: 'I went there in 2020.', gloss: 'Fui lá em 2020.' },
    ],
  },
  {
    id: 'b1-past-continuous',
    level: 'B1',
    title: 'Past continuous',
    en: 'was doing',
    explain:
      'The background action, interrupted by a past-simple event — Portuguese imperfeito vs perfeito.',
    examples: [
      {
        text: 'It was raining when I left.',
        gloss: 'Estava a chover quando saí.',
      },
    ],
  },
  {
    id: 'b1-first-conditional',
    level: 'B1',
    title: 'First and second conditional',
    en: 'if it rains / if I had',
    explain:
      'Real: if + present, will. Unreal now: if + past, would. Never “will” or “would” straight after if.',
    examples: [
      {
        text: 'If it rains, we’ll stay in.',
        gloss: 'Se chover, ficamos em casa.',
      },
      {
        text: 'If I had time, I would travel more.',
        gloss: 'Se eu tivesse tempo, viajava mais.',
      },
    ],
  },
  {
    id: 'b1-passive',
    level: 'B1',
    title: 'Passive',
    en: 'it was built',
    explain:
      'be + past participle, when the action matters more than who did it.',
    examples: [
      {
        text: 'The bridge was built in 1966.',
        gloss: 'A ponte foi construída em 1966.',
      },
      { text: 'English is spoken here.', gloss: 'Fala-se inglês aqui.' },
    ],
  },
  {
    id: 'b1-relative-clauses',
    level: 'B1',
    title: 'Relative clauses',
    en: 'who, which, that',
    explain:
      'Who for people, which for things, that for both in defining clauses. As an object it can be dropped: the book (that) you gave me.',
    examples: [
      {
        text: 'The woman who called is my boss.',
        gloss: 'A mulher que ligou é a minha chefe.',
      },
      {
        text: 'The book you gave me is great.',
        gloss: 'O livro que me deste é ótimo.',
      },
    ],
  },
  {
    id: 'b1-gerund-infinitive',
    level: 'B1',
    title: 'Gerund or infinitive',
    en: 'enjoy doing, want to do',
    explain:
      'Some verbs take -ing (enjoy, avoid, finish, mind), some take to (want, decide, hope, need), and a few change meaning (stop, remember, try).',
    examples: [
      { text: 'I enjoy cooking.', gloss: 'Gosto de cozinhar.' },
      {
        text: 'I stopped to smoke. / I stopped smoking.',
        gloss: 'Parei para fumar. / Deixei de fumar.',
      },
    ],
  },
  {
    id: 'b1-phrasal-verbs',
    level: 'B1',
    title: 'Phrasal verbs',
    en: 'give up, find out, run out',
    explain:
      'Verb + particle with its own meaning. Spoken English runs on them: find out (descobrir), give up (desistir), run out of (ficar sem).',
    examples: [
      { text: 'I found out yesterday.', gloss: 'Descobri ontem.' },
      { text: 'We’ve run out of milk.', gloss: 'Ficámos sem leite.' },
    ],
  },

  /* ---------------------------------------------------------------- B2 */
  {
    id: 'b2-third-conditional',
    level: 'B2',
    title: 'Third and mixed conditionals',
    en: 'if I had known',
    explain:
      'Unreal past: if + past perfect, would have + participle. Mixed: a past cause with a present result.',
    examples: [
      {
        text: 'If I’d known, I would have come.',
        gloss: 'Se tivesse sabido, teria vindo.',
      },
      {
        text: 'If I’d taken the job, I’d be in London now.',
        gloss: 'Se tivesse aceitado o emprego, estaria agora em Londres.',
      },
    ],
  },
  {
    id: 'b2-present-perfect-continuous',
    level: 'B2',
    title: 'Present perfect continuous',
    en: 'I’ve been working',
    explain:
      'An activity that has been going on up to now — its duration or its visible result. Portuguese uses the present + há.',
    examples: [
      {
        text: 'I’ve been learning Portuguese for a year.',
        gloss: 'Aprendo português há um ano.',
      },
      {
        text: 'You look tired — have you been running?',
        gloss: 'Pareces cansado — estiveste a correr?',
      },
    ],
  },
  {
    id: 'b2-reported-speech',
    level: 'B2',
    title: 'Reported speech',
    en: 'she said that…',
    explain:
      'Tenses step back after a past reporting verb: is → was, will → would, did → had done. Questions become statements: she asked if I was coming.',
    examples: [
      { text: 'He said he was tired.', gloss: 'Ele disse que estava cansado.' },
      {
        text: 'She asked where I lived.',
        gloss: 'Ela perguntou onde eu morava.',
      },
    ],
  },
  {
    id: 'b2-modals-past',
    level: 'B2',
    title: 'Past modals',
    en: 'should have, must have, might have',
    explain:
      'Modal + have + participle for regrets and deductions about the past.',
    examples: [
      { text: 'You should have told me.', gloss: 'Devias ter-me dito.' },
      { text: 'He must have forgotten.', gloss: 'Ele deve ter-se esquecido.' },
    ],
  },
  {
    id: 'b2-wish',
    level: 'B2',
    title: 'Wish and if only',
    en: 'I wish I had…',
    explain:
      'Wish + past for now, + past perfect for the past, + would for someone else’s annoying habit.',
    examples: [
      { text: 'I wish I spoke German.', gloss: 'Quem me dera falar alemão.' },
      {
        text: 'I wish I hadn’t said that.',
        gloss: 'Quem me dera não ter dito aquilo.',
      },
    ],
  },
  {
    id: 'b2-linkers',
    level: 'B2',
    title: 'Linking words',
    en: 'although, however, despite',
    explain:
      'Although + clause; despite / in spite of + noun or -ing; however starts a new sentence. Whereas and while for contrast, therefore for result.',
    examples: [
      {
        text: 'Despite being tired, I went.',
        gloss: 'Apesar de estar cansado, fui.',
      },
      {
        text: 'It’s expensive. However, it’s worth it.',
        gloss: 'É caro. No entanto, vale a pena.',
      },
    ],
  },

  /* ---------------------------------------------------------------- C1 */
  {
    id: 'c1-inversion',
    level: 'C1',
    title: 'Inversion',
    en: 'Never have I…',
    explain:
      'After a negative or limiting adverb at the front, the auxiliary comes before the subject — emphatic and formal.',
    examples: [
      {
        text: 'Never have I seen such a mess.',
        gloss: 'Nunca vi tamanha confusão.',
      },
      {
        text: 'Not only is it cheap, it’s also good.',
        gloss: 'Não só é barato, como também é bom.',
      },
    ],
  },
  {
    id: 'c1-cleft',
    level: 'C1',
    title: 'Cleft sentences',
    en: 'What I need is…',
    explain:
      'Split a sentence to put the focus where you want it: What… is / It was… that.',
    examples: [
      {
        text: 'What I need is a holiday.',
        gloss: 'Do que eu preciso é de férias.',
      },
      { text: 'It was Ana who told me.', gloss: 'Foi a Ana que me contou.' },
    ],
  },
  {
    id: 'c1-hedging',
    level: 'C1',
    title: 'Hedging',
    en: 'it seems, arguably, tend to',
    explain:
      'Softening a claim, as English writing and meetings expect: it appears that, arguably, to some extent, tend to.',
    examples: [
      {
        text: 'It would appear that the plan has failed.',
        gloss: 'Parece que o plano falhou.',
      },
      {
        text: 'Prices tend to rise in summer.',
        gloss: 'Os preços costumam subir no verão.',
      },
    ],
  },
  {
    id: 'c1-collocations',
    level: 'C1',
    title: 'Collocations',
    en: 'make a decision, heavy rain',
    explain:
      'Words that belong together, which no rule predicts: make a decision (not do), heavy rain (not strong), deeply regret.',
    examples: [
      {
        text: 'We need to make a decision.',
        gloss: 'Precisamos de tomar uma decisão.',
      },
      { text: 'I deeply regret it.', gloss: 'Lamento-o profundamente.' },
    ],
  },
  {
    id: 'c1-idioms',
    level: 'C1',
    title: 'Idioms',
    en: 'what people actually say',
    explain: 'Fixed phrases natives use without thinking.',
    examples: [
      { text: 'Let’s call it a day.', gloss: 'Vamos ficar por aqui.' },
      { text: 'It’s not my cup of tea.', gloss: 'Não é o meu género.' },
      { text: 'I’ll play it by ear.', gloss: 'Logo se vê.' },
    ],
  },
]
