import {randomUUID} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PREVIEW_URL_TOKEN, startBackendDouble, SUCCEEDED_ID} from '../tests/fixtures/backend-double.ts';

// F2 fix (independent review of 3a8262d): scripts/check-no-token-leak.mjs scans build artifacts,
// and tests/e2e/relay.spec.ts scans response bodies, but nothing previously failed if the
// operator token (or the exact outbound Authorization header) reached a log or console call.
// This builds and runs the real production server (the same `next start` process and the same
// route handlers under src/app/api/** that test:e2e exercises), points it at the labelled
// backend double with a synthetic probe token, captures the server child process's entire
// stdout+stderr byte stream (which is where every console.* call and every direct
// process.stdout/stderr.write ultimately lands), makes one real HTTP request per relay route plus
// one to the DP-4 W6.1 preview route, and asserts neither the operator token, the outbound
// Authorization header value, nor the frozen signed `preview_url` (DP-4 P3(b)) ever appears
// anywhere in that capture. It fails the same way if a future change adds a logging call that
// prints the token, the outbound headers, or the signed URL.

const root = fileURLToPath(new URL('../', import.meta.url));
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const port = 3198;
const backendDoublePort = 3197;
const backendDoubleUrl = `http://127.0.0.1:${backendDoublePort}`;
const baseUrl = `http://127.0.0.1:${port}`;

const probeToken = `leak-probe-${randomUUID()}`;
const probeAuthorizationHeader = `Bearer ${probeToken}`;
const inboundAuthorizationHeader = 'Bearer browser-injected-should-never-reach-the-backend-or-a-log';
const polygon = {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]};

process.stdout.write('check-relay-log-leak: building production server...\n');
const build = spawnSync(process.execPath, [nextBin, 'build'], {stdio: 'inherit', cwd: root, env: process.env});
if (build.status !== 0) {
  process.stderr.write('check-relay-log-leak: build failed.\n');
  process.exit(build.status ?? 1);
}

const backendDouble = await startBackendDouble(backendDoublePort);

const chunks = [];
const server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  env: {...process.env, AQUALEDGER_API_BASE_URL: backendDoubleUrl, AQUALEDGER_OPERATOR_JWT: probeToken}
});
server.stdout.on('data', (chunk) => chunks.push(chunk));
server.stderr.on('data', (chunk) => chunks.push(chunk));

let exitCode;
try {
  await waitUntilReady(`${baseUrl}/en/analysis`, 90_000);

  const id = randomUUID();
  await fetch(`${baseUrl}/api/analyses`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: inboundAuthorizationHeader},
    body: JSON.stringify({aoi_geojson: polygon, start_date: '2020-01-01', end_date: '2020-01-02'})
  }).then((response) => response.text());
  await fetch(`${baseUrl}/api/analyses/${id}`, {headers: {Authorization: inboundAuthorizationHeader}}).then((response) => response.text());
  await fetch(`${baseUrl}/api/analyses/${id}/result`, {headers: {Authorization: inboundAuthorizationHeader}}).then((response) => response.text());
  await fetch(`${baseUrl}/api/sources`, {headers: {Authorization: inboundAuthorizationHeader}}).then((response) => response.text());
  // SUCCEEDED_ID's result carries a ready ndvi_preview artifact whose preview_url embeds
  // PREVIEW_URL_TOKEN; the outbound fetch to that (unreachable, placeholder) signed URL is
  // expected to fail, but the URL/token must never be logged either way.
  await fetch(`${baseUrl}/api/analyses/${SUCCEEDED_ID}/preview`, {headers: {Authorization: inboundAuthorizationHeader}}).then((response) => response.text());

  // Give any async logging inside the request handlers a moment to flush before inspecting output.
  await new Promise((resolve) => setTimeout(resolve, 500));

  const capturedText = Buffer.concat(chunks).toString('utf8');
  const hits = [];
  if (capturedText.includes(probeToken)) hits.push('the operator token value');
  if (capturedText.includes(probeAuthorizationHeader)) hits.push('the outbound "Bearer <token>" Authorization value');
  if (capturedText.includes(inboundAuthorizationHeader)) hits.push('the dropped inbound Authorization value');
  if (capturedText.includes(PREVIEW_URL_TOKEN)) hits.push('the signed preview_url query token');

  if (hits.length > 0) {
    process.stderr.write(`check-relay-log-leak: FAIL — captured server stdout/stderr contained: ${hits.join(', ')}.\n`);
    exitCode = 1;
  } else {
    process.stdout.write(`check-relay-log-leak: PASS — captured ${capturedText.length} bytes of server stdout/stderr across 4 relay call(s) plus 1 preview-route call against the backend double; none contained the operator token, any Authorization value, or the signed preview URL.\n`);
    exitCode = 0;
  }
} catch (error) {
  process.stderr.write(`check-relay-log-leak: FAIL — ${error.stack ?? error}\n`);
  exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  await new Promise((resolve) => backendDouble.close(resolve));
}

process.exit(exitCode);

async function waitUntilReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms.`);
}
