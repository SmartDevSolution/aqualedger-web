import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const env = {...process.env};
delete env.NEXT_PUBLIC_AQUALEDGER_API_BASE_URL;
const result = spawnSync(process.execPath, [nextBin, 'build'], {stdio: 'inherit', env});

process.exit(result.status ?? 1);
