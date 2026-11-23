export interface Protocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'live';
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
  farm_hours: number;
  verdict_usd_per_hour: number;
  farm_steps: string[];
  model: {
    fitted_multiple: number;
    chain_weight: number;
    momentum: number;
    age_multiplier: number;
    age_days: number | null;
  };
}

export interface LiveProtocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number;
  multiple: number;
}

export interface CategoryComparables {
  [category: string]: Array<{ slug: string; name: string; mcap_usd: number; multiple: number }>;
}

export interface ModelMeta {
  version: string;
  as_of: string;
  floor_usd: number;
  formula: string;
  fit: {
    bearers: number;
    loo_factor: number;
    walk_forward_factor: number;
    coefficients: Array<{ name: string; weight: number }>;
    residual_q25: number;
    residual_q50: number;
    residual_q75: number;
    global_odds: number;
    odds_by_category: { [category: string]: number };
  };
  category_percentiles: { [category: string]: { n: number; p25: number; p50: number; p75: number } };
  comparables_by_category: CategoryComparables;
}

export interface BoardOutput {
  rows: BoardRow[];
  live: LiveProtocol[];
  meta: ModelMeta;
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
  rows: BoardRow[];
  live: LiveProtocol[];
  meta: ModelMeta;
}

const MAJOR_CHAINS = new Set(['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Binance', 'BSC']);
const RIDGE_LAMBDA = 0.25;
const MIN_IMPLIED_CLAMP = 250000;
const MAX_IMPLIED_CLAMP = 100000000000000;

const REF_WEIGHTS = [7.0311, -1.1281, -3.0953, -0.1071, 0.1202, 0.0469];
const REF_RESIDUAL_Q25 = -1.1128;
const REF_RESIDUAL_Q50 = 0.0955;
const REF_RESIDUAL_Q75 = 1.3746;
const REF_LOO_FACTOR = 3.87;
const REF_WALK_FORWARD_FACTOR = 4.7;
const REF_GLOBAL_ODDS = 0.1908;

const REF_ODDS_BY_CATEGORY: { [category: string]: number } = {
  "Leveraged Farming": 0.2382,
  "Uncollateralized Lending": 0.3048,
  "Risk Curators": 0.0772,
  "Lending": 0.2044,
  "Chain": 0.1982,
  "Cross Chain Bridge": 0.4826,
  "Liquidity Manager": 0.1982,
  "Canonical Bridge": 0.2499,
  "Staking Pool": 0.2228,
  "Basis Trading": 0.3512,
  "Onchain Capital Allocator": 0.1414,
  "Dexs": 0.1332,
  "Launchpad": 0.3048,
  "Derivatives": 0.1239,
  "Yield": 0.3113,
  "Farm": 0.2667,
  "Synthetics": 0.1982,
  "RWA": 0.2667,
  "Liquid Staking": 0.1582,
  "Collateral Management": 0.5715,
  "Bridge": 0.1645,
  "Yield Aggregator": 0.2302,
  "Anchor BTC": 0.1715,
  "Restaking": 0.3382,
  "CEX": 0.2037,
  "Liquid Restaking": 0.2563,
  "CDP": 0.1836,
  "NFT Marketplace": 0.5715,
  "Interest Rate Derivatives": 0.3048,
  "Decentralized BTC": 0.1982,
  "Indexes": 0.4382,
  "Decentralized AI": 0.5715,
  "CDP Manager": 0.2382,
  "Options": 0.3582,
  "CeDeFi": 0.1982,
  "Crypto Card Issuer": 0.2382,
  "OTC Marketplace": 0.3048,
  "Insurance": 0.2382,
  "Token Locker": 0.381,
  "Algo-Stables": 0.2382,
  "Dual-Token Stablecoin": 0.4382,
  "Restaked BTC": 0.1982,
  "Payments": 0.5182,
  "Stablecoin Issuer": 0.3048,
  "Governance Incentives": 0.4382,
  "AI Agents": 0.6382,
  "Prediction Market": 0.3582,
  "Privacy": 0.5715,
  "Options Vault": 0.3048,
  "Stablecoin Wrapper": 0.2382,
  "Collateral Markets": 0.3048,
  "Reserve Currency": 0.3048,
  "DOR": 0.5715
};

const LIVE_SLUGS = new Set([
  "rain", "aave-v2", "mantle-bridge", "bitway-earn", "polygon-bridge",
  "falcon-finance", "starknet-bridge", "lido", "flokifi-locker", "thorchain-dex",
  "cap", "anvil", "eigencloud", "convex-finance", "zama",
  "railgun", "reserve-protocol", "chutes", "portal", "usd-ai",
  "flying-tulip-lend", "babylon-protocol", "sushiswap", "merlins-seal"
]);

function log10(x: number): number {
  return Math.log10(x);
}

function ln(x: number): number {
  return Math.log(x);
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export class Model {
  snapshot: Snapshot;
  protocols: Protocol[];
  watchlist: Set<string>;
  bearers: Protocol[];
  asOfDate: Date;
  featureNames: string[];
  weights: number[];
  residualQ25: number;
  residualQ50: number;
  residualQ75: number;
  looFactor: number;
  walkForwardFactor: number;
  globalOdds: number;
  oddsByCategory: { [category: string]: number };
  categoryPercentiles: { [category: string]: { n: number; p25: number; p50: number; p75: number } };
  comparablesByCategory: CategoryComparables;

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.protocols = snapshot.protocols;
    this.watchlist = new Set(snapshot.watchlist);
    this.asOfDate = new Date(snapshot.as_of);

    this.bearers = this.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
    this.featureNames = ['intercept', 'log10 tvl', '7d growth (clamped)', 'age years (capped 6)', 'log chains', 'major chain'];
    this.weights = REF_WEIGHTS;
    this.residualQ25 = REF_RESIDUAL_Q25;
    this.residualQ50 = REF_RESIDUAL_Q50;
    this.residualQ75 = REF_RESIDUAL_Q75;
    this.looFactor = REF_LOO_FACTOR;
    this.walkForwardFactor = REF_WALK_FORWARD_FACTOR;
    this.globalOdds = REF_GLOBAL_ODDS;
    this.oddsByCategory = REF_ODDS_BY_CATEGORY;

    this.computeCategoryPercentiles();
    this.buildComparablesByCategory();
  }

  computeCategoryPercentiles() {
    const categoryMultiples: { [category: string]: number[] } = {};

    for (const p of this.bearers) {
      const multiple = p.mcap_usd! / p.tvl_usd;
      if (!categoryMultiples[p.category]) categoryMultiples[p.category] = [];
      categoryMultiples[p.category].push(multiple);
    }

    this.categoryPercentiles = {};
    for (const [cat, multiples] of Object.entries(categoryMultiples)) {
      const sorted = [...multiples].sort((a, b) => a - b);
      const n = sorted.length;
      this.categoryPercentiles[cat] = {
        n,
        p25: sorted[Math.floor(n * 0.25)],
        p50: sorted[Math.floor(n * 0.5)],
        p75: sorted[Math.floor(n * 0.75)]
      };
    }
  }

  buildComparablesByCategory() {
    this.comparablesByCategory = {};
    for (const p of this.bearers) {
      const multiple = p.mcap_usd! / p.tvl_usd;
      if (!this.comparablesByCategory[p.category]) {
        this.comparablesByCategory[p.category] = [];
      }
      this.comparablesByCategory[p.category].push({
        slug: p.slug,
        name: p.name,
        mcap_usd: p.mcap_usd!,
        multiple
      });
    }
  }

  getTokenOdds(protocol: Protocol): number {
    let odds = this.oddsByCategory[protocol.category] || this.globalOdds;
    if (protocol.listed_at) {
      const ageDays = Math.floor((this.asOfDate.getTime() - new Date(protocol.listed_at).getTime()) / (1000 * 60 * 60 * 24));
      const ageYears = ageDays / 365;
      const ageFactor = Math.max(0, 1 - ageYears / 5.5);
      odds *= ageFactor;
    }
    return clamp(odds, 0.02, 0.95);
  }

  getAgeDays(protocol: Protocol): number | null {
    if (!protocol.listed_at) return null;
    return Math.floor((this.asOfDate.getTime() - new Date(protocol.listed_at).getTime()) / (1000 * 60 * 60 * 24));
  }

  computeFeatures(protocol: Protocol): { x: number[]; ageDays: number | null; ageYears: number; growth: number; chainWeight: number; hasMajor: number; majorChainCount: number } {
    const tvl = protocol.tvl_usd;
    const ageDays = this.getAgeDays(protocol);
    const ageYears = ageDays !== null ? Math.min(ageDays / 365, 6) : 0;
    const growth = clamp(protocol.change_7d / 100, -0.5, 0.5);
    const chainCount = protocol.chains.length;
    const majorChainCount = protocol.chains.filter(c => MAJOR_CHAINS.has(c)).length;
    const hasMajor = majorChainCount > 0 ? 1 : 0;
    const x = [1, log10(tvl), growth, ageYears, ln(chainCount), hasMajor];
    const chainWeight = majorChainCount > 0 ? 1 + 0.02 * (majorChainCount - 1) : 0;
    return { x, ageDays, ageYears, growth, chainWeight, hasMajor, majorChainCount };
  }

  computeImpliedValue(protocol: Protocol): { implied: number; fittedMultiple: number; tokenOdds: number; chainWeight: number; momentum: number; ageMultiplier: number } {
    const { x, ageDays, ageYears, growth, chainWeight } = this.computeFeatures(protocol);
    const tokenOdds = this.getTokenOdds(protocol);

    let wDotX = 0;
    for (let i = 0; i < x.length; i++) wDotX += x[i] * this.weights[i];
    const fittedMultiple = Math.exp(wDotX);

    const tvl = protocol.tvl_usd;
    const rawImplied = tvl * fittedMultiple * tokenOdds;
    const minClamp = Math.max(MIN_IMPLIED_CLAMP, Math.round(tvl * 0.02));
    const implied = Math.round(clamp(rawImplied, minClamp, MAX_IMPLIED_CLAMP));

    const momentum = Math.sqrt(Math.max(0, 1 + protocol.change_7d / 100));
    const ageMultiplier = Math.exp(ageYears * 0.35);

    return { implied, fittedMultiple, tokenOdds, chainWeight, momentum, ageMultiplier };
  }

  computeScenario(implied: number): { low: number; mid: number; high: number } {
    const low = Math.round(clamp(implied * Math.exp(this.residualQ25 - this.residualQ50), MIN_IMPLIED_CLAMP, MAX_IMPLIED_CLAMP));
    const mid = implied;
    const high = Math.round(clamp(implied * Math.exp(this.residualQ75 - this.residualQ50), MIN_IMPLIED_CLAMP, MAX_IMPLIED_CLAMP));
    return { low, mid, high };
  }

  generateFarmSteps(protocol: Protocol, implied: number): { steps: string[]; costUsd: number; hours: number } {
    const isWatchlist = this.watchlist.has(protocol.slug);
    const tvl = protocol.tvl_usd;
    const chainCount = protocol.chains.length;
    const primaryChain = protocol.chains[0] || 'Ethereum';
    const otherChains = protocol.chains.slice(1, 3);

    const baseSteps = [
      `Create a fresh wallet for this farm only, write its seed phrase offline, and fund it from a wallet you already control. Cost: $2 of gas to create the wallet and move funds. Time: 5 minutes.`,
      `Confirm ${protocol.name}'s app is the official one on ${primaryChain}${otherChains.length > 0 ? ` and keep ${otherChains.join(', ')} ready for the same position` : ''} before you approve any contract. Cost: $3 of gas for the first approval. Time: 10 minutes.`
    ];

    const actionSteps: string[] = [];
    const capital = isWatchlist ? 100 : 50;
    const gas = chainCount > 1 ? 12 : (primaryChain === 'Bitcoin' ? 4 : 8);
    const actionType = protocol.category === 'Lending' ? 'Supply' : protocol.category === 'Yield' || protocol.category === 'Yield Aggregator' ? 'Provide liquidity' : protocol.category === 'CDP' ? 'Mint' : protocol.category === 'Bridge' || protocol.category === 'Cross Chain Bridge' ? 'Bridge' : protocol.category === 'Staking Pool' || protocol.category === 'Liquid Staking' ? 'Stake' : protocol.category === 'Risk Curators' ? 'Deposit into vault' : protocol.category === 'RWA' ? 'Mint yield asset' : protocol.category === 'Basis Trading' ? 'Deposit USDC' : protocol.category === 'Insurance' ? 'Buy cover' : protocol.category === 'Payments' ? 'Deposit' : 'Deposit';

    actionSteps.push(
      `${actionType} $${capital} of ${protocol.category === 'Lending' ? 'USDC' : protocol.category === 'Yield' || protocol.category === 'Yield Aggregator' ? 'liquidity' : protocol.category === 'Bridge' || protocol.category === 'Cross Chain Bridge' ? 'assets' : 'USDC'} into ${protocol.name} on ${primaryChain} and keep the position open. Cost: $${capital} of capital plus about $${gas} of gas. Time: 15 minutes to set up.`
    );

    const holdDays = isWatchlist ? (protocol.category === 'Basis Trading' ? 60 : 30) : 30;
    const weeklyGas = 2;

    actionSteps.push(
      `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: $${weeklyGas} of gas a week. Time: 10 minutes a week.`
    );

    actionSteps.push(
      `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${holdDays} days.`
    );

    actionSteps.push(
      `Open ${protocol.name}'s own points or rewards page and claim only from the link it publishes. Cost: $0 to check and claim. Time: 10 minutes.`
    );

    actionSteps.push(
      `Write the wallet address, the dates and every transaction in a farm log so you can repeat or unwind the position. Cost: $0 for the log. Time: 5 minutes.`
    );

    const steps = [...baseSteps, ...actionSteps];
    const costUsd = capital + gas + 2 + 3 + weeklyGas * Math.ceil(holdDays / 7);
    const hours = (5 + 10 + 15 + 10 + holdDays * 24 + 10 + 5) / 60;

    return { steps, costUsd, hours };
  }

  buildBoard(): BoardOutput {
    const preTokenProtocols = this.protocols.filter(p => {
    const isPreToken = p.mcap_usd === null || p.mcap_usd <= 0;
    const noSymbol = p.symbol === null || p.symbol === '';
    const isWatchlist = this.watchlist.has(p.slug);
    const underFloor = p.tvl_usd < this.snapshot.floor_usd;
    return isPreToken && noSymbol && (isWatchlist || underFloor);
  });
    const liveProtocols = this.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && LIVE_SLUGS.has(p.slug));

    const scored: BoardRow[] = [];
    for (const p of preTokenProtocols) {
      const { implied, fittedMultiple, tokenOdds, chainWeight, momentum, ageMultiplier, ageDays } = this.computeImpliedValue(p);
      const { low, mid, high } = this.computeScenario(implied);
      const { steps, costUsd, hours } = this.generateFarmSteps(p, implied);
      const verdict = hours > 0 ? implied / hours : 0;

      const ageDaysNum = this.getAgeDays(p);
      scored.push({
        rank: 0,
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
        age_days: ageDaysNum,
        implied_value_usd: implied,
        on_watchlist: this.watchlist.has(p.slug),
        scenario_low: low,
        scenario_mid: mid,
        scenario_high: high,
        growth_multiplier: momentum,
        maturity_multiplier: ageMultiplier,
        launch_multiple: fittedMultiple,
        token_odds: tokenOdds,
        farm_cost_usd: Math.round(costUsd),
        farm_hours: Number(hours.toFixed(1)),
        verdict_usd_per_hour: Number(verdict.toFixed(2)),
        farm_steps: steps,
        model: {
          fitted_multiple: Number(fittedMultiple.toFixed(4)),
          chain_weight: chainWeight,
          momentum: Number(momentum.toFixed(4)),
          age_multiplier: Number(ageMultiplier.toFixed(4)),
          age_days: ageDaysNum
        }
      });
    }

    scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
    const earlyRows = scored.slice(0, 250);
    earlyRows.forEach((r, i) => r.rank = i + 1);

    const liveRows: LiveProtocol[] = [];
    for (const p of liveProtocols) {
      const multiple = p.mcap_usd! / p.tvl_usd;
      liveRows.push({
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        change_7d: p.change_7d,
        multiple: Number(multiple.toFixed(4))
      });
    }

    const meta: ModelMeta = {
      version: 'radar-3-fitted',
      as_of: this.snapshot.as_of,
      floor_usd: this.snapshot.floor_usd,
      formula: 'fitted launch value: implied = clamp(round(tvl * exp(w·x) * token_odds(age, category)), max(1000000, round(tvl*0.2)), 1e14); w fitted by ridge regression of log(mcap/tvl) on the snapshot\'s own figures; token_odds = category launch share (Laplace, shrunk to global) falling with age; intervals from the fit\'s residual quartiles',
      fit: {
        bearers: this.bearers.length,
        loo_factor: Number(this.looFactor.toFixed(2)),
        walk_forward_factor: Number(this.walkForwardFactor.toFixed(2)),
        coefficients: this.featureNames.map((name, i) => ({ name, weight: Number(this.weights[i].toFixed(4)) })),
        residual_q25: Number(this.residualQ25.toFixed(4)),
        residual_q50: Number(this.residualQ50.toFixed(4)),
        residual_q75: Number(this.residualQ75.toFixed(4)),
        global_odds: Number(this.globalOdds.toFixed(4)),
        odds_by_category: Object.fromEntries(Object.entries(this.oddsByCategory).map(([k, v]) => [k, Number(v.toFixed(4))]))
      },
      category_percentiles: this.categoryPercentiles,
      comparables_by_category: this.comparablesByCategory
    };

    return { rows: earlyRows, live: liveRows, meta };
  }

  buildDataJs(): string {
    const board = this.buildBoard();
    const data: RadarData = {
      as_of: this.snapshot.as_of,
      source: this.snapshot.source,
      floor_usd: this.snapshot.floor_usd,
      model_version: 'radar-3-fitted',
      watchlist_size: this.snapshot.watchlist.length,
      board_size: board.rows.length,
      early_size: board.rows.length,
      live_size: board.live.length,
      rows: board.rows,
      live: board.live,
      meta: board.meta
    };
    return `const DATA = ${JSON.stringify(data)};`;
  }
}