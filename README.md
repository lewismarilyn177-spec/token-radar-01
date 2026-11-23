# token-radar-01

A token launch radar: it reads a sealed DefiLlama protocol snapshot, finds every protocol that still records no token (the house watchlist of 40 large pre-token protocols plus 210 smaller ones below the floor), and ranks them by an implied launch value derived from a fitted model.

## The fitted model (radar-3-fitted)

- **Launch multiple**: ridge regression of log(mcap/tvl) on the snapshot's own token-bearing protocols (features: intercept, log10 TVL, 7d growth clamped to [-0.5, 2], age years capped at 6, log chains, major chain flag; ridge λ = 0.25).
- **Held-out validation**: leaveOneOutFactor (drop each bearer, refit, predict the held-back one) and walkForwardFactor (fit on earlier-listed protocols, test on later ones at 50% and 75% splits); both reported as symmetric multiples around the median.
- **Token odds**: per-category share of protocols that do trade a token (Laplace-smoothed, shrunk 80/20 toward the global share), then decayed with protocol age via oddsAgeFactor = 1 / (1 + years/4).
- **Implied value**: clamp(tvl × exp(w·x) × token_odds) with min_usd = 250,000, tvl_share = 0.02, max_usd = 1e14.
- **Scenario range**: derived from the fit's residual quartiles (p25/p50/p75) applied multiplicatively around the implied value.
- **Farm verdict**: concrete per-protocol plan (7-8 steps), costed in USD (capital + gas + weekly fees) and hours, then priced as $/hour = (expected_value × token_odds - cost) / hours where expected_value = implied × 0.01.

## Output

- `out/board.json` — ranked rows with implied value, scenarios, token odds, farm verdict $/h, and model breakdown
- `out/data.js` — dashboard data blob (window.RADAR)
- `out/dashboard/` — single-page dark navy radar board with sortable columns, search, category/chain/TVL filters, hot-movers/fresh-and-big cards, and a per-protocol drawer showing value breakdown, scenarios, peer comps, and the farm plan
- `out/screenshots/` — 1-board.png, 2-detail.png, 3-filtered.png
- `out/dossier.json` — vendored make.fun library bundle

## File layout

- `main.ts` — entry point (Node 22, stdlib only)
- `lib/model.ts` — all model logic (ridgeFit, leaveOneOutFactor, walkForwardFactor, tokenOdds, oddsAgeFactor, farmVerdict, board building)
- `dashboard/` — index.html, app.js, style.css
- `screenshots/` — three PNGs (board, detail drawer, filtered view)
- `scripts/verify.ts` — post-build gate (rows ≥ 100, watchlist covered, implied non-increasing, farm_steps 3-12 strings of 20-600 chars)

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /root/makefun/token-radar-01-kit/input/snapshot.json
```

Verify:

```sh
node scripts/verify.ts
```