// token-radar-01 entry point (Node 22, standard library only, erasable TypeScript).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|directory>), scores every
// pre-token protocol with lib/model.ts, writes the ranked board and dashboard data, copies this
// repository's dashboard/ and screenshots/ into the output directory, then writes dossier.json with
// the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_INPUT_DIR = '/input';
const DEFAULT_OUTPUT_DIR = '/output';
const SNAPSHOT_NAME = 'snapshot.json';

/** The output layout: the board, the dashboard's data, the copied page assets and the dossier. */
const OUTPUT_LAYOUT = {
  board: 'board.json',
  data: 'data.js',
  dashboard: 'dashboard',
  screenshots: 'screenshots',
  dossier: 'dossier.json',
} as const;

/** The scorer's own caps (reference/gate.json): the text cap shapes bytes, the others only refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

/** A screenshot's plain name and the minimum the page must hand in. */
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_SCREENSHOTS = 3;

interface Options {
  input: string;
  output: string;
}

/** Parse --input and --output, accepting both `--flag value` and `--flag=value`, with fallbacks. */
function parseArgs(argv: readonly string[]): Options {
  const read = (flag: string, fallback: string): string => {
    const at = argv.indexOf(`--${flag}`);
    if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
    const inline = argv.find((value) => value.startsWith(`--${flag}=`));
    return inline === undefined ? fallback : inline.slice(flag.length + 3);
  };
  return {
    input: read('input', DEFAULT_INPUT_DIR),
    output: read('output', process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR),
  };
}

/** A --input value is either a snapshot file or a directory holding snapshot.json. */
function resolveSnapshotPath(input: string): string {
  return input.endsWith('.json') ? input : join(input, SNAPSHOT_NAME);
}

/** Write a clear message to stderr and exit with the given code. */
function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read and parse the snapshot, reporting an unusable file clearly instead of throwing a stack trace. */
function loadSnapshot(path: string): Snapshot {
  try {
    return parseSnapshot(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`token radar: cannot read snapshot ${path}: ${messageOf(error)}`, 1);
  }
}

/** Copy a directory's regular files into `to`, skipping dot-named entries; return the copied names. */
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

/** Build the board, write the page data, copy assets, validate screenshots, and write the dossier. */
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
    join(REPOSITORY_ROOT, OUTPUT_LAYOUT.dashboard),
    join(output, OUTPUT_LAYOUT.dashboard),
  );
  const shots = copyDirectory(
    join(REPOSITORY_ROOT, OUTPUT_LAYOUT.screenshots),
    join(output, OUTPUT_LAYOUT.screenshots),
  );

  if (shots.length < MIN_SCREENSHOTS) {
    fail(
      `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of shots) {
    if (!SCREENSHOT_NAME.test(name)) {
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
    fail(`token radar: cannot build the dossier from ${output}: ${messageOf(error)}`, 1);
  }
  writeFileSync(join(output, OUTPUT_LAYOUT.dossier), dossier);

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside); wrote ${join(output, OUTPUT_LAYOUT.board)}, ${join(output, OUTPUT_LAYOUT.data)}, ${join(output, OUTPUT_LAYOUT.dashboard)} (${dashboardFiles.length} files), ${join(output, OUTPUT_LAYOUT.screenshots)} (${shots.length} images) and ${join(output, OUTPUT_LAYOUT.dossier)}\n`,
  );
}

try {
  run();
} catch (error) {
  fail(`token radar: ${messageOf(error)}`, 1);
}
