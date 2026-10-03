// Identity helpers for a committed scored result (DR-M3-01 §8, plan §8).
//
// `result_sha256` is the sha256 of the canonical JSON — sorted keys, no insignificant
// whitespace, decimals already strings, non-ASCII preserved — of the M3 payload keys the backend
// pins (`models/m3.py::RESULT_IDENTITY_PAYLOAD_KEYS`): `analysis_id`, `execution_status`,
// `scoring`, `assessment`. `result_identity` itself is excluded (no self-hashing). The web
// recomputes it only to *verify* the emitted hash; the displayed hash is always the emitted one.
//
// Pure module: no framework imports, so Playwright specs can import it to recompute the hash from
// a fetched body with Node's WebCrypto.

export const RESULT_IDENTITY_PAYLOAD_KEYS = ['analysis_id', 'execution_status', 'scoring', 'assessment'] as const;
export const CARD_ID_PREFIX = 'aq-card-1|';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers have no canonical form.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareCodePoints(left, right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  throw new TypeError('Value has no canonical JSON form.');
}

// Python's `sort_keys` orders by Unicode code point; default JS sorting orders by UTF-16 unit.
function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] as string).codePointAt(0)! - (b[index] as string).codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

export function resultIdentityPayload(body: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of RESULT_IDENTITY_PAYLOAD_KEYS) {
    if (key in body && body[key] !== undefined) payload[key] = body[key];
  }
  return payload;
}

export async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function computeResultSha256(body: Record<string, unknown>): Promise<string | null> {
  return sha256Hex(canonicalJson(resultIdentityPayload(body)));
}

/** `card_id = sha256("aq-card-1|" + analysis_id + "|" + result_sha256)`; the locale never enters it. */
export function computeCardId(analysisId: string, resultSha256: string): Promise<string | null> {
  return sha256Hex(`${CARD_ID_PREFIX}${analysisId}|${resultSha256}`);
}

export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
