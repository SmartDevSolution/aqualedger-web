import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

// Pinned-contract guard, moved forward with the M3 re-pin (central issue #17, M3-4).
// The consumed artifact is the backend `dev` artifact at commit
// 6ba3f13d6106e295c2cbf00a412624f7b8192de3 (PR #13 merge 7ddb7ca + docs-only PR #14; the
// artifact is byte-identical to the ratified M3-3 acceptance state, sha256 76876a5d…, contract
// version 0.2.0). Assertions below keep three families honest:
//   1. identity — the checked-in artifact, its generated types and BACKEND-REF.json agree;
//   2. the frozen M1 routes and the M1 top-level shape stay exactly as frozen;
//   3. the M3 additive envelope is optional-by-schema (a pre-M3 result without
//      scoring/assessment is "not scored under this method", never UNRANKED), and the M3
//      vocabularies are closed enums owned by the backend contract.
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
assert(reference.backend_commit === '6ba3f13d6106e295c2cbf00a412624f7b8192de3', 'Backend commit pin changed.');
assert(reference.generator === 'openapi-typescript@7.6.1', 'Generated type tool pin changed.');
assert(reference.contract_version === '0.2.0', 'Contract version pin changed.');

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

// M1 frozen top-level shape: zone/time-series/priority presentation never moved to the result
// top level (M2 carries its additions under `m2`; M3 carries zones under `assessment[]` and the
// priority axis under each zone's `assessment[].priority`).
const resultProperties = spec.components?.schemas?.AnalysisResult?.properties ?? {};
for (const absentField of ['zones', 'time_series', 'priority']) {
  assert(!(absentField in resultProperties), `AnalysisResult must omit ${absentField} at the top level.`);
}

// M3 additive envelope (DR-M3-01 §4): present only for results computed under aq-scorecard-1,
// absent for pre-M3 results. The schema must keep every one of them optional and nullable —
// a required M3 key would force "not scored" pre-M3 results to fail validation.
const resultRequired = spec.components?.schemas?.AnalysisResult?.required ?? [];
for (const m3Field of ['scoring', 'assessment', 'result_identity']) {
  assert(m3Field in resultProperties, `M3 envelope field ${m3Field} is missing from AnalysisResult.`);
  assert(!resultRequired.includes(m3Field), `M3 envelope field ${m3Field} must stay optional.`);
  const anyOf = resultProperties[m3Field]?.anyOf;
  assert(Array.isArray(anyOf) && anyOf.some((variant) => variant?.type === 'null'),
    `M3 envelope field ${m3Field} must accept null.`);
}

// The M2 additive block is likewise optional-by-schema (a pre-M2 result has no `m2`), and the
// block's own identity fields are required so a truncated body cannot validate.
assert(!resultRequired.includes('m2'), 'M2 envelope field m2 must stay optional.');
const m2AnyOf = resultProperties.m2?.anyOf;
assert(Array.isArray(m2AnyOf) && m2AnyOf.some((variant) => variant?.type === 'null'), 'M2 envelope field m2 must accept null.');
const m2Required = spec.components?.schemas?.M2ResultAdditions?.required ?? [];
for (const m2Field of ['method_version', 'pipeline_version', 'config_version']) {
  assert(m2Required.includes(m2Field), `M2ResultAdditions is missing required ${m2Field}.`);
}

// The M3 vocabularies are closed enums owned by the backend contract (adding a code is a
// contract change). Assert the enums exist and carry the decisive members; the web renders any
// unknown code through a safe generic fallback, so a new backend code fails no gate here.
const m3ReasonCodes = spec.components?.schemas?.M3ReasonCode?.enum ?? [];
for (const code of ['MANDATORY_INPUT_MISSING', 'EVIDENCE_LIMITED', 'PERSISTENCE_INELIGIBLE',
  'AGRI_MASK_BLOCKED', 'NOT_AGRICULTURAL', 'PRIORITY_CLASS_NOT_ESTABLISHED',
  'EVIDENCE_QUALITY_UNCALIBRATED', 'SAME_FAMILY_NOT_INDEPENDENT']) {
  assert(m3ReasonCodes.includes(code), `M3ReasonCode is missing ${code}.`);
}
assertPriorityStatusEnum();
assertEvidenceQualityClassEnum();
assertResultIdentityShape();

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

function assertPriorityStatusEnum() {
  const priorityStatusEnum = spec.components?.schemas?.PriorityStatus?.enum;
  assert(priorityStatusEnum?.length === 2 && priorityStatusEnum.includes('RANKED') && priorityStatusEnum.includes('UNRANKED'),
    'PriorityStatus enum changed.');
}

function assertEvidenceQualityClassEnum() {
  const classEnum = spec.components?.schemas?.EvidenceQualityClass?.enum;
  assert(classEnum?.length === 3 && ['HIGH', 'MEDIUM', 'LOW'].every((value) => classEnum.includes(value)),
    'EvidenceQualityClass enum changed.');
}

function assertResultIdentityShape() {
  const identityProperties = spec.components?.schemas?.ResultIdentity?.properties ?? {};
  assert(typeof identityProperties.result_sha256?.type === 'string', 'ResultIdentity.result_sha256 missing.');
  assert(typeof spec.components?.schemas?.ZoneAssessment?.properties?.priority === 'object', 'ZoneAssessment.priority missing.');
}

function assert(condition, message) {
  if (!condition) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
