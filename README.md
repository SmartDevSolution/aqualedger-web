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

`npm run test:e2e` builds the app once (the backend base URL and operator token are server-only runtime env, read at request time, not baked into the build) and runs Playwright against `next start`, pointed at a labelled-double backend fixture (`tests/fixtures/backend-double.ts`) started alongside it; its fixtures verify the same-origin relay's request construction (Bearer placement, Idempotency-Key forwarding, dropped inbound Authorization) and pending/failed/succeeded/result/error presentation in both locales. `npm run test:e2e:unconfigured` runs the same build with neither server-only variable set and checks the blocked states. Both suites cover Chromium at 1365×900 and 390×844. `npm run check-no-token-leak` builds once with a synthetic probe token and scans the build output for it (every file under `.next` except Next's local incremental-build cache under `.next/cache`, which is never deployed or served), failing if it cannot read an in-scope file, and asserting the operator token can never reach a client-reachable artifact. Fixture-backed tests are not backend integration evidence.

`npm run dev` starts the development server. Set the server-only `AQUALEDGER_API_BASE_URL` (the backend API base URL) and `AQUALEDGER_OPERATOR_JWT` (the operator bearer token) to enable analysis/source requests; neither is ever prefixed `NEXT_PUBLIC_` or read by browser code. Both are read only by a `server-only` module (`src/lib/api/server-config.ts`) used by the same-origin route handlers under `src/app/api/**` (Node runtime, dynamic); the browser calls only those same-origin paths and never learns the backend base URL or holds the token. The relay adds the Bearer only on `POST /analyses`, `GET /analyses/{id}` and `GET /analyses/{id}/result`; `GET /sources` is relayed without it; any inbound `Authorization` the browser sends is dropped, never forwarded. Never put a signing secret, service key, database URL, or provider credential in a `NEXT_PUBLIC_` variable.

## Scope and current backend dependency

`/` and `/{locale}` redirect to `/{locale}/analysis`. `/{locale}/analysis/{id}` uses the same workspace as the draft route. History, results, provenance, and the NDVI preview are workspace panels. `/{locale}/settings` is a read-only data-source status screen.

The backend artifact is pinned at `contracts/openapi.json`; `contracts/BACKEND-REF.json` records its commit, version and hashes, and `src/lib/api/generated.ts` is generated from it. The workspace sends `POST /api/analyses` (relayed to the backend's `POST /analyses`) only on an explicit click with an `Idempotency-Key`, polls saved IDs, and retrieves typed result responses. Settings reads `GET /api/sources`. Locale switching persists the choice and never submits a job. Timezone is not included in the API payload.

The current merged central baseline is `db404bffe536fc969eb0069deba1acaf3d4b1707` (PR #4); contract rules are pinned to ratified revision 8 at `413dc884a22b05e9f8ed239eb8236e230c640937`. Central PR #5 is still open and is not a merged baseline. Contract and implementation differences are recorded in `docs/CONTRACT-RECONCILIATION.md`, including which map-preview facts are already established on the hosted backend versus which part of the browser render path is still unverified there.

## Dependency choices

- `next-intl` provides maintained locale routing and catalogs for the pinned Next.js App Router.
- ESLint 10, the Next.js flat-config plugin and typescript-eslint provide explicit lint checks; Next.js 16 no longer runs lint during build.
- MapLibre GL JS 6 renders the map; Terra Draw with its MapLibre adapter provides the single-polygon drawing interaction. MapLibre 6.11.2 includes the fix for the critical DOM sanitization advisory reported by npm.
- The build and dev lifecycle copies MapLibre's version-matched worker pair into ignored public assets, as required by its ESM worker format under Next.js.
- `geotiff` (DP-4, central issue #8, the one dependency that decision authorizes) decodes the backend's RGBA NDVI preview GeoTIFF client-side so it can be rendered as a MapLibre canvas-source overlay; no second GeoTIFF/COG library is used, and the artifact's own recorded palette is never re-applied client-side.
- Turf area and validity packages reject unsupported client inputs early. Backend validation remains authoritative.
- `openapi-typescript` is a pinned development dependency used only to regenerate/check API types from the immutable backend artifact.
- `server-only` (0.0.1, zero dependencies) marks `src/lib/api/server-config.ts` so any accidental import from client code fails the build, giving the Council DP-2 "server-only module" requirement a compile-time guarantee rather than only a code-review convention.
- Playwright covers behavior in a real browser against the built application.

**The basemap is a real external provider (owner directive 2026-10-11, superseding DP-4 P2 of central issue #8).** `public/basemap/style.json` now renders **Esri World Imagery** satellite raster tiles with the **Esri World Boundaries and Places** reference overlay, both keyless public ArcGIS REST services. It replaces the M1 self-hosted minimal style (a background colour plus an inline graticule), which showed no geographical features and made AOI selection impractical. Satellite imagery is the deliberate choice for this product: AOIs are drawn over farmland, wadis and irrigation, which a street basemap does not show. The style file is still served from this app's own origin, and both sources declare attribution, which MapLibre's own attribution control renders; the note beside the map repeats it in English and Arabic. The map is now the only part of this app that makes a browser request to a third-party host, and that host is held to an explicit allowlist in `tests/e2e/preview.spec.ts`, so a future provider cannot be introduced silently.

## Security and ownership

The web application contains no service/database credentials, EO credentials, migrations, worker code, analysis calculations, or privileged data access. It does contain two authorized same-origin routes beyond plain relaying: the four Council DP-2 relay operations (`src/app/api/**`) recorded at `AmeenBinBisher/aqualedger#8`, and the DP-4 preview route (`src/app/api/analyses/[id]/preview`, same issue) that resolves the frozen signed `preview_url` server-side and streams its bytes — no second authorization model, no credential ever read from the browser or sent to the storage origin. A server-only operator JWT and backend base URL are read only server-side, with the Bearer added only on the three read/write analysis operations and never on `GET /sources`; the browser never holds the token. This is not an end-user login, a role/audience scheme, or a second application secret — the backend still authorizes every request against the single pinned operator principal. Hosted Supabase persist/enqueue, worker claim/commit and private Storage behavior beyond that relay remain NOT RUN/BLOCKED pending a live operator token and paired backend deployment. The returned NDVI GeoTIFF artifact is decoded client-side and rendered as a georeferenced map overlay (DP-4 P1); it is presented as an estimate, colored with the backend's own recorded palette, and every fetch/decode/CRS failure is reported honestly rather than shown as a fabricated layer. Do not treat browser fixtures as integration evidence or close M1 from a web-only result.
