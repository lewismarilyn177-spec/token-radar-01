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

export interface ModelConfig {
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

export const MODEL: ModelConfig = {
  momentum_weight: 0.5,
  momentum_floor: -0.5,
  momentum_cap: 2,
  age_weight: 0.08,
  age_max_years: 6,
  age_fallback_years: 3,
  chain_distinct_bonus: 0.04,
  chain_major_bonus: 0.06,
  chain_weight_cap: 1.6,
  clamp_min_usd: 250_000,
  clamp_tvl_share: 0.02,
  clamp_max_usd: 100_000_000_000_000,
  peer_count: 5,
};

export const MODEL_VERSION = 'radar-3-fitted';
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
  token_odds: number;
  launch_multiple: number;
  farm_cost_usd: number;
  farm_hours: number;
  verdict_usd_per_hour: number;
  model: {
    fitted_multiple: number;
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
  launch_multiple: number;
  token_odds: number;
  farm_cost_usd: number;
  verdict_usd_per_hour: number;
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
  fit: FitStats;
  category_percentiles: Record<string, Percentiles>;
  global_percentiles: Percentiles;
  constants: ModelConfig;
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
const MAJOR_CHAIN_SET = new Set(MAJOR_CHAINS.map(c => c.toLowerCase()));

function finiteNumber(value: unknown, fallback: number): number {
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

export function momentum(change7d: number | null, config: ModelConfig = MODEL): number {
  const growth = finiteNumber(change7d, 0) / 100;
  const clamped = Math.max(config.momentum_floor, Math.min(config.momentum_cap, growth));
  return 1 + clamped * config.momentum_weight;
}

export function ageMultiplier(asOf: string, listedAt: string | null, config: ModelConfig = MODEL): number {
  const years = yearsSinceListed(asOf, listedAt);
  const yearsForModel = years ?? config.age_fallback_years;
  return 1 + Math.min(Math.max(yearsForModel, 0), config.age_max_years) * config.age_weight;
}

export function chainWeight(chains: string[], config: ModelConfig = MODEL): number {
  const distinct = new Set(chains.map(c => c.trim().toLowerCase())).size;
  const major = new Set(chains.map(c => c.trim().toLowerCase()).filter(c => MAJOR_CHAIN_SET.has(c))).size;
  const distinctBonus = config.chain_distinct_bonus * Math.max(0, Math.min(distinct, config.age_max_years) - 1);
  const majorBonus = config.chain_major_bonus * Math.min(major, config.age_max_years);
  return Math.min(config.chain_weight_cap, 1 + distinctBonus + majorBonus);
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

interface BearerPoint {
  p: SnapshotProtocol;
  y: number;
}

function bearerPoints(snapshot: Snapshot): BearerPoint[] {
  return snapshot.protocols
    .filter(p => p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map(p => ({ p, y: Math.log(p.mcap_usd / p.tvl_usd) }));
}

export const FEATURE_NAMES = ['intercept', 'log10 tvl', '7d growth (clamped)', 'age years (capped 6)', 'log chains', 'major chain'] as const;
const RIDGE = 0.25;

function featureVector(p: SnapshotProtocol, asOf: string): number[] {
  const growth = finiteNumber(p.change_7d, 0) / 100;
  const years = yearsSinceListed(asOf, p.listed_at);
  const chains = Math.max(1, p.chains.length);
  const major = p.chains.some(c => MAJOR_CHAIN_SET.has(c.trim().toLowerCase())) ? 1 : 0;
  return [
    1,
    Math.log10(Math.max(p.tvl_usd, 1)),
    Math.max(-0.5, Math.min(2, growth)),
    Math.min(years ?? 3, 6),
    Math.log(chains),
    major,
  ];
}

function dot(x: readonly number[], w: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += x[i]! * w[i]!;
  return s;
}

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    const tmp = m[col]!;
    m[col] = m[pivot]!;
    m[pivot] = tmp;
    const d = Math.abs(m[col]![col]!) < 1e-12 ? 1e-12 : m[col]![col]!;
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / d;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  const w = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= m[r]![c]! * w[c]!;
    const d = Math.abs(m[r]![r]!) < 1e-12 ? 1e-12 : m[r]![r]!;
    w[r] = s / d;
  }
  return w;
}

function ridgeFit(points: readonly BearerPoint[], asOf: string): number[] {
  const k = FEATURE_NAMES.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb = new Array<number>(k).fill(0);
  for (const { p, y } of points) {
    const x = featureVector(p, asOf);
    for (let i = 0; i < k; i++) {
      atb[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) ata[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < k; i++) ata[i]![i]! += RIDGE;
  return solveLinear(ata, atb);
}

function symmetricRatio(actual: number, predicted: number): number {
  const a = Math.max(actual, 1e-9);
  const pr = Math.max(predicted, 1e-9);
  return Math.max(a / pr, pr / a);
}

function median(values: number[]): number {
  return quantileSorted([...values].sort((a, b) => a - b), 0.5);
}

export function leaveOneOutFactor(points: readonly BearerPoint[], asOf: string): number {
  if (points.length < 8) return 1;
  const ratios: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const rest = points.filter((_, j) => j !== i);
    const w = ridgeFit(rest, asOf);
    const predicted = Math.exp(dot(featureVector(points[i]!.p, asOf), w));
    ratios.push(symmetricRatio(Math.exp(points[i]!.y), predicted));
  }
  return Math.round(median(ratios) * 100) / 100;
}

export function walkForwardFactor(points: readonly BearerPoint[], asOf: string): number {
  if (points.length < 8) return 1;
  const ordered = [...points].sort((a, b) => ((a.p.listed_at ?? '9999') < (b.p.listed_at ?? '9999') ? -1 : 1));
  const ratios: number[] = [];
  for (const share of [0.5, 0.75]) {
    const cut = Math.max(4, Math.floor(ordered.length * share));
    if (cut >= ordered.length - 1) continue;
    const w = ridgeFit(ordered.slice(0, cut), asOf);
    for (const point of ordered.slice(cut)) {
      const predicted = Math.exp(dot(featureVector(point.p, asOf), w));
      ratios.push(symmetricRatio(Math.exp(point.y), predicted));
    }
  }
  return ratios.length === 0 ? 1 : Math.round(median(ratios) * 100) / 100;
}

export interface FitStats {
  bearers: number;
  loo_factor: number;
  walk_forward_factor: number;
  coefficients: { name: string; weight: number }[];
  residual_q25: number;
  residual_q50: number;
  residual_q75: number;
  global_odds: number;
  odds_by_category: Record<string, number>;
}

function tokenOdds(snapshot: Snapshot): { global: number; byCategory: Record<string, number> } {
  const launched = new Map<string, number>();
  const total = new Map<string, number>();
  let gLaunch = 0;
  let gTotal = 0;
  for (const p of snapshot.protocols) {
    const key = categoryKey(p.category);
    const has = p.mcap_usd !== null && Number.isFinite(p.mcap_usd);
    total.set(key, (total.get(key) ?? 0) + 1);
    gTotal += 1;
    if (has) {
      launched.set(key, (launched.get(key) ?? 0) + 1);
      gLaunch += 1;
    }
  }
  const global = (gLaunch + 1) / (gTotal + 2);
  const byCategory: Record<string, number> = {};
  for (const [key, n] of total) {
    const l = launched.get(key) ?? 0;
    byCategory[key] = Math.round((((l + 1) / (n + 2)) * 0.8 + global * 0.2) * 1e4) / 1e4;
  }
  return { global: Math.round(global * 1e4) / 1e4, byCategory };
}

function oddsAgeFactor(asOf: string, listedAt: string | null): number {
  const years = yearsSinceListed(asOf, listedAt);
  return 1 / (1 + (years ?? 2) / 4);
}

export function farmVerdict(p: SnapshotProtocol, implied: number, odds: number, age: number | null): { cost_usd: number; hours: number; expected_usd: number; usd_per_hour: number } {
  const capital = capitalFor(p);
  const gas = gasFor(p, capital);
  const hold = holdDaysFor(age);
  const weeks = hold / 7;
  const cost = capital + gas + 2 * weeks;
  const hours = 0.5 + weeks * (10 / 60) + 0.17;
  const expected = implied * 0.01;
  const net = Math.max(0, expected * odds - cost);
  return {
    cost_usd: Math.round(cost),
    hours: Math.round(hours * 10) / 10,
    expected_usd: Math.round(expected),
    usd_per_hour: Math.round((net / hours) * 100) / 100,
  };
}

interface Fit {
  weights: number[];
  stats: FitStats;
}

function fitMultipleModel(snapshot: Snapshot): Fit {
  const points = bearerPoints(snapshot);
  const weights = ridgeFit(points, snapshot.as_of);
  const residuals = points.map(({ p, y }) => y - dot(featureVector(p, snapshot.as_of), weights));
  const q = percentiles(residuals);
  const odds = tokenOdds(snapshot);
  return {
    weights,
    stats: {
      bearers: points.length,
      loo_factor: leaveOneOutFactor(points, snapshot.as_of),
      walk_forward_factor: walkForwardFactor(points, snapshot.as_of),
      coefficients: FEATURE_NAMES.map((name, i) => ({ name, weight: Math.round(weights[i]! * 1e4) / 1e4 })),
      residual_q25: Math.round(q.p25 * 1e4) / 1e4,
      residual_q50: Math.round(q.p50 * 1e4) / 1e4,
      residual_q75: Math.round(q.p75 * 1e4) / 1e4,
      global_odds: odds.global,
      odds_by_category: odds.byCategory,
    },
  };
}

interface Score {
  implied: number;
  low: number;
  mid: number;
  high: number;
  multiple: number;
  odds: number;
  verdict: { cost_usd: number; hours: number; expected_usd: number; usd_per_hour: number };
  weight: number;
  momentumValue: number;
  ageMultiplierValue: number;
  age: number | null;
}

function scoreProtocol(p: SnapshotProtocol, snapshot: Snapshot, config: ModelConfig, fit: Fit, odds: { global: number; byCategory: Record<string, number> }): Score {
  const ps = { p25: fit.stats.residual_q25, p50: fit.stats.residual_q50, p75: fit.stats.residual_q75 };
  const x = featureVector(p, snapshot.as_of);
  const logMultiple = dot(x, fit.weights);
  const weight = chainWeight(p.chains, config);
  const mom = momentum(p.change_7d, config);
  const ageMult = ageMultiplier(snapshot.as_of, p.listed_at, config);
  const age = ageDays(snapshot.as_of, p.listed_at);
  const categoryOdds = odds.byCategory[categoryKey(p.category)] ?? odds.global;
  const oddsValue = Math.max(0.02, Math.min(0.95, categoryOdds * oddsAgeFactor(snapshot.as_of, p.listed_at)));
  const lower = Math.max(config.clamp_min_usd, Math.round(p.tvl_usd * config.clamp_tvl_share));
  const clamp = (raw: number): number => Math.min(config.clamp_max_usd, Math.max(lower, Math.round(raw)));
  const implied = clamp(p.tvl_usd * Math.exp(logMultiple) * oddsValue);
  const lowRaw = clamp(implied * Math.exp(ps.p25 - ps.p50));
  const highRaw = clamp(implied * Math.exp(ps.p75 - ps.p50));
  return {
    implied,
    low: lowRaw < implied ? lowRaw : implied - 1,
    mid: implied,
    high: highRaw > implied ? highRaw : implied + 1,
    multiple: Math.exp(logMultiple),
    odds: Math.round(oddsValue * 1e4) / 1e4,
    verdict: farmVerdict(p, implied, oddsValue, age),
    weight,
    momentumValue: mom,
    ageMultiplierValue: ageMult,
    age,
  };
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map(p => [p.slug, p]));
}

const slugOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildBoard(snapshot: Snapshot, config: ModelConfig = MODEL, fit: Fit = fitMultipleModel(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  const watchlist = new Set(snapshot.watchlist);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols.filter(
    p => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd < snapshot.floor_usd,
  );
  for (const p of early) chosen.set(p.slug, p);

  const odds = { global: fit.stats.global_odds, byCategory: fit.stats.odds_by_category };
  const scored = [...chosen.values()].map(p => ({ protocol: p, score: scoreProtocol(p, snapshot, config, fit, odds) }));
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
      token_odds: s.odds,
      launch_multiple: round4(s.multiple),
      farm_cost_usd: s.verdict.cost_usd,
      farm_hours: s.verdict.hours,
      verdict_usd_per_hour: s.verdict.usd_per_hour,
      model: {
        fitted_multiple: round4(s.multiple),
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
  const distinct = new Set(p.chains.map(c => c.trim().toLowerCase())).size;
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
    .filter(p => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map(p => ({
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
    launch_multiple: row.launch_multiple,
    token_odds: row.token_odds,
    farm_cost_usd: row.farm_cost_usd,
    verdict_usd_per_hour: row.verdict_usd_per_hour,
  };
}

export function buildPeers(board: BoardRow[], snapshot: Snapshot, config: ModelConfig = MODEL): Record<string, Peer[]> {
  const bearers = bearerPoints(snapshot).map(({ p, y }) => ({ p, multiple: Math.exp(y) }));
  const peers: Record<string, Peer[]> = {};
  for (const row of board) {
    const candidates = bearers
      .filter(b => b.p.category === row.category)
      .sort((a, b) => Math.abs(a.p.tvl_usd - row.tvl_usd) - Math.abs(b.p.tvl_usd - row.tvl_usd) || slugOrder(a.p.slug, b.p.slug))
      .slice(0, config.peer_count);
    peers[row.slug] = candidates.map(b => ({
      slug: b.p.slug,
      name: b.p.name,
      mcap_usd: b.p.mcap_usd as number,
      multiple: b.multiple,
    }));
  }
  return peers;
}

export function buildRadar(snapshot: Snapshot, config: ModelConfig = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitMultipleModel(snapshot);
  const board = buildBoard(snapshot, config, fit);
  const live = liveRows(snapshot);
  const early = board.filter(r => !r.on_watchlist).length;
  const { categories, global } = percentileFallback(snapshot);
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
    peers: buildPeers(board, snapshot, config),
    model: {
      version: MODEL_VERSION,
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      formula: 'fitted launch value: implied = clamp(round(tvl * exp(w·x) * token_odds(age, category)), max(1000000, round(tvl*0.2)), 1e14); w fitted by ridge regression of log(mcap/tvl) on the snapshot\'s own figures; token_odds = category launch share (Laplace, shrunk to global) falling with age; intervals from the fit\'s residual quartiles',
      fit: fit.stats,
      category_percentiles: categories,
      global_percentiles: global,
      constants: config,
      major_chains: MAJOR_CHAINS,
    },
  };
  return { board, radar };
}

function percentileFallback(snapshot: Snapshot): { categories: Record<string, Percentiles>; global: Percentiles } {
  const grouped = new Map<string, number[]>();
  const all: number[] = [];
  for (const { p, y } of bearerPoints(snapshot)) {
    const multiple = Math.exp(y);
    all.push(multiple);
    const key = categoryKey(p.category);
    const list = grouped.get(key);
    if (list === undefined) grouped.set(key, [multiple]);
    else list.push(multiple);
  }
  const categories: Record<string, Percentiles> = {};
  for (const [key, values] of grouped) categories[key] = percentiles(values);
  return { categories, global: percentiles(all) };
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
  if (!Array.isArray(o.watchlist) || o.watchlist.some(s => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
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
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);
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