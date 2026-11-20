# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lewismarilyn177-spec/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lewismarilyn177-spec/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama protocol snapshot, finds every protocol that still records no token (the house watchlist of 40 large pre-token protocols plus 210 smaller ones below the floor), and ranks them by an implied launch value derived entirely from the snapshot itself — TVL × category peer-multiple × chain quality × 7-day momentum × age without a token. Each row carries a low/mid/high scenario range, token-bearing peer comps, and a concrete costed, time-estimated farm plan. The dashboard is a dark navy single-page radar board with sortable columns, search, category/chain/TVL filters, hot-movers and fresh-and-big sections, and a per-protocol detail drawer with the full value breakdown.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
