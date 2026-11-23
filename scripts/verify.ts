#!/usr/bin/env node

import { readFileSync } from 'fs';
import { resolve } from 'path';

const BOARD_FILE = resolve('out/board.json');
const SNAPSHOT_FILE = resolve('/root/makefun/token-radar-01-kit/input/snapshot.json');

function main(): void {
  let board: any;
  try {
    board = JSON.parse(readFileSync(BOARD_FILE, 'utf-8'));
  } catch (e) {
    fail(`Cannot read ${BOARD_FILE}: ${e}`);
    return;
  }
  const rows = board.rows;
  if (!Array.isArray(rows)) {
    fail('board.json missing rows array');
    return;
  }

  // Load snapshot to get watchlist
  let snapshot: any;
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8'));
  } catch (e) {
    fail(`Cannot read snapshot: ${e}`);
    return;
  }

  // 1. at least 100 rows
  if (rows.length < 100) {
    fail(`rows >= 100: got ${rows.length}`);
    return;
  }

  // 2. every watchlist slug covered
  const boardSlugs = new Set(rows.map((r: any) => r.slug));
  const missing = snapshot.watchlist.filter((s: string) => !boardSlugs.has(s));
  if (missing.length > 0) {
    fail(`watchlist slugs missing: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
    return;
  }

  // 3. implied_value_usd strictly non-increasing from rank 1 down
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      fail(`row ${i + 1} (${rows[i].slug}) implied ${rows[i].implied_value_usd} > row ${i} (${rows[i - 1].slug}) implied ${rows[i - 1].implied_value_usd}`);
      return;
    }
  }

  // 4. each farm_steps entry: array of 3-12 strings, each 20-600 chars
  for (const row of rows) {
    const steps = row.farm_steps;
    if (!Array.isArray(steps)) {
      fail(`${row.slug}: farm_steps is not an array`);
      return;
    }
    if (steps.length < 3 || steps.length > 12) {
      fail(`${row.slug}: farm_steps length ${steps.length} not in [3, 12]`);
      return;
    }
    for (const step of steps) {
      if (typeof step !== 'string') {
        fail(`${row.slug}: farm_steps contains non-string`);
        return;
      }
      if (step.length < 20 || step.length > 600) {
        fail(`${row.slug}: farm step length ${step.length} not in [20, 600]`);
        return;
      }
    }
  }

  console.log('PASS');
}

function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

main();