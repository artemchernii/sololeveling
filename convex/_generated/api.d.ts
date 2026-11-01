/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as accounts from "../accounts.js";
import type * as aggregate from "../aggregate.js";
import type * as ai_ask from "../ai/ask.js";
import type * as ai_ideas from "../ai/ideas.js";
import type * as ai_intake from "../ai/intake.js";
import type * as ai_market from "../ai/market.js";
import type * as ai_read from "../ai/read.js";
import type * as ai_rowsAsk from "../ai/rowsAsk.js";
import type * as ai_week from "../ai/week.js";
import type * as areas from "../areas.js";
import type * as askReplies from "../askReplies.js";
import type * as askReplyFields from "../askReplyFields.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as bank from "../bank.js";
import type * as bankApi from "../bankApi.js";
import type * as bankRows from "../bankRows.js";
import type * as bars from "../bars.js";
import type * as buysLanded from "../buysLanded.js";
import type * as closeReport from "../closeReport.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as drills from "../drills.js";
import type * as e2e from "../e2e.js";
import type * as e2eAccountUpdate from "../e2eAccountUpdate.js";
import type * as e2eBank from "../e2eBank.js";
import type * as e2eDemo from "../e2eDemo.js";
import type * as e2eFind from "../e2eFind.js";
import type * as e2eFirstRun from "../e2eFirstRun.js";
import type * as e2eFundamentals from "../e2eFundamentals.js";
import type * as e2eHead from "../e2eHead.js";
import type * as e2eHoldingsTotal from "../e2eHoldingsTotal.js";
import type * as e2eInvest from "../e2eInvest.js";
import type * as e2eMarketRead from "../e2eMarketRead.js";
import type * as e2eMine from "../e2eMine.js";
import type * as e2eMoney from "../e2eMoney.js";
import type * as e2ePortfolio from "../e2ePortfolio.js";
import type * as e2eRowsAsk from "../e2eRowsAsk.js";
import type * as e2eSignals from "../e2eSignals.js";
import type * as e2eTags from "../e2eTags.js";
import type * as e2eTargets from "../e2eTargets.js";
import type * as e2eToday from "../e2eToday.js";
import type * as e2eTransfer from "../e2eTransfer.js";
import type * as e2eUpdate from "../e2eUpdate.js";
import type * as events from "../events.js";
import type * as fake_story from "../fake/story.js";
import type * as fileNotice from "../fileNotice.js";
import type * as fileTrades from "../fileTrades.js";
import type * as files_batch from "../files/batch.js";
import type * as files_review from "../files/review.js";
import type * as files_shared from "../files/shared.js";
import type * as files_write from "../files/write.js";
import type * as fundamentals from "../fundamentals.js";
import type * as fundamentalsFields from "../fundamentalsFields.js";
import type * as gapMatch from "../gapMatch.js";
import type * as github from "../github.js";
import type * as goals from "../goals.js";
import type * as handOver from "../handOver.js";
import type * as holdingsKnown from "../holdingsKnown.js";
import type * as holdingsTotal from "../holdingsTotal.js";
import type * as ideasReadFields from "../ideasReadFields.js";
import type * as ideasReads from "../ideasReads.js";
import type * as insightsBoard from "../insightsBoard.js";
import type * as insightsIdeas from "../insightsIdeas.js";
import type * as insightsMarket from "../insightsMarket.js";
import type * as insightsMine from "../insightsMine.js";
import type * as intake from "../intake.js";
import type * as invest from "../invest.js";
import type * as justAdded from "../justAdded.js";
import type * as ledgers from "../ledgers.js";
import type * as lent from "../lent.js";
import type * as logs from "../logs.js";
import type * as market from "../market.js";
import type * as marketAsk from "../marketAsk.js";
import type * as marketReadFields from "../marketReadFields.js";
import type * as marketReads from "../marketReads.js";
import type * as marketSources_companies from "../marketSources/companies.js";
import type * as marketSources_crowd from "../marketSources/crowd.js";
import type * as marketSources_funds from "../marketSources/funds.js";
import type * as marketSources_movers from "../marketSources/movers.js";
import type * as marketSources_opportunities from "../marketSources/opportunities.js";
import type * as migrations from "../migrations.js";
import type * as milestones from "../milestones.js";
import type * as money from "../money.js";
import type * as moneyAlerts from "../moneyAlerts.js";
import type * as news from "../news.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as payees from "../payees.js";
import type * as priceYears from "../priceYears.js";
import type * as prices from "../prices.js";
import type * as principles from "../principles.js";
import type * as profiles from "../profiles.js";
import type * as projects from "../projects.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as reads_limits from "../reads/limits.js";
import type * as reads_moves from "../reads/moves.js";
import type * as reads_positions from "../reads/positions.js";
import type * as reads_week from "../reads/week.js";
import type * as recurring from "../recurring.js";
import type * as repo from "../repo.js";
import type * as reviews from "../reviews.js";
import type * as rowBalance from "../rowBalance.js";
import type * as rowsAsk from "../rowsAsk.js";
import type * as search from "../search.js";
import type * as sector from "../sector.js";
import type * as seed from "../seed.js";
import type * as sharesCheck from "../sharesCheck.js";
import type * as sheetRows from "../sheetRows.js";
import type * as state from "../state.js";
import type * as t212 from "../t212.js";
import type * as t212Api from "../t212Api.js";
import type * as t212Held from "../t212Held.js";
import type * as t212History from "../t212History.js";
import type * as targets from "../targets.js";
import type * as tasks from "../tasks.js";
import type * as transferMatch from "../transferMatch.js";
import type * as typedBalance from "../typedBalance.js";
import type * as undoFile from "../undoFile.js";
import type * as vault from "../vault.js";
import type * as weekReads from "../weekReads.js";
import type * as why from "../why.js";
import type * as write from "../write.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  accounts: typeof accounts;
  aggregate: typeof aggregate;
  "ai/ask": typeof ai_ask;
  "ai/ideas": typeof ai_ideas;
  "ai/intake": typeof ai_intake;
  "ai/market": typeof ai_market;
  "ai/read": typeof ai_read;
  "ai/rowsAsk": typeof ai_rowsAsk;
  "ai/week": typeof ai_week;
  areas: typeof areas;
  askReplies: typeof askReplies;
  askReplyFields: typeof askReplyFields;
  attachments: typeof attachments;
  auth: typeof auth;
  bank: typeof bank;
  bankApi: typeof bankApi;
  bankRows: typeof bankRows;
  bars: typeof bars;
  buysLanded: typeof buysLanded;
  closeReport: typeof closeReport;
  crons: typeof crons;
  demo: typeof demo;
  drills: typeof drills;
  e2e: typeof e2e;
  e2eAccountUpdate: typeof e2eAccountUpdate;
  e2eBank: typeof e2eBank;
  e2eDemo: typeof e2eDemo;
  e2eFind: typeof e2eFind;
  e2eFirstRun: typeof e2eFirstRun;
  e2eFundamentals: typeof e2eFundamentals;
  e2eHead: typeof e2eHead;
  e2eHoldingsTotal: typeof e2eHoldingsTotal;
  e2eInvest: typeof e2eInvest;
  e2eMarketRead: typeof e2eMarketRead;
  e2eMine: typeof e2eMine;
  e2eMoney: typeof e2eMoney;
  e2ePortfolio: typeof e2ePortfolio;
  e2eRowsAsk: typeof e2eRowsAsk;
  e2eSignals: typeof e2eSignals;
  e2eTags: typeof e2eTags;
  e2eTargets: typeof e2eTargets;
  e2eToday: typeof e2eToday;
  e2eTransfer: typeof e2eTransfer;
  e2eUpdate: typeof e2eUpdate;
  events: typeof events;
  "fake/story": typeof fake_story;
  fileNotice: typeof fileNotice;
  fileTrades: typeof fileTrades;
  "files/batch": typeof files_batch;
  "files/review": typeof files_review;
  "files/shared": typeof files_shared;
  "files/write": typeof files_write;
  fundamentals: typeof fundamentals;
  fundamentalsFields: typeof fundamentalsFields;
  gapMatch: typeof gapMatch;
  github: typeof github;
  goals: typeof goals;
  handOver: typeof handOver;
  holdingsKnown: typeof holdingsKnown;
  holdingsTotal: typeof holdingsTotal;
  ideasReadFields: typeof ideasReadFields;
  ideasReads: typeof ideasReads;
  insightsBoard: typeof insightsBoard;
  insightsIdeas: typeof insightsIdeas;
  insightsMarket: typeof insightsMarket;
  insightsMine: typeof insightsMine;
  intake: typeof intake;
  invest: typeof invest;
  justAdded: typeof justAdded;
  ledgers: typeof ledgers;
  lent: typeof lent;
  logs: typeof logs;
  market: typeof market;
  marketAsk: typeof marketAsk;
  marketReadFields: typeof marketReadFields;
  marketReads: typeof marketReads;
  "marketSources/companies": typeof marketSources_companies;
  "marketSources/crowd": typeof marketSources_crowd;
  "marketSources/funds": typeof marketSources_funds;
  "marketSources/movers": typeof marketSources_movers;
  "marketSources/opportunities": typeof marketSources_opportunities;
  migrations: typeof migrations;
  milestones: typeof milestones;
  money: typeof money;
  moneyAlerts: typeof moneyAlerts;
  news: typeof news;
  notes: typeof notes;
  notifications: typeof notifications;
  payees: typeof payees;
  priceYears: typeof priceYears;
  prices: typeof prices;
  principles: typeof principles;
  profiles: typeof profiles;
  projects: typeof projects;
  push: typeof push;
  pushNode: typeof pushNode;
  "reads/limits": typeof reads_limits;
  "reads/moves": typeof reads_moves;
  "reads/positions": typeof reads_positions;
  "reads/week": typeof reads_week;
  recurring: typeof recurring;
  repo: typeof repo;
  reviews: typeof reviews;
  rowBalance: typeof rowBalance;
  rowsAsk: typeof rowsAsk;
  search: typeof search;
  sector: typeof sector;
  seed: typeof seed;
  sharesCheck: typeof sharesCheck;
  sheetRows: typeof sheetRows;
  state: typeof state;
  t212: typeof t212;
  t212Api: typeof t212Api;
  t212Held: typeof t212Held;
  t212History: typeof t212History;
  targets: typeof targets;
  tasks: typeof tasks;
  transferMatch: typeof transferMatch;
  typedBalance: typeof typedBalance;
  undoFile: typeof undoFile;
  vault: typeof vault;
  weekReads: typeof weekReads;
  why: typeof why;
  write: typeof write;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
