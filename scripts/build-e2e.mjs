import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {...process.env, NEXT_PUBLIC_AQUALEDGER_API_BASE_URL: 'http://127.0.0.1:3100/test-api'}
});

process.exit(result.status ?? 1);
