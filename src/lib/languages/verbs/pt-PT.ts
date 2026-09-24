import { pt } from './types'
import type { Verb } from './types'

/* The verbs you use most in Portugal. Regular ones are built from their
   endings; the irregular ones give, by hand, only the tenses that break the
   pattern. Order: the irregulars you cannot live without, then the regulars. */

export const PT_PT_VERBS: ReadonlyArray<Verb> = [
  pt('ser', 'to be (what something is)', {
    presente: ['sou', 'és', 'é', 'somos', 'são'],
    perfeito: ['fui', 'foste', 'foi', 'fomos', 'foram'],
    imperfeito: ['era', 'eras', 'era', 'éramos', 'eram'],
    conjuntivo: ['seja', 'sejas', 'seja', 'sejamos', 'sejam'],
  }),
  pt('estar', 'to be (how or where, now)', {
    presente: ['estou', 'estás', 'está', 'estamos', 'estão'],
    perfeito: ['estive', 'estiveste', 'esteve', 'estivemos', 'estiveram'],
    conjuntivo: ['esteja', 'estejas', 'esteja', 'estejamos', 'estejam'],
  }),
  pt('ter', 'to have', {
    presente: ['tenho', 'tens', 'tem', 'temos', 'têm'],
    perfeito: ['tive', 'tiveste', 'teve', 'tivemos', 'tiveram'],
    imperfeito: ['tinha', 'tinhas', 'tinha', 'tínhamos', 'tinham'],
    conjuntivo: ['tenha', 'tenhas', 'tenha', 'tenhamos', 'tenham'],
  }),
  pt('ir', 'to go', {
    presente: ['vou', 'vais', 'vai', 'vamos', 'vão'],
    perfeito: ['fui', 'foste', 'foi', 'fomos', 'foram'],
    conjuntivo: ['vá', 'vás', 'vá', 'vamos', 'vão'],
  }),
  pt('fazer', 'to do, to make', {
    presente: ['faço', 'fazes', 'faz', 'fazemos', 'fazem'],
    perfeito: ['fiz', 'fizeste', 'fez', 'fizemos', 'fizeram'],
    conjuntivo: ['faça', 'faças', 'faça', 'façamos', 'façam'],
  }),
  pt('poder', 'can, to be able to', {
    presente: ['posso', 'podes', 'pode', 'podemos', 'podem'],
    perfeito: ['pude', 'pudeste', 'pôde', 'pudemos', 'puderam'],
    conjuntivo: ['possa', 'possas', 'possa', 'possamos', 'possam'],
  }),
  pt('querer', 'to want', {
    presente: ['quero', 'queres', 'quer', 'queremos', 'querem'],
    perfeito: ['quis', 'quiseste', 'quis', 'quisemos', 'quiseram'],
    conjuntivo: ['queira', 'queiras', 'queira', 'queiramos', 'queiram'],
  }),
  pt('dizer', 'to say, to tell', {
    presente: ['digo', 'dizes', 'diz', 'dizemos', 'dizem'],
    perfeito: ['disse', 'disseste', 'disse', 'dissemos', 'disseram'],
    conjuntivo: ['diga', 'digas', 'diga', 'digamos', 'digam'],
  }),
  pt('vir', 'to come', {
    presente: ['venho', 'vens', 'vem', 'vimos', 'vêm'],
    perfeito: ['vim', 'vieste', 'veio', 'viemos', 'vieram'],
    imperfeito: ['vinha', 'vinhas', 'vinha', 'vínhamos', 'vinham'],
    conjuntivo: ['venha', 'venhas', 'venha', 'venhamos', 'venham'],
  }),
  pt('ver', 'to see', {
    presente: ['vejo', 'vês', 'vê', 'vemos', 'veem'],
    perfeito: ['vi', 'viste', 'viu', 'vimos', 'viram'],
    conjuntivo: ['veja', 'vejas', 'veja', 'vejamos', 'vejam'],
  }),
  pt('dar', 'to give', {
    presente: ['dou', 'dás', 'dá', 'damos', 'dão'],
    perfeito: ['dei', 'deste', 'deu', 'demos', 'deram'],
    conjuntivo: ['dê', 'dês', 'dê', 'demos', 'deem'],
  }),
  pt('saber', 'to know (a fact), to know how', {
    presente: ['sei', 'sabes', 'sabe', 'sabemos', 'sabem'],
    perfeito: ['soube', 'soubeste', 'soube', 'soubemos', 'souberam'],
    conjuntivo: ['saiba', 'saibas', 'saiba', 'saibamos', 'saibam'],
  }),
  pt('conhecer', 'to know (a person, a place)', {
    presente: ['conheço', 'conheces', 'conhece', 'conhecemos', 'conhecem'],
    conjuntivo: ['conheça', 'conheças', 'conheça', 'conheçamos', 'conheçam'],
  }),
  pt('pôr', 'to put', {
    presente: ['ponho', 'pões', 'põe', 'pomos', 'põem'],
    perfeito: ['pus', 'puseste', 'pôs', 'pusemos', 'puseram'],
    imperfeito: ['punha', 'punhas', 'punha', 'púnhamos', 'punham'],
    conjuntivo: ['ponha', 'ponhas', 'ponha', 'ponhamos', 'ponham'],
  }),
  pt('trazer', 'to bring', {
    presente: ['trago', 'trazes', 'traz', 'trazemos', 'trazem'],
    perfeito: ['trouxe', 'trouxeste', 'trouxe', 'trouxemos', 'trouxeram'],
    conjuntivo: ['traga', 'tragas', 'traga', 'tragamos', 'tragam'],
  }),
  pt('sair', 'to go out, to leave', {
    presente: ['saio', 'sais', 'sai', 'saímos', 'saem'],
    perfeito: ['saí', 'saíste', 'saiu', 'saímos', 'saíram'],
    imperfeito: ['saía', 'saías', 'saía', 'saíamos', 'saíam'],
    conjuntivo: ['saia', 'saias', 'saia', 'saiamos', 'saiam'],
  }),
  pt('ler', 'to read', {
    presente: ['leio', 'lês', 'lê', 'lemos', 'leem'],
    perfeito: ['li', 'leste', 'leu', 'lemos', 'leram'],
    conjuntivo: ['leia', 'leias', 'leia', 'leiamos', 'leiam'],
  }),
  pt('pedir', 'to ask for, to order', {
    presente: ['peço', 'pedes', 'pede', 'pedimos', 'pedem'],
    conjuntivo: ['peça', 'peças', 'peça', 'peçamos', 'peçam'],
  }),
  pt('ouvir', 'to hear, to listen', {
    presente: ['ouço', 'ouves', 'ouve', 'ouvimos', 'ouvem'],
    conjuntivo: ['ouça', 'ouças', 'ouça', 'ouçamos', 'ouçam'],
  }),
  pt('dormir', 'to sleep', {
    presente: ['durmo', 'dormes', 'dorme', 'dormimos', 'dormem'],
    conjuntivo: ['durma', 'durmas', 'durma', 'durmamos', 'durmam'],
  }),
  pt('ficar', 'to stay; to be (located); to become', {
    perfeito: ['fiquei', 'ficaste', 'ficou', 'ficámos', 'ficaram'],
    conjuntivo: ['fique', 'fiques', 'fique', 'fiquemos', 'fiquem'],
  }),
  pt('chegar', 'to arrive', {
    perfeito: ['cheguei', 'chegaste', 'chegou', 'chegámos', 'chegaram'],
    conjuntivo: ['chegue', 'chegues', 'chegue', 'cheguemos', 'cheguem'],
  }),
  pt('começar', 'to begin', {
    perfeito: ['comecei', 'começaste', 'começou', 'começámos', 'começaram'],
    conjuntivo: ['comece', 'comeces', 'comece', 'comecemos', 'comecem'],
  }),
  pt('falar', 'to speak'),
  pt('perceber', 'to understand (Portugal’s everyday word)'),
  pt('morar', 'to live (somewhere)'),
  pt('viver', 'to live'),
  pt('trabalhar', 'to work'),
  pt('estudar', 'to study'),
  pt('aprender', 'to learn'),
  pt('gostar', 'to like (gostar de)'),
  pt('precisar', 'to need (precisar de)'),
  pt('comprar', 'to buy'),
  pt('comer', 'to eat'),
  pt('beber', 'to drink'),
  pt('escrever', 'to write'),
  pt('abrir', 'to open'),
  pt('partir', 'to leave; to break'),
  pt('decidir', 'to decide'),
  pt('esperar', 'to wait; to hope'),
  pt('levar', 'to take, to carry'),
  pt('deixar', 'to leave (something); to let'),
  pt('ajudar', 'to help'),
  pt('pensar', 'to think'),
  pt('encontrar', 'to find; to meet'),
  pt('tomar', 'to take (a coffee, a bus, a decision)'),
  pt('usar', 'to use'),
  pt('responder', 'to answer'),
  pt('vender', 'to sell'),
  pt('correr', 'to run'),
  pt('assistir', 'to watch; to attend (assistir a)'),
]
