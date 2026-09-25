import 'server-only';

// Council DP-2 verdict (issue #8): server-only runtime env, never `NEXT_PUBLIC_`. Read only by
// this module, which is only ever imported by Next.js route handlers under `src/app/api/**`.
export type RelayConfig = {
  baseUrl: string;
  token: string | null;
};

export function getRelayConfig(): RelayConfig | null {
  const rawBaseUrl = process.env.AQUALEDGER_API_BASE_URL?.trim();
  if (!rawBaseUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return null;
  }

  const rawToken = process.env.AQUALEDGER_OPERATOR_JWT?.trim();
  return {
    baseUrl: parsed.toString().replace(/\/+$/, ''),
    token: rawToken ? rawToken : null
  };
}
