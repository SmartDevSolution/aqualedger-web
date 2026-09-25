import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync, readdirSync, renameSync} from 'node:fs';
import path from 'node:path';

// F1 fix (independent review of 3a8262d): Next.js loads `.env`/`.env.local`/etc. itself, at both
// `next build` and `next start`, regardless of what env vars a parent process passes down.
// playwright.unconfigured.config.ts only strips AQUALEDGER_API_BASE_URL / AQUALEDGER_OPERATOR_JWT
// from the *spawned process's* env, so it cannot stop Next from re-reading those same names out
// of a checkout's own `.env.local` (which docs/IMPLEMENTATION.md's acceptance run legitimately
// creates). That made this gate fail in exactly the checkouts it most needs to run in.
//
// This script makes the gate deterministic and independent of local env files: it moves aside
// every local `.env*` file (except the committed `.env.example`) for the duration of the build
// and the Playwright run, then restores them unconditionally — including on failure, a thrown
// error, or SIGINT/SIGTERM — and prints exactly what it moved and restored.

const root = fileURLToPath(new URL('../', import.meta.url));
const SUFFIX = '.unconfigured-gate-neutralized';

function candidateEnvFiles() {
  return readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^\.env(\..+)?$/.test(name) && name !== '.env.example' && !name.endsWith(SUFFIX));
}

// Recover from a prior run that could not reach its own restore step (e.g. it was killed with
// SIGKILL): restore any leftover neutralized file before deciding what to neutralize this time.
function recoverLeftovers() {
  const leftovers = readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(SUFFIX));
  for (const neutralizedName of leftovers) {
    const originalName = neutralizedName.slice(0, -SUFFIX.length);
    renameSync(path.join(root, neutralizedName), path.join(root, originalName));
    process.stdout.write(`test:e2e:unconfigured: recovered ${originalName} left neutralized by an earlier interrupted run.\n`);
  }
}

recoverLeftovers();
const names = candidateEnvFiles();
let restored = false;

function restore() {
  if (restored) return;
  restored = true;
  const restoredNames = [];
  for (const name of names) {
    const neutralizedPath = path.join(root, `${name}${SUFFIX}`);
    if (existsSync(neutralizedPath)) {
      renameSync(neutralizedPath, path.join(root, name));
      restoredNames.push(name);
    }
  }
  if (restoredNames.length > 0) {
    process.stdout.write(`test:e2e:unconfigured: restored local env file(s): ${restoredNames.join(', ')}\n`);
  }
}

process.on('SIGINT', () => {
  restore();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restore();
  process.exit(143);
});

if (names.length > 0) {
  for (const name of names) {
    renameSync(path.join(root, name), path.join(root, `${name}${SUFFIX}`));
  }
  process.stdout.write(`test:e2e:unconfigured: temporarily moved aside local env file(s) so Next cannot load them during this gate: ${names.join(', ')}\n`);
} else {
  process.stdout.write('test:e2e:unconfigured: no local .env* files present; nothing to neutralize.\n');
}

let exitCode;
try {
  const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
  process.stdout.write('test:e2e:unconfigured: building with .env* neutralized...\n');
  const build = spawnSync(process.execPath, [nextBin, 'build'], {stdio: 'inherit', cwd: root, env: process.env});
  if (build.status !== 0) {
    exitCode = build.status ?? 1;
  } else {
    const playwrightBin = path.join(root, 'node_modules', '.bin', 'playwright');
    process.stdout.write('test:e2e:unconfigured: running Playwright (build + `next start` webServer) with .env* still neutralized...\n');
    const test = spawnSync(playwrightBin, ['test', '--config', 'playwright.unconfigured.config.ts'], {
      stdio: 'inherit',
      cwd: root,
      env: process.env
    });
    exitCode = test.status ?? 1;
  }
} finally {
  restore();
}

process.exit(exitCode);
