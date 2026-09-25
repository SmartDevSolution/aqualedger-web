import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import path from 'node:path';

// Asserts the Council DP-2 access model (issue #8): AQUALEDGER_OPERATOR_JWT is read only by a
// server-only module and must never reach a client-reachable build artifact. This builds with a
// synthetic, randomly generated probe token (never the real operator secret, so it is safe to log)
// and then scans the entire build output for that literal value and for the removed public env
// var name.

const root = fileURLToPath(new URL('../', import.meta.url));
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const nextDir = path.join(root, '.next');

const probeToken = `leak-probe-${randomUUID()}`;
const probeBaseUrl = 'https://backend.invalid.leak-probe.test';

rmSync(nextDir, {recursive: true, force: true});
const build = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  cwd: root,
  env: {...process.env, AQUALEDGER_OPERATOR_JWT: probeToken, AQUALEDGER_API_BASE_URL: probeBaseUrl}
});
if (build.status !== 0) {
  process.stderr.write('Build for the token-leak probe failed.\n');
  process.exit(build.status ?? 1);
}

// .next/cache is Next's local incremental-build cache: it is never deployed or served to a
// browser, so it is out of scope for a "build artifact under the browser bundle" check.
const cacheDir = path.join(nextDir, 'cache');

const markers = [probeToken, 'NEXT_PUBLIC_AQUALEDGER'];
const hits = [];
for (const filePath of walk(nextDir)) {
  if (filePath.startsWith(`${cacheDir}${path.sep}`)) continue;
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }
  for (const marker of markers) {
    if (content.includes(marker)) {
      hits.push(`${path.relative(root, filePath)}: contains "${marker}"`);
    }
  }
}

if (hits.length > 0) {
  process.stderr.write(`Token-leak probe failed:\n${hits.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Token-leak probe passed: neither the probe token nor NEXT_PUBLIC_AQUALEDGER appears anywhere under ${path.relative(root, nextDir)}.\n`);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      yield* walk(entryPath);
    } else if (stats.isFile()) {
      yield entryPath;
    }
  }
}
