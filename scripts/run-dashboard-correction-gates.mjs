// Task-local reproducible gate capture; every exit code is retained, logs whitespace-normalized.
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
const dir = 'docs/ui-evidence/issue-27/rework';
const gates = [
  ['install', ['ci']], ['lint', ['run', 'lint']], ['typecheck', ['run', 'typecheck']],
  ['messages', ['run', 'messages:check']], ['contracts', ['run', 'contracts:check']],
  ['build', ['run', 'build']], ['token-leak', ['run', 'check-no-token-leak']],
  ['relay-log-leak', ['run', 'check-relay-log-leak']], ['preview-decode', ['run', 'check-preview-decode']],
  ['e2e-build', ['run', 'build:e2e']],
  ['e2e', null], ['unconfigured', ['run', 'test:e2e:unconfigured']]
];
const results = [];
function clean(text) { return text.split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n'; }
for (const [name, args] of gates) {
  console.log(`START ${name}`);
  const run = args ? spawnSync('npm', args, {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024}) : spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--workers=4'], {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  writeFileSync(`${dir}/${name}.log`, clean(output));
  results.push({name, command: args ? `npm ${args.join(' ')}` : 'node node_modules/@playwright/test/cli.js test --workers=4', exitCode: run.status, error: run.error?.message ?? null});
  console.log(`END ${name}: ${run.status}\n${output.slice(-1800)}`);
}
for (const file of readdirSync(dir).filter(file => file.endsWith('.log'))) writeFileSync(`${dir}/${file}`, clean(readFileSync(`${dir}/${file}`, 'utf8')));
writeFileSync(`${dir}/gate-results.json`, JSON.stringify(results, null, 2) + '\n');
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1;
