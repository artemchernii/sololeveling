import type { PathTopic } from '../path'

/* European Portuguese, A1 to C1 (25 Sep). "I want some data on Portuguese…
   I don't want to write a shitty list myself. I need a helper."

   The grammar that carries each level, in the order it is usually learned,
   written for Portugal: tu with friends, `estar a + infinitive`, pronouns
   after the verb. Each topic says what it is for, how it works, and shows it
   in sentences you would actually say.

   Reference content, like the capture verbs: nothing here is his until he
   presses PRACTISED or SOLID on it, and those write his own rows.

   An id is permanent once shipped — his progress is stored against it. Edit
   the words freely; never renumber or reuse an id. */

export const PT_PT: ReadonlyArray<PathTopic> = [
  /* ---------------------------------------------------------------- A1 */
  {
    id: 'a1-ser-estar',
    level: 'A1',
    title: 'Ser vs estar',
    en: 'two verbs for “to be”',
    explain:
      'Ser is what something is — identity, origin, job, what it is made of, the time. Estar is how or where something is right now — a state, a mood, a location of a thing that moves.',
    examples: [
      {
        text: 'A Marta é médica e é do Porto.',
        gloss: 'Marta is a doctor and she’s from Porto.',
      },
      { text: 'Estou cansado hoje.', gloss: 'I’m tired today.' },
      { text: 'O café está frio.', gloss: 'The coffee is (has gone) cold.' },
    ],
  },
  {
    id: 'a1-presente',
    level: 'A1',
    title: 'Presente do indicativo',
    en: 'present tense, regular verbs',
    explain:
      'Drop -ar, -er or -ir and add the ending for the person. In Portugal you use eu, tu, ele/ela/você, nós, eles/vocês — vós is gone from speech.',
    examples: [
      {
        text: 'Moro em Lisboa há um ano.',
        gloss: 'I’ve lived in Lisbon for a year.',
      },
      { text: 'Comes carne?', gloss: 'Do you eat meat?' },
      { text: 'Nós partimos amanhã cedo.', gloss: 'We leave early tomorrow.' },
    ],
  },
  {
    id: 'a1-irregulares',
    level: 'A1',
    title: 'Verbos irregulares',
    en: 'the ten irregulars you use all day',
    explain:
      'Ter, ir, fazer, poder, querer, dizer, vir, ver, dar, saber. Learn them as whole sets — they are most of what you say.',
    examples: [
      { text: 'Tenho fome.', gloss: 'I’m hungry.' },
      {
        text: 'Vou ao ginásio depois do trabalho.',
        gloss: 'I go to the gym after work.',
      },
      {
        text: 'Não sei o que queres dizer.',
        gloss: 'I don’t know what you mean.',
      },
    ],
  },
  {
    id: 'a1-artigos',
    level: 'A1',
    title: 'Género e artigos',
    en: 'gender, o / a / um / uma',
    explain:
      'Every noun is masculine or feminine and the article agrees: o/a, os/as, um/uma. Portuguese uses the article far more than English — even before names and possessives.',
    examples: [
      { text: 'A Ana chegou.', gloss: 'Ana has arrived.' },
      { text: 'Um problema, uma solução.', gloss: 'A problem, a solution.' },
    ],
  },
  {
    id: 'a1-contracoes',
    level: 'A1',
    title: 'Contrações',
    en: 'do, na, ao, pelo…',
    explain:
      'De, em, a and por fuse with the article: de + o = do, em + a = na, a + o = ao, por + o = pelo. You never say “em o”.',
    examples: [
      { text: 'Estou no escritório.', gloss: 'I’m at the office.' },
      { text: 'Vou ao mercado.', gloss: 'I’m going to the market.' },
      { text: 'Passei pela praia.', gloss: 'I went past the beach.' },
    ],
  },
  {
    id: 'a1-tratamento',
    level: 'A1',
    title: 'Tu, você, o senhor',
    en: 'how to address people',
    explain:
      'Tu with friends, family and people your age. Você can sound cold in Portugal — with strangers, drop the pronoun and use the verb’s third person, or say o senhor / a senhora.',
    examples: [
      { text: 'Queres um café?', gloss: 'Do you want a coffee? (to a friend)' },
      {
        text: 'Deseja mais alguma coisa?',
        gloss: 'Anything else? (to a customer)',
      },
      {
        text: 'O senhor sabe onde fica a estação?',
        gloss: 'Do you know where the station is, sir?',
      },
    ],
  },
  {
    id: 'a1-estar-a',
    level: 'A1',
    title: 'Estar a + infinitivo',
    en: 'what is happening right now',
    explain:
      'Portugal’s “-ing”: estar a + infinitive. The gerund (estou fazendo) is Brazilian — in Lisbon it marks you out.',
    examples: [
      {
        text: 'Estou a trabalhar, ligo-te depois.',
        gloss: 'I’m working, I’ll call you later.',
      },
      { text: 'O que estás a fazer?', gloss: 'What are you doing?' },
    ],
  },
  {
    id: 'a1-possessivos',
    level: 'A1',
    title: 'Possessivos',
    en: 'o meu, a tua, dele',
    explain:
      'The possessive agrees with the thing owned and usually takes an article: o meu carro, a minha casa. For his/her/their, say dele, dela, deles after the noun — seu is ambiguous.',
    examples: [
      {
        text: 'A minha irmã mora no Porto.',
        gloss: 'My sister lives in Porto.',
      },
      { text: 'O carro dele é novo.', gloss: 'His car is new.' },
    ],
  },
  {
    id: 'a1-perguntas',
    level: 'A1',
    title: 'Perguntas e negação',
    en: 'asking and saying no',
    explain:
      'Não goes before the verb. Question words — onde, quando, quanto, porquê — are often followed by “é que” in speech, and the word order stays normal after it.',
    examples: [
      { text: 'Onde é que moras?', gloss: 'Where do you live?' },
      { text: 'Não percebo.', gloss: 'I don’t understand.' },
      {
        text: 'Porquê? Porque estou cansado.',
        gloss: 'Why? Because I’m tired.',
      },
    ],
  },
  {
    id: 'a1-ir-futuro',
    level: 'A1',
    title: 'Ir + infinitivo',
    en: 'the future you actually speak',
    explain:
      'Ir in the present + infinitive covers almost every future in conversation. The real future tense (falarei) is for writing.',
    examples: [
      { text: 'Vou jantar fora hoje.', gloss: 'I’m going to eat out tonight.' },
      { text: 'Vamos ver.', gloss: 'We’ll see.' },
    ],
  },

  /* ---------------------------------------------------------------- A2 */
  {
    id: 'a2-perfeito',
    level: 'A2',
    title: 'Pretérito perfeito simples',
    en: 'what happened — finished past',
    explain:
      'A finished action at a point in the past: falei, comi, parti. The irregulars are the ones you need first: fui (ser and ir share it), tive, fiz, estive, disse, pude, quis, vim.',
    examples: [
      {
        text: 'Ontem fui ao cinema.',
        gloss: 'Yesterday I went to the cinema.',
      },
      { text: 'Já comeste?', gloss: 'Have you eaten yet?' },
      { text: 'Fiz o trabalho de casa.', gloss: 'I did the homework.' },
    ],
  },
  {
    id: 'a2-imperfeito',
    level: 'A2',
    title: 'Pretérito imperfeito',
    en: 'used to, was doing, background',
    explain:
      'Habits and descriptions in the past, and the background to an event. In Portugal it also replaces the conditional in polite requests.',
    examples: [
      {
        text: 'Quando era pequeno, jogava futebol todos os dias.',
        gloss: 'When I was little I played football every day.',
      },
      {
        text: 'Queria um galão, por favor.',
        gloss: 'I’d like a galão, please.',
      },
    ],
  },
  {
    id: 'a2-perfeito-imperfeito',
    level: 'A2',
    title: 'Perfeito ou imperfeito?',
    en: 'choosing the past',
    explain:
      'Imperfeito paints the scene; perfeito is what happened in it. If you could add “at that moment, it was going on”, it is imperfeito.',
    examples: [
      {
        text: 'Estava a chover quando saí.',
        gloss: 'It was raining when I left.',
      },
      {
        text: 'Conheci-a quando vivia em Braga.',
        gloss: 'I met her when I was living in Braga.',
      },
    ],
  },
  {
    id: 'a2-enclise',
    level: 'A2',
    title: 'Pronomes depois do verbo',
    en: 'vejo-te, dei-lhe, comprá-lo',
    explain:
      'In a plain affirmative sentence the object pronoun goes after the verb with a hyphen. o/a become lo/la after -r, -s, -z (and the letter drops), and no/na after a nasal sound.',
    examples: [
      { text: 'Vejo-te amanhã.', gloss: 'See you tomorrow.' },
      { text: 'Dei-lhe o livro.', gloss: 'I gave him the book.' },
      { text: 'Vou comprá-lo.', gloss: 'I’m going to buy it.' },
    ],
  },
  {
    id: 'a2-proclise',
    level: 'A2',
    title: 'Pronomes antes do verbo',
    en: 'não te vejo — when it moves',
    explain:
      'Certain words pull the pronoun in front of the verb: não, nunca, já, também, só, ainda, question words, and que. This is where most learners’ Portuguese gives itself away.',
    examples: [
      {
        text: 'Não te vejo há semanas.',
        gloss: 'I haven’t seen you for weeks.',
      },
      { text: 'Já o comprei.', gloss: 'I’ve already bought it.' },
      { text: 'Quem te disse?', gloss: 'Who told you?' },
    ],
  },
  {
    id: 'a2-reflexivos',
    level: 'A2',
    title: 'Verbos reflexos',
    en: 'chamar-se, levantar-se',
    explain:
      'The action falls back on whoever does it; the pronoun matches the person — me, te, se, nos, se — and follows the same placement rules as any pronoun.',
    examples: [
      { text: 'Chamo-me Artem.', gloss: 'My name is Artem.' },
      { text: 'Levanto-me às sete.', gloss: 'I get up at seven.' },
      { text: 'Não me lembro.', gloss: 'I don’t remember.' },
    ],
  },
  {
    id: 'a2-comparativos',
    level: 'A2',
    title: 'Comparativos',
    en: 'mais… do que, tão… como',
    explain:
      'Mais/menos + adjective + do que; tão + adjective + como for equal. Four are irregular: melhor, pior, maior, menor. In Portugal “mais pequeno” is normal.',
    examples: [
      {
        text: 'O Porto é mais pequeno do que Lisboa.',
        gloss: 'Porto is smaller than Lisbon.',
      },
      {
        text: 'Este é o melhor pastel de nata da cidade.',
        gloss: 'This is the best pastel de nata in town.',
      },
    ],
  },
  {
    id: 'a2-por-para',
    level: 'A2',
    title: 'Por vs para',
    en: 'through, because of — or towards, for',
    explain:
      'Para points at a goal: destination, purpose, deadline, recipient. Por is the path or the cause: through, along, because of, in exchange for, by whom.',
    examples: [
      { text: 'Vou para casa.', gloss: 'I’m going home.' },
      { text: 'Passei pelo parque.', gloss: 'I went through the park.' },
      { text: 'Obrigado por tudo.', gloss: 'Thanks for everything.' },
    ],
  },
  {
    id: 'a2-imperativo',
    level: 'A2',
    title: 'Imperativo',
    en: 'telling someone to do something',
    explain:
      'For tu, use the present’s ele-form: fala, come, abre. For o senhor/você, use the subjunctive: fale, coma. Negatives always take the subjunctive (that comes at B1).',
    examples: [
      {
        text: 'Fala mais devagar, por favor.',
        gloss: 'Speak more slowly, please.',
      },
      { text: 'Espere um momento.', gloss: 'Wait a moment. (polite)' },
    ],
  },
  {
    id: 'a2-ha',
    level: 'A2',
    title: 'Há e há… que',
    en: 'there is, and “for / ago”',
    explain:
      'Há means “there is/are”. With time it means “ago” or, with the present, “for”: moro cá há dois anos — I’ve lived here for two years.',
    examples: [
      { text: 'Há um café aqui perto?', gloss: 'Is there a café near here?' },
      { text: 'Cheguei há uma hora.', gloss: 'I arrived an hour ago.' },
      {
        text: 'Aprendo português há um ano.',
        gloss: 'I’ve been learning Portuguese for a year.',
      },
    ],
  },

  /* ---------------------------------------------------------------- B1 */
  {
    id: 'b1-conjuntivo-presente',
    level: 'B1',
    title: 'Presente do conjuntivo',
    en: 'present subjunctive',
    explain:
      'The mood of wishes, doubt, feelings and “maybe”. Take the eu-form of the present, drop -o, swap the vowel: falo → fale, como → coma. Irregular: seja, esteja, tenha, vá, faça, saiba, queira, dê, haja.',
    examples: [
      { text: 'Espero que estejas bem.', gloss: 'I hope you’re well.' },
      { text: 'Talvez chova amanhã.', gloss: 'Maybe it’ll rain tomorrow.' },
      {
        text: 'É importante que saibas isto.',
        gloss: 'It’s important that you know this.',
      },
    ],
  },
  {
    id: 'b1-conjuntivo-conjuncoes',
    level: 'B1',
    title: 'Conjunções com conjuntivo',
    en: 'embora, para que, antes que…',
    explain:
      'Some linking words always take the subjunctive: embora, para que, antes que, até que, caso, sem que, desde que (as long as).',
    examples: [
      {
        text: 'Embora esteja cansado, vou treinar.',
        gloss: 'Although I’m tired, I’ll train.',
      },
      {
        text: 'Leva o casaco, caso faça frio.',
        gloss: 'Take your coat in case it gets cold.',
      },
    ],
  },
  {
    id: 'b1-imperativo-negativo',
    level: 'B1',
    title: 'Imperativo negativo',
    en: 'não faças, não se preocupe',
    explain:
      'Don’t-do-it is always the subjunctive, for tu too — and the pronoun comes before the verb because of não.',
    examples: [
      { text: 'Não te preocupes.', gloss: 'Don’t worry.' },
      { text: 'Não faças isso!', gloss: 'Don’t do that!' },
      {
        text: 'Não se esqueça do recibo.',
        gloss: 'Don’t forget the receipt. (polite)',
      },
    ],
  },
  {
    id: 'b1-perfeito-composto',
    level: 'B1',
    title: 'Pretérito perfeito composto',
    en: 'tenho feito — lately, over and over',
    explain:
      'Not English “I have done”. It means something repeated or continuing up to now. For one finished action, Portuguese uses the simple past.',
    examples: [
      {
        text: 'Tenho dormido mal.',
        gloss: 'I’ve been sleeping badly (lately).',
      },
      { text: 'Dormi mal.', gloss: 'I slept badly (last night).' },
      { text: 'Tens treinado?', gloss: 'Have you been training?' },
    ],
  },
  {
    id: 'b1-mais-que-perfeito',
    level: 'B1',
    title: 'Mais-que-perfeito composto',
    en: 'tinha feito — the past before the past',
    explain:
      'Imperfeito of ter + past participle, for something that had already happened before another past event.',
    examples: [
      {
        text: 'Quando cheguei, o comboio já tinha partido.',
        gloss: 'When I arrived, the train had already left.',
      },
      {
        text: 'Nunca tinha provado bacalhau.',
        gloss: 'I had never tried bacalhau.',
      },
    ],
  },
  {
    id: 'b1-futuro-condicional',
    level: 'B1',
    title: 'Futuro e condicional',
    en: 'falarei, falaria',
    explain:
      'Add -ei / -ia to the whole infinitive. Speech prefers ir + infinitive for the future and the imperfeito for “would”, but you must read and write both — and futuro also guesses: serão dez horas (it must be about ten).',
    examples: [
      {
        text: 'Gostaria de marcar uma reunião.',
        gloss: 'I would like to set up a meeting.',
      },
      { text: 'Podia ajudar-me?', gloss: 'Could you help me? (spoken)' },
    ],
  },
  {
    id: 'b1-relativos',
    level: 'B1',
    title: 'Pronomes relativos',
    en: 'que, quem, onde, o que, cujo',
    explain:
      'Que for almost everything; quem after a preposition for people; onde for places; o que for “what/which” about a whole idea; cujo for “whose”, agreeing with what is owned.',
    examples: [
      {
        text: 'O livro que me deste é ótimo.',
        gloss: 'The book you gave me is great.',
      },
      { text: 'A pessoa com quem falei.', gloss: 'The person I spoke to.' },
      {
        text: 'Não percebi o que disseste.',
        gloss: 'I didn’t catch what you said.',
      },
    ],
  },
  {
    id: 'b1-infinitivo-pessoal',
    level: 'B1',
    title: 'Infinitivo pessoal',
    en: 'an infinitive with a subject — only in Portuguese',
    explain:
      'The infinitive takes endings to say who: eu falar, tu falares, nós falarmos, eles falarem. Common after para, sem, depois de, antes de, and with “é + adjective”.',
    examples: [
      {
        text: 'É importante estudarmos todos os dias.',
        gloss: 'It’s important for us to study every day.',
      },
      {
        text: 'Liga-me depois de chegares.',
        gloss: 'Call me after you arrive.',
      },
    ],
  },
  {
    id: 'b1-passiva',
    level: 'B1',
    title: 'Voz passiva e “se”',
    en: 'foi construída, vende-se',
    explain:
      'Ser + participle, which agrees: a casa foi construída. For general rules and signs, se does it: vende-se, aluga-se, fala-se português.',
    examples: [
      {
        text: 'O mosteiro foi construído no século XVI.',
        gloss: 'The monastery was built in the 16th century.',
      },
      { text: 'Aqui não se fuma.', gloss: 'No smoking here.' },
    ],
  },

  /* ---------------------------------------------------------------- B2 */
  {
    id: 'b2-conjuntivo-imperfeito',
    level: 'B2',
    title: 'Imperfeito do conjuntivo',
    en: 'falasse — subjunctive in the past',
    explain:
      'From the eles-form of the simple past, drop -ram, add -sse: falaram → falasse, tiveram → tivesse, foram → fosse. Used when the trigger is in the past, and after se for unreal “if”.',
    examples: [
      {
        text: 'Queria que viesses à festa.',
        gloss: 'I wanted you to come to the party.',
      },
      {
        text: 'Se eu tivesse tempo, viajava mais.',
        gloss: 'If I had time, I’d travel more.',
      },
    ],
  },
  {
    id: 'b2-conjuntivo-futuro',
    level: 'B2',
    title: 'Futuro do conjuntivo',
    en: 'quando tiveres, se puder',
    explain:
      'The one English does not have: after quando, se, assim que, enquanto, logo que, when talking about the future. Same stem as the imperfeito subjunctive: tiver, fizer, for, puder, vier.',
    examples: [
      {
        text: 'Quando tiveres tempo, liga-me.',
        gloss: 'When you have time, call me.',
      },
      { text: 'Se puder, vou.', gloss: 'If I can, I’ll go.' },
      { text: 'Faz como quiseres.', gloss: 'Do as you like.' },
    ],
  },
  {
    id: 'b2-condicionais',
    level: 'B2',
    title: 'Frases condicionais',
    en: 'the three kinds of “if”',
    explain:
      'Real: se + futuro do conjuntivo → presente/futuro. Unreal now: se + imperfeito do conjuntivo → condicional (or imperfeito in speech). Unreal past: se + tivesse feito → teria (tinha) feito.',
    examples: [
      {
        text: 'Se chover, ficamos em casa.',
        gloss: 'If it rains, we’ll stay home.',
      },
      { text: 'Se soubesse, dizia-te.', gloss: 'If I knew, I’d tell you.' },
      {
        text: 'Se tivesse sabido, teria vindo.',
        gloss: 'If I’d known, I would have come.',
      },
    ],
  },
  {
    id: 'b2-conjuntivo-perfeito',
    level: 'B2',
    title: 'Perfeito do conjuntivo',
    en: 'tenha feito',
    explain:
      'Present subjunctive of ter + participle: a hope, doubt or feeling about something that may already have happened.',
    examples: [
      { text: 'Espero que tenhas gostado.', gloss: 'I hope you enjoyed it.' },
      {
        text: 'Não acredito que ele tenha dito isso.',
        gloss: 'I can’t believe he said that.',
      },
    ],
  },
  {
    id: 'b2-discurso-indireto',
    level: 'B2',
    title: 'Discurso indireto',
    en: 'he said that…',
    explain:
      'Reporting speech moves tenses back: presente → imperfeito, perfeito → mais-que-perfeito, futuro → condicional, and “here/today” become “there/that day”.',
    examples: [
      {
        text: 'Ele disse que vinha no dia seguinte.',
        gloss: 'He said he was coming the next day.',
      },
      {
        text: 'Perguntou-me se eu queria ir.',
        gloss: 'She asked me if I wanted to go.',
      },
    ],
  },
  {
    id: 'b2-pronomes-contraidos',
    level: 'B2',
    title: 'Pronomes contraídos',
    en: 'lho, mo, to',
    explain:
      'Indirect + direct pronoun fuse: lhe + o = lho, me + a = ma, te + os = tos. Very European — Brazilians avoid it.',
    examples: [
      {
        text: 'Deste-lhe o livro? Dei-lho.',
        gloss: 'Did you give him the book? I gave it to him.',
      },
      { text: 'Mostra-mo.', gloss: 'Show it to me.' },
    ],
  },
  {
    id: 'b2-perifrases',
    level: 'B2',
    title: 'Perífrases verbais',
    en: 'acabar de, voltar a, andar a…',
    explain:
      'Two-verb phrases that do the work of adverbs: acabar de (just did), voltar a (again), costumar (usually), andar a (have been doing lately), estar para (about to), deixar de (stop).',
    examples: [
      { text: 'Acabei de chegar.', gloss: 'I’ve just arrived.' },
      {
        text: 'Ando a ler um livro ótimo.',
        gloss: 'I’ve been reading a great book.',
      },
      { text: 'Deixei de fumar.', gloss: 'I quit smoking.' },
    ],
  },
  {
    id: 'b2-conectores',
    level: 'B2',
    title: 'Conectores',
    en: 'no entanto, aliás, portanto…',
    explain:
      'The words that make an argument hold together: no entanto / contudo (however), portanto (so), aliás (in fact, besides), ou seja (that is), visto que (since), apesar de (despite).',
    examples: [
      {
        text: 'É caro; no entanto, vale a pena.',
        gloss: 'It’s expensive; however, it’s worth it.',
      },
      {
        text: 'Não me apetece sair. Aliás, está a chover.',
        gloss: 'I don’t feel like going out. Besides, it’s raining.',
      },
    ],
  },
  {
    id: 'b2-ser-estar-adjetivos',
    level: 'B2',
    title: 'Ser e estar que mudam o sentido',
    en: 'é aborrecido vs está aborrecido',
    explain:
      'Some adjectives change meaning with the verb: ser aborrecido (boring) / estar aborrecido (bored or annoyed); ser esperto (clever) / estar esperto (awake); ser rico / estar rico.',
    examples: [
      { text: 'O filme é aborrecido.', gloss: 'The film is boring.' },
      { text: 'Estou aborrecido contigo.', gloss: 'I’m annoyed with you.' },
    ],
  },

  /* ---------------------------------------------------------------- C1 */
  {
    id: 'c1-conjuntivo-relativas',
    level: 'C1',
    title: 'Conjuntivo em relativas',
    en: 'alguém que fale…',
    explain:
      'When the thing described may not exist or is not known yet, the relative clause takes the subjunctive. Known and real takes the indicative.',
    examples: [
      {
        text: 'Procuro alguém que fale alemão.',
        gloss: 'I’m looking for someone who speaks German.',
      },
      {
        text: 'Não há nada que eu possa fazer.',
        gloss: 'There’s nothing I can do.',
      },
    ],
  },
  {
    id: 'c1-concordancia',
    level: 'C1',
    title: 'Concordância dos tempos',
    en: 'matching tenses in long sentences',
    explain:
      'The main verb’s tense sets the subjunctive’s: present → presente/perfeito do conjuntivo; past → imperfeito/mais-que-perfeito do conjuntivo.',
    examples: [
      {
        text: 'Duvido que ele tenha percebido.',
        gloss: 'I doubt he understood.',
      },
      {
        text: 'Duvidava que ele tivesse percebido.',
        gloss: 'I doubted he had understood.',
      },
    ],
  },
  {
    id: 'c1-infinitivo-ou-conjuntivo',
    level: 'C1',
    title: 'Infinitivo pessoal ou conjuntivo?',
    en: 'é bom vires / é bom que venhas',
    explain:
      'Often both are right; the personal infinitive is lighter and more spoken, the subjunctive more formal. Knowing when each sounds natural is a C1 skill.',
    examples: [
      { text: 'É bom vires cá.', gloss: 'It’s good that you’re coming.' },
      {
        text: 'É fundamental que os alunos compreendam.',
        gloss: 'It is essential that the students understand.',
      },
    ],
  },
  {
    id: 'c1-mesoclise',
    level: 'C1',
    title: 'Mesóclise',
    en: 'dir-te-ei — the pronoun inside the verb',
    explain:
      'In the future and conditional, a pronoun that would follow the verb goes inside it: dir-te-ei, far-se-ia. Formal writing only — in speech you avoid it with ir + infinitive.',
    examples: [
      { text: 'Dir-lhe-ei amanhã.', gloss: 'I shall tell him tomorrow.' },
      {
        text: 'Far-se-ia tudo para evitar isso.',
        gloss: 'Everything would be done to avoid that.',
      },
    ],
  },
  {
    id: 'c1-mais-que-perfeito-simples',
    level: 'C1',
    title: 'Mais-que-perfeito simples',
    en: 'falara — the literary past perfect',
    explain:
      'The one-word form of tinha feito, in books and newspapers: falara, fizera, fora. You need to recognise it; you rarely say it.',
    examples: [
      {
        text: 'Quando chegou, o sol já se pusera.',
        gloss: 'When he arrived, the sun had already set.',
      },
    ],
  },
  {
    id: 'c1-registo',
    level: 'C1',
    title: 'Registo',
    en: 'formal, neutral, casual',
    explain:
      'The same thing said to a friend, a colleague and an official: a gente vs nós, tipo and pá in speech, o senhor doutor and nominal forms in writing.',
    examples: [
      {
        text: 'Pá, a gente vê-se logo.',
        gloss: 'Mate, see you later. (casual)',
      },
      {
        text: 'Agradecia que me enviasse o documento.',
        gloss: 'I would be grateful if you sent me the document.',
      },
    ],
  },
  {
    id: 'c1-expressoes',
    level: 'C1',
    title: 'Expressões idiomáticas',
    en: 'what people actually say',
    explain:
      'Fixed phrases natives use without thinking. Knowing them is the difference between understanding a conversation and following it.',
    examples: [
      { text: 'Meti água.', gloss: 'I messed up.' },
      { text: 'Estou com os azeites.', gloss: 'I’m in a bad mood.' },
      {
        text: 'Quem vê caras não vê corações.',
        gloss: 'You can’t judge a book by its cover.',
      },
    ],
  },
  {
    id: 'c1-nominalizacao',
    level: 'C1',
    title: 'Nominalização',
    en: 'writing like a report',
    explain:
      'Formal Portuguese turns verbs into nouns: implementar → a implementação, decidir → a decisão. It lets you write long, precise, impersonal sentences.',
    examples: [
      {
        text: 'A implementação do projeto foi adiada.',
        gloss: 'The project’s implementation was postponed.',
      },
    ],
  },
]
