import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const artifactUrl = new URL('contracts/openapi.json', root);
const referenceUrl = new URL('contracts/BACKEND-REF.json', root);
const generatedUrl = new URL('src/lib/api/generated.ts', root);
const cliUrl = new URL('../node_modules/openapi-typescript/bin/cli.js', import.meta.url);
const artifact = await readFile(artifactUrl);
const reference = JSON.parse(await readFile(referenceUrl, 'utf8'));
const spec = JSON.parse(artifact.toString('utf8'));
const blobSha = createHash('sha1')
  .update(`blob ${artifact.length}\0`)
  .update(artifact)
  .digest('hex');
const sha256 = createHash('sha256').update(artifact).digest('hex');

assert(reference.artifact_path === 'contracts/openapi.json', 'Unexpected artifact path.');
assert(reference.artifact_git_blob_sha === blobSha, 'OpenAPI Git blob hash does not match BACKEND-REF.json.');
assert(reference.artifact_sha256 === sha256, 'OpenAPI SHA-256 does not match BACKEND-REF.json.');
assert(reference.openapi_version === spec.openapi, 'OpenAPI version does not match BACKEND-REF.json.');
assert(reference.contract_version === spec.info?.version, 'Contract version does not match BACKEND-REF.json.');
assert(reference.backend_commit === '998453aad0c446908e57aab0edc473cbe388b6cc', 'Backend commit pin changed.');
assert(reference.generator === 'openapi-typescript@7.6.1', 'Generated type tool pin changed.');

const expectedOperations = new Map([
  ['/analyses', ['post']],
  ['/analyses/{analysis_id}', ['get']],
  ['/analyses/{analysis_id}/result', ['get']],
  ['/sources', ['get']]
]);
for (const [path, methods] of expectedOperations) {
  assert(spec.paths?.[path], `Missing frozen route ${path}.`);
  for (const method of methods) {
    assert(spec.paths[path][method], `Missing frozen operation ${method.toUpperCase()} ${path}.`);
  }
}

const resultProperties = spec.components?.schemas?.AnalysisResult?.properties ?? {};
for (const absentField of ['zones', 'time_series', 'priority']) {
  assert(!(absentField in resultProperties), `M1 must omit ${absentField} from AnalysisResult.`);
}

const generatedCheck = spawnSync(process.execPath, [
  cliUrl.pathname,
  artifactUrl.pathname,
  '--check',
  '--output',
  generatedUrl.pathname
], {encoding: 'utf8'});
if (generatedCheck.stdout) process.stdout.write(generatedCheck.stdout);
if (generatedCheck.stderr) process.stderr.write(generatedCheck.stderr);
assert(generatedCheck.status === 0, 'Generated OpenAPI types are stale; run npm run api:generate.');

process.stdout.write(`Pinned OpenAPI ${reference.contract_version} verified at backend ${reference.backend_commit}.\n`);

function assert(condition, message) {
  if (!condition) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
