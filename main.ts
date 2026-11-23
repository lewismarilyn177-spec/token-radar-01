import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_INPUT_DIR = '/input';
const DEFAULT_OUTPUT_DIR = '/output';
const SNAPSHOT_FILENAME = 'snapshot.json';

const OUTPUT_LAYOUT = {
  board: 'board.json',
  data: 'data.js',
  dashboard: 'dashboard',
  screenshots: 'screenshots',
  dossier: 'dossier.json',
} as const;

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const SCREENSHOT_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_SCREENSHOTS = 3;

interface Options {
  input: string;
  output: string;
}

function parseArgs(argv: readonly string[]): Options {
  const readFlag = (flag: string, fallback: string): string => {
    const idx = argv.indexOf(`--${flag}`);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1]!;
    const inline = argv.find(v => v.startsWith(`--${flag}=`));
    return inline === undefined ? fallback : inline.slice(flag.length + 3);
  };
  return {
    input: readFlag('input', DEFAULT_INPUT_DIR),
    output: readFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR),
  };
}

function resolveSnapshotPath(input: string): string {
  return input.endsWith('.json') ? input : join(input, SNAPSHOT_FILENAME);
}

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadSnapshot(path: string): Snapshot {
  try {
    return parseSnapshot(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`token radar: cannot read snapshot ${path}: ${errorMessage(error)}`, 1);
  }
}

function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));
  const inputFile = resolveSnapshotPath(options.input);
  if (!existsSync(inputFile)) {
    fail(
      `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
      2,
    );
  }

  const snapshot = loadSnapshot(inputFile);
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`token radar: the model wrote a board the gate refuses: ${issue}`, 1);
  }

  const output = options.output;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, OUTPUT_LAYOUT.board), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(output, OUTPUT_LAYOUT.data), dataScript(radar));

  const dashboardFiles = copyDirectory(
    join(REPO_ROOT, OUTPUT_LAYOUT.dashboard),
    join(output, OUTPUT_LAYOUT.dashboard),
  );
  const shots = copyDirectory(
    join(REPO_ROOT, OUTPUT_LAYOUT.screenshots),
    join(output, OUTPUT_LAYOUT.screenshots),
  );

  if (shots.length < MIN_SCREENSHOTS) {
    fail(
      `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of shots) {
    if (!SCREENSHOT_NAME_PATTERN.test(name)) {
      fail(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }

  let dossier: Uint8Array;
  try {
    dossier = buildDossier(output, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: SCREENSHOT_CAPS,
      dashboard: DASHBOARD_CAPS,
    });
  } catch (error) {
    fail(`token radar: cannot build the dossier from ${output}: ${errorMessage(error)}`, 1);
  }
  writeFileSync(join(output, OUTPUT_LAYOUT.dossier), dossier);

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside); wrote ${join(output, OUTPUT_LAYOUT.board)}, ${join(output, OUTPUT_LAYOUT.data)}, ${join(output, OUTPUT_LAYOUT.dashboard)} (${dashboardFiles.length} files), ${join(output, OUTPUT_LAYOUT.screenshots)} (${shots.length} images) and ${join(output, OUTPUT_LAYOUT.dossier)}\n`,
  );
}

try {
  run();
} catch (error) {
  fail(`token radar: ${errorMessage(error)}`, 1);
}