import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The backend base URL and operator JWT are server-only runtime env (Council DP-2), read by
// route handlers at request time, not build time, so this build needs no special env: the
// fixture backend double is configured on the `next start` process by playwright.config.ts.
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const result = spawnSync(process.execPath, [nextBin, 'build'], {stdio: 'inherit', env: process.env});

process.exit(result.status ?? 1);
