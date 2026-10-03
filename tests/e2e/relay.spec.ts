import {expect, test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {PREVIEW_URL_TOKEN, RESULT_NOT_FOUND_ID, resultFixture, SUCCEEDED_ID, TEST_OPERATOR_TOKEN} from '../fixtures/backend-double';

// These call the app's own same-origin relay routes directly (bypassing the browser UI) so each
// assertion is precise about one relay behavior, per the Council DP-2 verdict (issue #8):
// - the Bearer is added only on the three read/write analysis operations, never on GET /sources;
// - any inbound Authorization from the caller is dropped, never forwarded;
// - Idempotency-Key is forwarded when the caller sent one;
// - status and body pass through unchanged, including a 200 NOT_READY and a signed preview_url;
// - the operator token value never appears in a relay response body.
const doubleBase = 'http://127.0.0.1:3199';
const polygon = {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]};

type DoubleRequestLogEntry = {
  method: string;
  path: string;
  search: string | null;
  hasAuthorization: boolean;
  authorization: string | null;
  idempotencyKey: string | null;
  body: unknown;
};

async function doubleRequests(): Promise<DoubleRequestLogEntry[]> {
  const response = await fetch(`${doubleBase}/__test__/requests`);
  return response.json();
}

async function resetDoubleRequests(): Promise<void> {
  await fetch(`${doubleBase}/__test__/reset`, {method: 'POST'});
}

async function lastAnalysesListSearch(): Promise<string | null> {
  const entries = (await doubleRequests()).filter((entry) => entry.method === 'GET' && entry.path === '/analyses');
  return entries[entries.length - 1]?.search ?? null;
}

async function expectListQueryRejected(
  request: {get: (url: string) => Promise<{status: () => number; json: () => Promise<unknown>}>},
  url: string,
  code: 'INPUT_INVALID' | 'LIMIT_EXCEEDED'
): Promise<void> {
  await resetDoubleRequests();
  const before = (await doubleRequests()).filter((entry) => entry.path === '/analyses').length;
  const response = await request.get(url);
  expect(response.status()).toBe(400);
  const body = await response.json() as {error: {code: string}};
  expect(body.error.code).toBe(code);
  const after = (await doubleRequests()).filter((entry) => entry.path === '/analyses').length;
  expect(after).toBe(before);
}

test.describe('same-origin relay (Council DP-2 access model)', () => {
  test('POST /api/analyses adds the Bearer, drops an inbound Authorization, and forwards Idempotency-Key', async ({request}) => {
    const idempotencyKey = `relay-create-${randomUUID()}`;
    const response = await request.post('/api/analyses', {
      headers: {
        'Idempotency-Key': idempotencyKey,
        Authorization: 'Bearer browser-injected-should-never-reach-the-backend'
      },
      data: {aoi_geojson: polygon, start_date: '2015-01-01', end_date: '2015-01-10'}
    });
    expect(response.status()).toBe(202);
    const body = await response.text();
    expect(body).not.toContain(TEST_OPERATOR_TOKEN);

    const entry = (await doubleRequests()).find((candidate) => candidate.idempotencyKey === idempotencyKey);
    expect(entry).toBeTruthy();
    expect(entry?.method).toBe('POST');
    expect(entry?.authorization).toBe(`Bearer ${TEST_OPERATOR_TOKEN}`);
  });

  test('POST /api/analyses without an Idempotency-Key forwards none', async ({request}) => {
    const marker = randomUUID();
    const response = await request.post('/api/analyses', {
      data: {aoi_geojson: polygon, start_date: '2016-01-01', end_date: '2016-09-30', locale: marker}
    });
    expect(response.status()).toBe(202);

    const entry = (await doubleRequests()).find((candidate) =>
      candidate.method === 'POST' && (candidate.body as {locale?: string} | null)?.locale === marker);
    expect(entry).toBeTruthy();
    expect(entry?.idempotencyKey).toBeNull();
  });

  test('GET /api/analyses/{id} adds the Bearer and drops an inbound Authorization', async ({request}) => {
    const id = randomUUID();
    const response = await request.get(`/api/analyses/${id}`, {
      headers: {Authorization: 'Bearer browser-injected-should-never-reach-the-backend'}
    });
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(TEST_OPERATOR_TOKEN);

    const entry = (await doubleRequests()).find((candidate) => candidate.path === `/analyses/${id}`);
    expect(entry).toBeTruthy();
    expect(entry?.authorization).toBe(`Bearer ${TEST_OPERATOR_TOKEN}`);
  });

  test('GET /api/analyses/{id}/result adds the Bearer, passes a 200 NOT_READY through unchanged, then the committed result with its signed preview_url', async ({request}) => {
    const id = randomUUID();

    const notReady = await request.get(`/api/analyses/${id}/result`, {
      headers: {Authorization: 'Bearer browser-injected-should-never-reach-the-backend'}
    });
    expect(notReady.status()).toBe(200);
    const notReadyBody = await notReady.json();
    expect(notReadyBody).toEqual({error: {code: 'NOT_READY', params: {execution_status: 'RUNNING'}, request_id: 'req-fixture-1'}});

    const ready = await request.get(`/api/analyses/${id}/result`);
    expect(ready.status()).toBe(200);
    const readyBody = await ready.json();
    expect(readyBody.execution_status).toBe('SUCCEEDED');
    expect(readyBody.artifacts[0].preview_url).toBe(`https://private.invalid/signed?token=${PREVIEW_URL_TOKEN}`);
    // Deep-equals the double's own fixture body, not just selected fields, so an unintended
    // change to any other result field fails this test.
    expect(readyBody).toEqual(resultFixture(id));
    expect(await ready.text()).not.toContain(TEST_OPERATOR_TOKEN);

    const entries = (await doubleRequests()).filter((candidate) => candidate.path === `/analyses/${id}/result`);
    expect(entries.every((entry) => entry.authorization === `Bearer ${TEST_OPERATOR_TOKEN}`)).toBe(true);
  });

  test('GET /api/analyses/{id}/result passes a non-200 error through unchanged', async ({request}) => {
    // RESULT_NOT_FOUND_ID mirrors the real backend's own 404 NOT_FOUND (see backend-double.ts) —
    // a genuine non-200 response, unlike a FAILED run, which the real backend answers with the
    // frozen 200 NOT_READY envelope (covered in tests/e2e/preview.spec.ts).
    const response = await request.get(`/api/analyses/${RESULT_NOT_FOUND_ID}/result`);
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/sources never carries a Bearer, even when the caller sends one', async ({request}) => {
    const response = await request.get('/api/sources', {
      headers: {Authorization: 'Bearer browser-injected-should-never-reach-the-backend'}
    });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(TEST_OPERATOR_TOKEN);

    const sourcesRequests = (await doubleRequests()).filter((candidate) => candidate.path === '/sources');
    expect(sourcesRequests.length).toBeGreaterThan(0);
    expect(sourcesRequests.every((entry) => !entry.hasAuthorization)).toBe(true);
  });

  test('every relayed /analyses request that reached the double carried exactly the configured operator Bearer', async ({request}) => {
    // Triggers its own request first so the invariant below never depends on other tests' timing.
    await request.get(`/api/analyses/${randomUUID()}`);
    const entries = (await doubleRequests()).filter((candidate) => candidate.path.startsWith('/analyses'));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.authorization === `Bearer ${TEST_OPERATOR_TOKEN}`)).toBe(true);
  });

  test('the create response echoes the frozen shape and never the operator token', async ({request}) => {
    const response = await request.get(`/api/analyses/${SUCCEEDED_ID}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.analysis_id).toBe(SUCCEEDED_ID);
    expect(JSON.stringify(body)).not.toContain(TEST_OPERATOR_TOKEN);
  });

  test.describe('GET /api/analyses list query validation (cursor and limit only)', () => {
    test('rejects duplicate limit or cursor query keys in either order before relaying', async ({request}) => {
      await expectListQueryRejected(request, '/api/analyses?limit=2&limit=0', 'INPUT_INVALID');
      await expectListQueryRejected(request, '/api/analyses?limit=0&limit=2', 'INPUT_INVALID');
      await expectListQueryRejected(request, '/api/analyses?cursor=ok&cursor=', 'INPUT_INVALID');
      await expectListQueryRejected(request, '/api/analyses?cursor=&cursor=ok', 'INPUT_INVALID');
    });

    test('rejects empty, oversized and non-integer limits with INPUT_INVALID', async ({request}) => {
      await expectListQueryRejected(request, '/api/analyses?cursor=', 'INPUT_INVALID');
      await expectListQueryRejected(request, `/api/analyses?cursor=${'x'.repeat(513)}`, 'INPUT_INVALID');
      for (const limit of ['0', 'abc', '-1', '1.5']) {
        await expectListQueryRejected(request, `/api/analyses?limit=${limit}`, 'INPUT_INVALID');
      }
    });

    test('rejects limit above the configured maximum with LIMIT_EXCEEDED', async ({request}) => {
      await expectListQueryRejected(request, '/api/analyses?limit=101', 'LIMIT_EXCEEDED');
    });

    test('forwards boundary limits and a valid cursor unchanged to the backend', async ({request}) => {
      await resetDoubleRequests();
      const atMin = await request.get('/api/analyses?limit=1');
      expect(atMin.status()).toBe(200);
      expect(await lastAnalysesListSearch()).toBe('?limit=1');

      await resetDoubleRequests();
      const atMax = await request.get('/api/analyses?limit=100');
      expect(atMax.status()).toBe(200);
      expect(await lastAnalysesListSearch()).toBe('?limit=100');

      await resetDoubleRequests();
      const paged = await request.get('/api/analyses?cursor=page-2');
      expect(paged.status()).toBe(200);
      expect(await lastAnalysesListSearch()).toBe('?cursor=page-2');
    });
  });
});
