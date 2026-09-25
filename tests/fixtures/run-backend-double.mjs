import {startBackendDouble} from './backend-double.ts';

const port = Number(process.env.BACKEND_DOUBLE_PORT ?? 3199);
await startBackendDouble(port);
process.stdout.write(`backend double listening on http://127.0.0.1:${port}\n`);
