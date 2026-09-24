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
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:unconfigured
```

`npm run test:e2e` creates a test-only build with an intercepted API origin and runs Playwright against `next start`; its fixtures verify browser request construction and pending/failed/succeeded/result/error presentation. `npm run test:e2e:unconfigured` creates a separate build with no API URL and checks the blocked states. Both suites cover Chromium at 1365×900 and 390×844. Fixture-backed tests are not backend integration evidence.

`npm run dev` starts the development server. Set `NEXT_PUBLIC_AQUALEDGER_API_BASE_URL` to the backend API base URL to enable browser requests. This is a public endpoint URL, not a credential. No access token is available in this web product yet; the backend analysis routes require a bearer token and return a localized authorization error without one. Never put a signing secret, service key, database URL, or provider credential in a public variable.

## Scope and current backend dependency

`/` and `/{locale}` redirect to `/{locale}/analysis`. `/{locale}/analysis/{id}` uses the same workspace as the draft route. History, results, provenance, and the NDVI preview are workspace panels. `/{locale}/settings` is a read-only data-source status screen.

The backend artifact is pinned at `contracts/openapi.json`; `contracts/BACKEND-REF.json` records its commit, version and hashes, and `src/lib/api/generated.ts` is generated from it. The workspace sends `POST /analyses` only on an explicit click with an `Idempotency-Key`, polls saved IDs, and retrieves typed result responses. Settings reads `GET /sources`. Locale switching persists the choice and never submits a job. Timezone is not included in the API payload.

The current merged central baseline is `db404bffe536fc969eb0069deba1acaf3d4b1707` (PR #4); contract rules are pinned to ratified revision 8 at `413dc884a22b05e9f8ed239eb8236e230c640937`. Central PR #5 is still open and is not a merged baseline. Contract and implementation differences, including the blocked auth and map-preview paths, are recorded in `docs/CONTRACT-RECONCILIATION.md`.

## Dependency choices

- `next-intl` provides maintained locale routing and catalogs for the pinned Next.js App Router.
- ESLint 10, the Next.js flat-config plugin and typescript-eslint provide explicit lint checks; Next.js 16 no longer runs lint during build.
- MapLibre GL JS 6 renders the map; Terra Draw with its MapLibre adapter provides the single-polygon drawing interaction. MapLibre 6.11.2 includes the fix for the critical DOM sanitization advisory reported by npm.
- The build and dev lifecycle copies MapLibre's version-matched worker pair into ignored public assets, as required by its ESM worker format under Next.js.
- Turf area and validity packages reject unsupported client inputs early. Backend validation remains authoritative.
- `openapi-typescript` is a pinned development dependency used only to regenerate/check API types from the immutable backend artifact.
- Playwright covers behavior in a real browser against the built application.

The current basemap uses the public [OSM Bright demo style](https://demotiles.maplibre.org/styles/osm-bright-gl-style/style.json) hosted by MapLibre. It is an unauthenticated demo basemap, not a service availability promise. Its OpenMapTiles and OpenStreetMap attribution comes from the tile metadata and remains visible in the map controls; the separate note beside the map identifies the demo provider. Report load failures in the UI. Do not infer analytical coverage or source quality from basemap availability.

## Security and ownership

The web application contains no service/database credentials, EO credentials, migrations, worker code, analysis calculations, API proxy route, or privileged data access. Analysis requests currently have no bearer-token provider, and the live authorized analysis journey is therefore BLOCKED. Hosted Supabase persist/enqueue, worker claim/commit and private Storage behavior remain NOT RUN/BLOCKED. The returned GeoTIFF artifact is not a browser-renderable georeferenced map preview, so that UI path is explicitly NOT RUN. Do not treat browser fixtures as integration evidence or close M1 from a web-only result.
