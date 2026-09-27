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

// Walk fails closed: an entry that cannot be stat'd (e.g. a broken symlink) or that stats as
// neither a file nor a directory (e.g. a symlink to a socket/FIFO/device) is recorded as a
// classification failure rather than silently dropped, unless it is inside the already-excluded
// cache dir. A regular symlink to a file or directory is followed, since statSync (unlike
// lstatSync) resolves symlinks.
function walk(dir, excludeDir, issues, scannableFiles) {
  let filesExcluded = 0;
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const isExcluded = entryPath === excludeDir || entryPath.startsWith(`${excludeDir}${path.sep}`);
    let stats;
    try {
      stats = statSync(entryPath);
    } catch (error) {
      if (isExcluded) {
        filesExcluded += 1;
      } else {
        issues.push(`${path.relative(root, entryPath)}: cannot stat (${error.message})`);
      }
      continue;
    }
    if (stats.isDirectory()) {
      filesExcluded += walk(entryPath, excludeDir, issues, scannableFiles);
    } else if (stats.isFile()) {
      if (isExcluded) {
        filesExcluded += 1;
      } else {
        scannableFiles.push(entryPath);
      }
    } else if (isExcluded) {
      filesExcluded += 1;
    } else {
      issues.push(`${path.relative(root, entryPath)}: neither a regular file nor a directory, cannot classify`);
    }
  }
  return filesExcluded;
}

const markers = [probeToken, 'NEXT_PUBLIC_AQUALEDGER'];
const issues = [];
const scannableFiles = [];
const filesExcluded = walk(nextDir, cacheDir, issues, scannableFiles);

const hits = [];
for (const filePath of scannableFiles) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    issues.push(`${path.relative(root, filePath)}: cannot read (${error.message})`);
    continue;
  }
  for (const marker of markers) {
    if (content.includes(marker)) {
      hits.push(`${path.relative(root, filePath)}: contains "${marker}"`);
    }
  }
}

if (issues.length > 0) {
  process.stderr.write(
    `check-no-token-leak: failed closed — ${issues.length} in-scope entr${issues.length === 1 ? 'y' : 'ies'} under ` +
    `${path.relative(root, nextDir)} could not be scanned and cannot be ruled out:\n${issues.join('\n')}\n`
  );
  process.exit(1);
}

if (hits.length > 0) {
  process.stderr.write(`check-no-token-leak: token-leak probe failed:\n${hits.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `check-no-token-leak: passed — scanned ${scannableFiles.length} file(s) under ${path.relative(root, nextDir)} for the ` +
  `probe token and NEXT_PUBLIC_AQUALEDGER, excluding ${filesExcluded} file(s) under ${path.relative(root, cacheDir)} ` +
  `(Next's local incremental-build cache, never deployed or served to a browser); 0 unreadable or unclassifiable file(s).\n`
);
