import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The build is identical to build-e2e.mjs: the "unconfigured" scenario is created at runtime by
// playwright.unconfigured.config.ts not setting AQUALEDGER_API_BASE_URL / AQUALEDGER_OPERATOR_JWT
// on the `next start` process, not by anything baked in at build time.
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const result = spawnSync(process.execPath, [nextBin, 'build'], {stdio: 'inherit', env: process.env});

process.exit(result.status ?? 1);
