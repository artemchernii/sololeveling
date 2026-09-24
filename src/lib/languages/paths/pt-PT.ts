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
        pt: 'A Marta é médica e é do Porto.',
        en: 'Marta is a doctor and she’s from Porto.',
      },
      { pt: 'Estou cansado hoje.', en: 'I’m tired today.' },
      { pt: 'O café está frio.', en: 'The coffee is (has gone) cold.' },
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
        pt: 'Moro em Lisboa há um ano.',
        en: 'I’ve lived in Lisbon for a year.',
      },
      { pt: 'Comes carne?', en: 'Do you eat meat?' },
      { pt: 'Nós partimos amanhã cedo.', en: 'We leave early tomorrow.' },
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
      { pt: 'Tenho fome.', en: 'I’m hungry.' },
      {
        pt: 'Vou ao ginásio depois do trabalho.',
        en: 'I go to the gym after work.',
      },
      { pt: 'Não sei o que queres dizer.', en: 'I don’t know what you mean.' },
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
      { pt: 'A Ana chegou.', en: 'Ana has arrived.' },
      { pt: 'Um problema, uma solução.', en: 'A problem, a solution.' },
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
      { pt: 'Estou no escritório.', en: 'I’m at the office.' },
      { pt: 'Vou ao mercado.', en: 'I’m going to the market.' },
      { pt: 'Passei pela praia.', en: 'I went past the beach.' },
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
      { pt: 'Queres um café?', en: 'Do you want a coffee? (to a friend)' },
      { pt: 'Deseja mais alguma coisa?', en: 'Anything else? (to a customer)' },
      {
        pt: 'O senhor sabe onde fica a estação?',
        en: 'Do you know where the station is, sir?',
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
        pt: 'Estou a trabalhar, ligo-te depois.',
        en: 'I’m working, I’ll call you later.',
      },
      { pt: 'O que estás a fazer?', en: 'What are you doing?' },
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
      { pt: 'A minha irmã mora no Porto.', en: 'My sister lives in Porto.' },
      { pt: 'O carro dele é novo.', en: 'His car is new.' },
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
      { pt: 'Onde é que moras?', en: 'Where do you live?' },
      { pt: 'Não percebo.', en: 'I don’t understand.' },
      { pt: 'Porquê? Porque estou cansado.', en: 'Why? Because I’m tired.' },
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
      { pt: 'Vou jantar fora hoje.', en: 'I’m going to eat out tonight.' },
      { pt: 'Vamos ver.', en: 'We’ll see.' },
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
      { pt: 'Ontem fui ao cinema.', en: 'Yesterday I went to the cinema.' },
      { pt: 'Já comeste?', en: 'Have you eaten yet?' },
      { pt: 'Fiz o trabalho de casa.', en: 'I did the homework.' },
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
        pt: 'Quando era pequeno, jogava futebol todos os dias.',
        en: 'When I was little I played football every day.',
      },
      { pt: 'Queria um galão, por favor.', en: 'I’d like a galão, please.' },
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
      { pt: 'Estava a chover quando saí.', en: 'It was raining when I left.' },
      {
        pt: 'Conheci-a quando vivia em Braga.',
        en: 'I met her when I was living in Braga.',
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
      { pt: 'Vejo-te amanhã.', en: 'See you tomorrow.' },
      { pt: 'Dei-lhe o livro.', en: 'I gave him the book.' },
      { pt: 'Vou comprá-lo.', en: 'I’m going to buy it.' },
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
      { pt: 'Não te vejo há semanas.', en: 'I haven’t seen you for weeks.' },
      { pt: 'Já o comprei.', en: 'I’ve already bought it.' },
      { pt: 'Quem te disse?', en: 'Who told you?' },
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
      { pt: 'Chamo-me Artem.', en: 'My name is Artem.' },
      { pt: 'Levanto-me às sete.', en: 'I get up at seven.' },
      { pt: 'Não me lembro.', en: 'I don’t remember.' },
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
        pt: 'O Porto é mais pequeno do que Lisboa.',
        en: 'Porto is smaller than Lisbon.',
      },
      {
        pt: 'Este é o melhor pastel de nata da cidade.',
        en: 'This is the best pastel de nata in town.',
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
      { pt: 'Vou para casa.', en: 'I’m going home.' },
      { pt: 'Passei pelo parque.', en: 'I went through the park.' },
      { pt: 'Obrigado por tudo.', en: 'Thanks for everything.' },
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
      { pt: 'Fala mais devagar, por favor.', en: 'Speak more slowly, please.' },
      { pt: 'Espere um momento.', en: 'Wait a moment. (polite)' },
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
      { pt: 'Há um café aqui perto?', en: 'Is there a café near here?' },
      { pt: 'Cheguei há uma hora.', en: 'I arrived an hour ago.' },
      {
        pt: 'Aprendo português há um ano.',
        en: 'I’ve been learning Portuguese for a year.',
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
      { pt: 'Espero que estejas bem.', en: 'I hope you’re well.' },
      { pt: 'Talvez chova amanhã.', en: 'Maybe it’ll rain tomorrow.' },
      {
        pt: 'É importante que saibas isto.',
        en: 'It’s important that you know this.',
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
        pt: 'Embora esteja cansado, vou treinar.',
        en: 'Although I’m tired, I’ll train.',
      },
      {
        pt: 'Leva o casaco, caso faça frio.',
        en: 'Take your coat in case it gets cold.',
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
      { pt: 'Não te preocupes.', en: 'Don’t worry.' },
      { pt: 'Não faças isso!', en: 'Don’t do that!' },
      {
        pt: 'Não se esqueça do recibo.',
        en: 'Don’t forget the receipt. (polite)',
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
      { pt: 'Tenho dormido mal.', en: 'I’ve been sleeping badly (lately).' },
      { pt: 'Dormi mal.', en: 'I slept badly (last night).' },
      { pt: 'Tens treinado?', en: 'Have you been training?' },
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
        pt: 'Quando cheguei, o comboio já tinha partido.',
        en: 'When I arrived, the train had already left.',
      },
      {
        pt: 'Nunca tinha provado bacalhau.',
        en: 'I had never tried bacalhau.',
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
        pt: 'Gostaria de marcar uma reunião.',
        en: 'I would like to set up a meeting.',
      },
      { pt: 'Podia ajudar-me?', en: 'Could you help me? (spoken)' },
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
        pt: 'O livro que me deste é ótimo.',
        en: 'The book you gave me is great.',
      },
      { pt: 'A pessoa com quem falei.', en: 'The person I spoke to.' },
      {
        pt: 'Não percebi o que disseste.',
        en: 'I didn’t catch what you said.',
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
        pt: 'É importante estudarmos todos os dias.',
        en: 'It’s important for us to study every day.',
      },
      { pt: 'Liga-me depois de chegares.', en: 'Call me after you arrive.' },
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
        pt: 'O mosteiro foi construído no século XVI.',
        en: 'The monastery was built in the 16th century.',
      },
      { pt: 'Aqui não se fuma.', en: 'No smoking here.' },
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
        pt: 'Queria que viesses à festa.',
        en: 'I wanted you to come to the party.',
      },
      {
        pt: 'Se eu tivesse tempo, viajava mais.',
        en: 'If I had time, I’d travel more.',
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
        pt: 'Quando tiveres tempo, liga-me.',
        en: 'When you have time, call me.',
      },
      { pt: 'Se puder, vou.', en: 'If I can, I’ll go.' },
      { pt: 'Faz como quiseres.', en: 'Do as you like.' },
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
        pt: 'Se chover, ficamos em casa.',
        en: 'If it rains, we’ll stay home.',
      },
      { pt: 'Se soubesse, dizia-te.', en: 'If I knew, I’d tell you.' },
      {
        pt: 'Se tivesse sabido, teria vindo.',
        en: 'If I’d known, I would have come.',
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
      { pt: 'Espero que tenhas gostado.', en: 'I hope you enjoyed it.' },
      {
        pt: 'Não acredito que ele tenha dito isso.',
        en: 'I can’t believe he said that.',
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
        pt: 'Ele disse que vinha no dia seguinte.',
        en: 'He said he was coming the next day.',
      },
      {
        pt: 'Perguntou-me se eu queria ir.',
        en: 'She asked me if I wanted to go.',
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
        pt: 'Deste-lhe o livro? Dei-lho.',
        en: 'Did you give him the book? I gave it to him.',
      },
      { pt: 'Mostra-mo.', en: 'Show it to me.' },
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
      { pt: 'Acabei de chegar.', en: 'I’ve just arrived.' },
      {
        pt: 'Ando a ler um livro ótimo.',
        en: 'I’ve been reading a great book.',
      },
      { pt: 'Deixei de fumar.', en: 'I quit smoking.' },
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
        pt: 'É caro; no entanto, vale a pena.',
        en: 'It’s expensive; however, it’s worth it.',
      },
      {
        pt: 'Não me apetece sair. Aliás, está a chover.',
        en: 'I don’t feel like going out. Besides, it’s raining.',
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
      { pt: 'O filme é aborrecido.', en: 'The film is boring.' },
      { pt: 'Estou aborrecido contigo.', en: 'I’m annoyed with you.' },
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
        pt: 'Procuro alguém que fale alemão.',
        en: 'I’m looking for someone who speaks German.',
      },
      {
        pt: 'Não há nada que eu possa fazer.',
        en: 'There’s nothing I can do.',
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
      { pt: 'Duvido que ele tenha percebido.', en: 'I doubt he understood.' },
      {
        pt: 'Duvidava que ele tivesse percebido.',
        en: 'I doubted he had understood.',
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
      { pt: 'É bom vires cá.', en: 'It’s good that you’re coming.' },
      {
        pt: 'É fundamental que os alunos compreendam.',
        en: 'It is essential that the students understand.',
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
      { pt: 'Dir-lhe-ei amanhã.', en: 'I shall tell him tomorrow.' },
      {
        pt: 'Far-se-ia tudo para evitar isso.',
        en: 'Everything would be done to avoid that.',
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
        pt: 'Quando chegou, o sol já se pusera.',
        en: 'When he arrived, the sun had already set.',
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
      { pt: 'Pá, a gente vê-se logo.', en: 'Mate, see you later. (casual)' },
      {
        pt: 'Agradecia que me enviasse o documento.',
        en: 'I would be grateful if you sent me the document.',
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
      { pt: 'Meti água.', en: 'I messed up.' },
      { pt: 'Estou com os azeites.', en: 'I’m in a bad mood.' },
      {
        pt: 'Quem vê caras não vê corações.',
        en: 'You can’t judge a book by its cover.',
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
        pt: 'A implementação do projeto foi adiada.',
        en: 'The project’s implementation was postponed.',
      },
    ],
  },
]
