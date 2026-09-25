# AquaLedger Web

Next.js and TypeScript application for the AquaLedger analysis workspace. The product has two primary screens: Analysis Workspace and Settings / Data Sources. Both are available in English/LTR and Arabic/RTL.

## Runtime and commands

Use Node.js `22.22.2` and its bundled npm `10.9.7`, as pinned by `.nvmrc` and `packageManager` in `package.json`.

```sh
npm ci
npm run lint
npm run typecheck
npm run messages:check
npm run contracts:check
npm run check-no-token-leak
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:unconfigured
```

`npm run test:e2e` builds the app once (the backend base URL and operator token are server-only runtime env, read at request time, not baked into the build) and runs Playwright against `next start`, pointed at a labelled-double backend fixture (`tests/fixtures/backend-double.ts`) started alongside it; its fixtures verify the same-origin relay's request construction (Bearer placement, Idempotency-Key forwarding, dropped inbound Authorization) and pending/failed/succeeded/result/error presentation in both locales. `npm run test:e2e:unconfigured` runs the same build with neither server-only variable set and checks the blocked states. Both suites cover Chromium at 1365×900 and 390×844. `npm run check-no-token-leak` builds once with a synthetic probe token and scans the entire build output for it, asserting the operator token can never reach a client-reachable artifact. Fixture-backed tests are not backend integration evidence.

`npm run dev` starts the development server. Set the server-only `AQUALEDGER_API_BASE_URL` (the backend API base URL) and `AQUALEDGER_OPERATOR_JWT` (the operator bearer token) to enable analysis/source requests; neither is ever prefixed `NEXT_PUBLIC_` or read by browser code. Both are read only by a `server-only` module (`src/lib/api/server-config.ts`) used by the same-origin route handlers under `src/app/api/**` (Node runtime, dynamic); the browser calls only those same-origin paths and never learns the backend base URL or holds the token. The relay adds the Bearer only on `POST /analyses`, `GET /analyses/{id}` and `GET /analyses/{id}/result`; `GET /sources` is relayed without it; any inbound `Authorization` the browser sends is dropped, never forwarded. Never put a signing secret, service key, database URL, or provider credential in a `NEXT_PUBLIC_` variable.

## Scope and current backend dependency

`/` and `/{locale}` redirect to `/{locale}/analysis`. `/{locale}/analysis/{id}` uses the same workspace as the draft route. History, results, provenance, and the NDVI preview are workspace panels. `/{locale}/settings` is a read-only data-source status screen.

The backend artifact is pinned at `contracts/openapi.json`; `contracts/BACKEND-REF.json` records its commit, version and hashes, and `src/lib/api/generated.ts` is generated from it. The workspace sends `POST /api/analyses` (relayed to the backend's `POST /analyses`) only on an explicit click with an `Idempotency-Key`, polls saved IDs, and retrieves typed result responses. Settings reads `GET /api/sources`. Locale switching persists the choice and never submits a job. Timezone is not included in the API payload.

The current merged central baseline is `db404bffe536fc969eb0069deba1acaf3d4b1707` (PR #4); contract rules are pinned to ratified revision 8 at `413dc884a22b05e9f8ed239eb8236e230c640937`. Central PR #5 is still open and is not a merged baseline. Contract and implementation differences, including the blocked auth and map-preview paths, are recorded in `docs/CONTRACT-RECONCILIATION.md`.

## Dependency choices

- `next-intl` provides maintained locale routing and catalogs for the pinned Next.js App Router.
- ESLint 10, the Next.js flat-config plugin and typescript-eslint provide explicit lint checks; Next.js 16 no longer runs lint during build.
- MapLibre GL JS 6 renders the map; Terra Draw with its MapLibre adapter provides the single-polygon drawing interaction. MapLibre 6.11.2 includes the fix for the critical DOM sanitization advisory reported by npm.
- The build and dev lifecycle copies MapLibre's version-matched worker pair into ignored public assets, as required by its ESM worker format under Next.js.
- Turf area and validity packages reject unsupported client inputs early. Backend validation remains authoritative.
- `openapi-typescript` is a pinned development dependency used only to regenerate/check API types from the immutable backend artifact.
- `server-only` (0.0.1, zero dependencies) marks `src/lib/api/server-config.ts` so any accidental import from client code fails the build, giving the Council DP-2 "server-only module" requirement a compile-time guarantee rather than only a code-review convention.
- Playwright covers behavior in a real browser against the built application.

The current basemap uses the public [OSM Bright demo style](https://demotiles.maplibre.org/styles/osm-bright-gl-style/style.json) hosted by MapLibre. It is an unauthenticated demo basemap, not a service availability promise. Its OpenMapTiles and OpenStreetMap attribution comes from the tile metadata and remains visible in the map controls; the separate note beside the map identifies the demo provider. Report load failures in the UI. Do not infer analytical coverage or source quality from basemap availability.

## Security and ownership

The web application contains no service/database credentials, EO credentials, migrations, worker code, analysis calculations, or privileged data access. It does contain one authorized same-origin relay (`src/app/api/**`), implementing exactly the Council DP-2 access model recorded at `AmeenBinBisher/aqualedger#8`: a server-only operator JWT and backend base URL, read only server-side, with the Bearer added only on the three read/write analysis operations and never on `GET /sources`; the browser never holds the token. This is not an end-user login, a role/audience scheme, or a second application secret — the backend still authorizes every request against the single pinned operator principal. Hosted Supabase persist/enqueue, worker claim/commit and private Storage behavior beyond that relay remain NOT RUN/BLOCKED pending a live operator token and paired backend deployment. The returned GeoTIFF artifact is not a browser-renderable georeferenced map preview, so that UI path is explicitly NOT RUN. Do not treat browser fixtures as integration evidence or close M1 from a web-only result.
