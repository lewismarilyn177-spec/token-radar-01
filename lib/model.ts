export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  age_weight: number;
  age_max_years: number;
  age_fallback_years: number;
  chain_distinct_bonus: number;
  chain_major_bonus: number;
  chain_weight_cap: number;
  clamp_min_usd: number;
  clamp_tvl_share: number;
  clamp_max_usd: number;
  peer_count: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.5,
  momentum_floor: -0.5,
  momentum_cap: 2,
  age_weight: 0.08,
  age_max_years: 6,
  age_fallback_years: 3,
  chain_distinct_bonus: 0.04,
  chain_major_bonus: 0.06,
  chain_weight_cap: 1.6,
  clamp_min_usd: 1_000_000,
  clamp_tvl_share: 0.2,
  clamp_max_usd: 100_000_000_000_000,
  peer_count: 5,
};

export const MODEL_VERSION = 'radar-2';

export const LIVE_ROWS = 24;

export const MAJOR_CHAINS = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'BSC', 'Optimism', 'Polygon'];

export interface Percentiles {
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

export interface Peer {
  slug: string;
  name: string;
  mcap_usd: number;
  multiple: number;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  scenario_low: number;
  scenario_mid: number;
  scenario_high: number;
  model: {
    category_percentile_p25: number;
    category_percentile_p50: number;
    category_percentile_p75: number;
    chain_weight: number;
    momentum: number;
    age_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  scenario_low: number;
  scenario_mid: number;
  scenario_high: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface ModelMetadata {
  version: string;
  as_of: string;
  floor_usd: number;
  formula: string;
  category_percentiles: Record<string, Percentiles>;
  global_percentiles: Percentiles;
  constants: ModelConstants;
  major_chains: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  peers: Record<string, Peer[]>;
  model: ModelMetadata;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const MAJOR_CHAIN_SET = new Set(MAJOR_CHAINS.map((c) => c.toLowerCase()));

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function yearsSinceListed(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (a - b) / (365 * DAY_MS));
}

export function momentum(change7d: number | null, model: ModelConstants = MODEL): number {
  const growth = finite(change7d, 0) / 100;
  const clamped = Math.max(model.momentum_floor, Math.min(model.momentum_cap, growth));
  return 1 + clamped * model.momentum_weight;
}

export function ageMultiplier(asOf: string, listedAt: string | null, model: ModelConstants = MODEL): number {
  const years = yearsSinceListed(asOf, listedAt);
  const yearsForModel = years ?? model.age_fallback_years;
  return 1 + Math.min(Math.max(yearsForModel, 0), model.age_max_years) * model.age_weight;
}

export function chainWeight(chains: string[], model: ModelConstants = MODEL): number {
  const distinct = new Set(chains.map((c) => c.trim().toLowerCase())).size;
  const major = new Set(chains.map((c) => c.trim().toLowerCase()).filter((c) => MAJOR_CHAIN_SET.has(c))).size;
  const distinctBonus = model.chain_distinct_bonus * Math.max(0, Math.min(distinct, model.age_max_years) - 1);
  const majorBonus = model.chain_major_bonus * Math.min(major, model.age_max_years);
  return Math.min(model.chain_weight_cap, 1 + distinctBonus + majorBonus);
}

function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p25: quantileSorted(sorted, 0.25),
    p50: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
  };
}

function categoryKey(category: string | null): string {
  return category ?? 'Other';
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

interface TokenBearer {
  protocol: SnapshotProtocol;
  multiple: number;
}

function tokenBearers(snapshot: Snapshot): TokenBearer[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && p.tvl_usd > 0)
    .map((p) => ({ protocol: p, multiple: p.mcap_usd as number / p.tvl_usd }));
}

function multipleModel(snapshot: Snapshot): { categories: Record<string, Percentiles>; global: Percentiles; bearers: TokenBearer[] } {
  const bearers = tokenBearers(snapshot);
  const global = percentiles(bearers.map((b) => b.multiple));
  const grouped = new Map<string, number[]>();
  for (const bearer of bearers) {
    const key = categoryKey(bearer.protocol.category);
    const list = grouped.get(key);
    if (list === undefined) grouped.set(key, [bearer.multiple]);
    else list.push(bearer.multiple);
  }
  const categories: Record<string, Percentiles> = {};
  for (const [key, values] of grouped) categories[key] = percentiles(values);
  return { categories, global, bearers };
}

interface Score {
  implied: number;
  low: number;
  mid: number;
  high: number;
  percentiles: Percentiles;
  weight: number;
  momentumValue: number;
  ageMultiplierValue: number;
  age: number | null;
}

function scoreProtocol(p: SnapshotProtocol, snapshot: Snapshot, model: ModelConstants, categories: Record<string, Percentiles>, global: Percentiles): Score {
  const ps = categories[categoryKey(p.category)] ?? global;
  const weight = chainWeight(p.chains, model);
  const mom = momentum(p.change_7d, model);
  const ageMult = ageMultiplier(snapshot.as_of, p.listed_at, model);
  const age = ageDays(snapshot.as_of, p.listed_at);
  const lower = Math.max(model.clamp_min_usd, Math.round(p.tvl_usd * model.clamp_tvl_share));
  const clamp = (raw: number): number => Math.min(model.clamp_max_usd, Math.max(lower, Math.round(raw)));
  const factor = weight * mom * ageMult;
  const implied = clamp(p.tvl_usd * ps.p50 * factor);
  const degenerate = ps.p25 === ps.p75;
  const lowMultiple = degenerate && global.p50 > 0 ? ps.p50 * (global.p25 / global.p50) : ps.p25;
  const highMultiple = degenerate && global.p50 > 0 ? ps.p50 * (global.p75 / global.p50) : ps.p75;
  const lowRaw = clamp(p.tvl_usd * lowMultiple * factor);
  const highRaw = clamp(p.tvl_usd * highMultiple * factor);
  return {
    implied,
    low: lowRaw < implied ? lowRaw : implied - 1,
    mid: implied,
    high: highRaw > implied ? highRaw : implied + 1,
    percentiles: ps,
    weight,
    momentumValue: mom,
    ageMultiplierValue: ageMult,
    age,
  };
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const slugOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  const watchlist = new Set(snapshot.watchlist);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols.filter(
    (p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd < snapshot.floor_usd,
  );
  for (const p of early) chosen.set(p.slug, p);

  const { categories, global } = multipleModel(snapshot);
  const scored = [...chosen.values()].map((p) => ({ protocol: p, score: scoreProtocol(p, snapshot, model, categories, global) }));
  scored.sort(
    (a, b) =>
      b.score.implied - a.score.implied ||
      b.protocol.tvl_usd - a.protocol.tvl_usd ||
      slugOrder(a.protocol.slug, b.protocol.slug),
  );

  return scored.map((entry, i) => {
    const p = entry.protocol;
    const s = entry.score;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      on_watchlist: watchlist.has(p.slug),
      scenario_low: s.low,
      scenario_mid: s.mid,
      scenario_high: s.high,
      model: {
        category_percentile_p25: s.percentiles.p25,
        category_percentile_p50: s.percentiles.p50,
        category_percentile_p75: s.percentiles.p75,
        chain_weight: round4(s.weight),
        momentum: round4(s.momentumValue),
        age_multiplier: round4(s.ageMultiplierValue),
        age_days: s.age,
      },
      farm_steps: farmSteps(p, s.age).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function gasFor(p: SnapshotProtocol, capital: number): number {
  const distinct = new Set(p.chains.map((c) => c.trim().toLowerCase())).size;
  if (distinct >= 4) return 12;
  if (distinct >= 2) return 8;
  return capital >= 150 ? 8 : 4;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('cex')) return `Move $${capital} of USDC to ${name} on ${chain} and keep the trading balance active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(p, capital);
  const hold = holdDaysFor(age);
  const others = p.chains.slice(1, 3).join(', ');
  const chainText = others.length > 0 ? `${chain} and keep ${others} ready for the same position` : `${chain}`;
  return [
    {
      text: `Create a fresh wallet for this farm only, write its seed phrase offline, and fund it from a wallet you already control.`,
      cost: '$2 of gas to create the wallet and move funds',
      time: '5 minutes',
    },
    {
      text: `Confirm ${p.name}'s app is the official one on ${chainText} before you approve any contract.`,
      cost: '$3 of gas for the first approval',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: '$2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: '$0 to check and claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction in a farm log so you can repeat or unwind the position.`,
      cost: '$0 for the log',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    on_watchlist: row.on_watchlist,
    scenario_low: row.scenario_low,
    scenario_mid: row.scenario_mid,
    scenario_high: row.scenario_high,
    growth_multiplier: row.model.momentum,
    maturity_multiplier: round4(row.model.age_multiplier * row.model.chain_weight),
  };
}

export function buildPeers(board: BoardRow[], snapshot: Snapshot, model: ModelConstants = MODEL): Record<string, Peer[]> {
  const bearers = tokenBearers(snapshot);
  const peers: Record<string, Peer[]> = {};
  for (const row of board) {
    const candidates = bearers
      .filter((b) => b.protocol.category === row.category)
      .sort((a, b) => Math.abs(a.protocol.tvl_usd - row.tvl_usd) - Math.abs(b.protocol.tvl_usd - row.tvl_usd) || slugOrder(a.protocol.slug, b.protocol.slug))
      .slice(0, model.peer_count);
    peers[row.slug] = candidates.map((b) => ({
      slug: b.protocol.slug,
      name: b.protocol.name,
      mcap_usd: b.protocol.mcap_usd as number,
      multiple: b.multiple,
    }));
  }
  return peers;
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const { categories, global } = multipleModel(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    peers: buildPeers(board, snapshot, model),
    model: {
      version: MODEL_VERSION,
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      formula: 'implied = clamp(round(tvl_usd * category_p50 * chain_weight * momentum * age), max(1000000, round(tvl_usd * 0.2)), 100000000000000)',
      category_percentiles: categories,
      global_percentiles: global,
      constants: model,
      major_chains: MAJOR_CHAINS,
    },
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.scenario_low > r.scenario_mid || r.scenario_mid > r.scenario_high) return `${r.slug} has scenarios out of order`;
    if (!Number.isSafeInteger(r.scenario_low) || !Number.isSafeInteger(r.scenario_mid) || !Number.isSafeInteger(r.scenario_high)) return `${r.slug} has a scenario that is not a whole dollar value`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
