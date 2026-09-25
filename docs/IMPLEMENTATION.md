# Web implementation contract

Full product/science/acceptance authority is in the central repository, not duplicated here. The current merged central baseline is `AmeenBinBisher/aqualedger@db404bffe536fc969eb0069deba1acaf3d4b1707` (central PR #4). The ratified M1 contract is pinned separately at `AmeenBinBisher/aqualedger@413dc884a22b05e9f8ed239eb8236e230c640937`, document `docs/current/11-M1-CONTRACT-FREEZE.md` revision 8. Central PR #5 is an open governance proposal and is not part of the merged baseline. Read central documents 00–10 at the merged baseline and the frozen contract at its ratified SHA before changing behavior.

## Page and locale structure

Use App Router with locale segment `ar`/`en`. Indicative paths: `src/app/[locale]/analysis/page.tsx`, `src/app/[locale]/analysis/[id]/page.tsx`, and `src/app/[locale]/settings/page.tsx`. Both analysis routes compose one workspace. Use shared localized layout/navigation. Do not generate empty directory structures beyond actual implementation.

Set server-rendered lang/dir; use logical spacing/alignment and bidi isolation for source names/IDs/coordinates. One maintained localization solution such as next-intl, checked against the selected Next.js version, is enough. Message catalogs live in this repo and pass key/parameter parity checks. Respect native async/router conventions for the pinned versions rather than copying stale examples.

Display Gregorian dates consistently with the backend ISO/UTC interval contract. Numeric values remain raw in transport and formatted only at presentation. Switching locale preserves dates/AOI/analysis ID/selection and never enqueues a job. UI direction must not mirror geographic orientation, compass, geometry or data values. Test maps/drawers/menus/tooltips/charts/focus order at desktop and small widths in both directions.

## API consumer

Backend generates `contracts/openapi.json`. The consumed artifact is pinned in `contracts/BACKEND-REF.json` to backend commit `998453aad0c446908e57aab0edc473cbe388b6cc` (the single Council-sequenced re-pin recorded on `AmeenBinBisher/aqualedger#8`), contract version `0.1.0`, and its Git blob/SHA-256 hashes. `src/lib/api/generated.ts` is generated from that checked-in artifact with `openapi-typescript`; `npm run contracts:check` checks the recorded identity and generated-file drift. Reproducible web builds never fetch a moving backend branch or import a sibling backend source tree.

Implement the central request/status/result/source-status/error contract. Stable machine codes map to localized messages; do not parse English error prose. Known missing translations fail checks; unknown server codes display a safe localized generic error with correlation ID. Caching is scoped to actual authorization and run identity. See `docs/CONTRACT-RECONCILIATION.md` for the exact current artifact/freeze differences and blocked UI paths.

Map/AOI/date interaction is client-side where necessary. API owns job creation; no analytical duplicate in Next.js routes/server actions. Request on explicit user action with idempotency handling, not on mount/locale navigation. Poll saved status at a bounded rate and stop on terminal states/unmount. Late responses cannot replace the selected run with another result.

## Workspace and settings delivery

M1: bilingual map/drawing/dates/run/real stage/NDVI/provenance/reopen and a truthful source-status screen. Use actual backend check records, NOT_CHECKED where absent, distinguish configured from reachable and reachable from scientifically suitable. No credential manager, arbitrary URL input, activation CRUD or automatic expensive checks on navigation.

M2: evidence layers/series/baseline/quality disclosures. M3: eligible priorities, evidence/reasons, bounded history drawer and bilingual decision-card view/export. M4: separate hypothetical scenario panel with permanent labels/assumptions. None needs an extra primary screen. Do not create a chart/export format collection: one usable localized print/export path is sufficient if tested.

A basemap library does not supply unlimited hosted tiles or rights; document the chosen provider/attribution. Do not use a permanent fake raster when real data is missing. State exact source/render failures instead.

## First implementation PR and tests

Add minimal working Next.js setup, supported pinned versions/lockfile, real tested README commands and public/server environment distinction without secrets. No production EO secrets or Supabase service/database keys in NEXT_PUBLIC variables.

CI: reproducible install, lint, strict typecheck, build, relevant behavior tests, catalog parity and pinned contract compatibility. Browser acceptance covers both locales, invalid inputs, missing/outage data, refresh/reopen, locale switching and small-screen keyboard/focus behavior. Full M1 gate requires real paired backend runs and independent sample verification, not only mocked client tests.

`npm run test:e2e:unconfigured` must prove the app fails closed (`API_NOT_CONFIGURED`) with no server-only env configured, in any checkout — including one that legitimately keeps a `.env.local` for the acceptance run below. Next.js loads `.env`/`.env.local`/etc. itself, at both `next build` and `next start`, independent of what env a parent process passes down, so a config that only edits the spawned process's env cannot stop that file being read. `scripts/test-e2e-unconfigured.mjs` makes the gate deterministic instead: it moves aside every local `.env*` file (except the committed `.env.example`) before building and running Playwright, and restores them unconditionally afterward — including on failure or SIGINT/SIGTERM — printing what it moved and restored. Run it exactly like any other npm script; no manual env cleanup is required or expected.

`npm run check-relay-log-leak` exercises the relay module against the labelled backend double with a synthetic operator token while capturing every stdout/stderr write and console call, and fails if the token or the outbound Authorization value ever appears in that capture. This is a distinct gate from `npm run check-no-token-leak`, which scans build artifacts, not runtime/log output.

Each PR links the central mission and any backend dependency, names the tested counterpart SHA and contract/migration state, and distinguishes web checks from integrated checks. Do not mark an end-to-end mission done until both merged dev revisions pass together. No new hosting/accounts/spending or public deployment during setup.
