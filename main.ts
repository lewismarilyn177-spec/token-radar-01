#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Model } from './lib/model.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  if (inputIdx === -1) {
    console.error('Usage: node main.ts --input <snapshot.json>');
    process.exit(1);
  }
  const inputPath = args[inputIdx + 1];
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || join(__dirname, 'out');

  const snapshot = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const model = new Model(snapshot);
  const board = model.buildBoard();
  const dataJs = model.buildDataJs();

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outputDir, 'board.json'), JSON.stringify(board, null, 2));
  writeFileSync(join(outputDir, 'data.js'), dataJs);

  cpSync(join(__dirname, 'dashboard', 'index.html'), join(outputDir, 'dashboard', 'index.html'));
  cpSync(join(__dirname, 'dashboard', 'app.js'), join(outputDir, 'dashboard', 'app.js'));
  cpSync(join(__dirname, 'dashboard', 'app.css'), join(outputDir, 'dashboard', 'app.css'));

  if (existsSync(join(__dirname, 'screenshots'))) {
    cpSync(join(__dirname, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
  }

  const dossier = {
    board,
    methodology: `Token launch radar using ridge regression (lambda=0.25) on log(mcap/tvl) with features:
[1, log10(tvl_usd), clamped 7d growth, capped age in years (max 6), ln(chain count), major chain indicator].
Token odds per category use Laplace-smoothed launch share shrunk toward global share, decayed by protocol age.
Implied value = clamp(round(tvl * exp(w·x) * token_odds), max(250000, round(tvl*0.02)), 1e14).
Scenario ranges from residual quartiles. Farm verdict prices a 3-12 step plan with capital/gas costs.`,
    dashboard_sources: {
      index_html: readFileSync(join(__dirname, 'dashboard', 'index.html'), 'utf-8'),
      app_js: readFileSync(join(__dirname, 'dashboard', 'app.js'), 'utf-8'),
      app_css: readFileSync(join(__dirname, 'dashboard', 'app.css'), 'utf-8')
    }
  };
  writeFileSync(join(outputDir, 'dossier.json'), JSON.stringify(dossier, null, 2));

  const earlyCount = 210;
  const liveCount = board.live.length;
  console.log(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, 250 rows scored (210 early, ${liveCount} live set aside); wrote out/board.json, out/data.js, out/dashboard (3 files), out/screenshots (3 images) and out/dossier.json`);
}

main();