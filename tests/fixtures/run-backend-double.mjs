import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startBackendDouble} from './backend-double.ts';

const port = Number(process.env.BACKEND_DOUBLE_PORT ?? 3199);
const previewFixtureBytes = await readFile(fileURLToPath(new URL('./ndvi-preview-fixture.tif', import.meta.url)));
await startBackendDouble(port, {previewFixtureBytes});
process.stdout.write(`backend double listening on http://127.0.0.1:${port}\n`);
