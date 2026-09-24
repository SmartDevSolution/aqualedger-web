# AquaLedger Web

Next.js and TypeScript application for the AquaLedger analysis workspace. The product has two primary screens: Analysis Workspace and Settings / Data Sources. Both are available in English/LTR and Arabic/RTL.

## Runtime and commands

Use Node.js `22.22.2` and its bundled npm `10.9.7`, as pinned by `.nvmrc` and `packageManager` in `package.json`.

```sh
npm ci
npm run lint
npm run typecheck
npm run messages:check
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite starts the built app with `next start`. It exercises both locales at desktop and small widths, the map and drawing interaction, keyboard focus, input validation, locale switching, source-status empty state, and opening a saved-analysis URL without resubmitting it. The suite does not mock the backend.

`npm run dev` starts the development server. No `.env` file is required for the current contract-independent workspace foundation.

## Scope and current backend dependency

`/` and `/{locale}` redirect to `/{locale}/analysis`. `/{locale}/analysis/{id}` uses the same workspace as the draft route. History, results, provenance, and the NDVI preview are workspace panels. `/{locale}/settings` is a read-only data-source status screen.

The backend M1 branch and its generated `contracts/openapi.json` were not available when this foundation was started. The Run action therefore reports that it did not submit a request, Settings says that no source checks were requested, and saved analysis IDs remain unverified. The workspace shows no raster, execution success, source reachability, coverage, or provenance without a real backend response. No `contracts/BACKEND-REF.json` exists until the real artifact is consumed.

Before contract integration, read the central baseline documents 01, 02, 04, 06, and 10 plus the proposed M1 freeze at its pinned commit. The web client must consume the backend-generated artifact pinned by SHA and hash; this repository does not own an API schema or a backend copy.

## Dependency choices

- `next-intl` provides maintained locale routing and catalogs for the pinned Next.js App Router.
- ESLint 10, the Next.js flat-config plugin and typescript-eslint provide explicit lint checks; Next.js 16 no longer runs lint during build.
- MapLibre GL JS 6 renders the map; Terra Draw with its MapLibre adapter provides the single-polygon drawing interaction. MapLibre 6.11.2 includes the fix for the critical DOM sanitization advisory reported by npm.
- The build and dev lifecycle copies MapLibre's version-matched worker pair into ignored public assets, as required by its ESM worker format under Next.js.
- Turf area and validity packages reject unsupported client inputs early. Backend validation remains authoritative once the contract is integrated.
- Playwright covers behavior in a real browser against the built application.

The current basemap uses the public [OSM Bright demo style](https://demotiles.maplibre.org/styles/osm-bright-gl-style/style.json) hosted by MapLibre. It is an unauthenticated demo basemap, not a service availability promise. Its OpenMapTiles and OpenStreetMap attribution comes from the tile metadata and remains visible in the map controls; the separate note beside the map identifies the demo provider. Report load failures in the UI. Do not infer analytical coverage or source quality from basemap availability.

## Security and ownership

The web application contains no service/database credentials, EO credentials, migrations, worker code, analysis calculations, API proxy route, or privileged data access. When API integration is added, every analysis and source-status request must follow the pinned backend contract and the actual approved access model.
