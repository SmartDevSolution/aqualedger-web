# Issue 27 — visual rework and deliberate differences

Implementation branch: `feat/27-dark-teal-workspace` / PR #28 (DRAFT, OPEN; no merge authorization).
Base correction commit: `98fc7c12b7973f945d04105951d7f8223c34e52f`.
Author as served: `gpt-6.1-sol`, OpenAI family, native `openai-codex` Hermes carrier.

## Reconstructed composition

The large Analysis Workspace title, introductory hero/prose, numbered input/map/result stack and giant empty result panel are removed. An accessible visually-hidden H1 remains. The shell now has a 52px header, leaf/water identity with Yemen submark, compact horizontal navigation, segmented locale switch, and explicitly unavailable search/account treatment. A 200px unified AOI/time/layers rail holds polygon entry/drawing, real layer toggles, history and a bottom primary action. The native MapLibre panel is dominant, with compass, side zoom controls, scale, conditional NDVI legend and returned-source provenance. The right side contains the mandatory two-column four-card summary, full-width trend state and compact decision-support card. Existing detailed statistics, quality, history, zone evidence, decision-card/print and scenario/JSON workflows remain available below; existing native disclosures retain explicit ARIA state/targets.

The existing palette variables are adjusted to the specified navy surfaces; the original teal accent is reused. There is no second palette, new runtime dependency, endpoint, route, backend call or contract change. The consumed contract remains 0.3.0 at backend `e060dc1f0caa956674927241f0f14a9ada9cf7cd`.

## Data and feature differences (deliberate, not invented outputs)

1. The concept's “Vegetation Health”/“Healthy” wording is replaced by Vegetation Index (NDVI) with an explicit observation-only caveat. Mean NDVI is read from `statistics.ndvi_mean`; absent/null values are unavailable. No health, yield, irrigation or water advice is inferred. The color segments are decorative, not a calibrated health classification.
2. The contract does not return total AOI area or a land-cover area split. Those cards explicitly say unavailable/not returned. The existing valid-observation area remains separately labelled in the detailed statistics; it is NOT relabelled total AOI area, and editable draft area is NOT substituted for saved-result area.
3. Observations counts are the actual `scenes_evaluated.length` (evaluated acquisition dates), not pixel counts or a vegetation-change percentage. The mini bars show only those dates' returned valid-coverage fractions; absent coverage is a dash, not a positive bar/zero. Key Evidence counts returned M2 source-manifest records when present; otherwise it is unavailable. No evidence thumbnails are returned, so none are fabricated.
4. The frozen saved-result contract has no AOI geometry/location name. The map frames its returned georeferenced preview footprint (or a returned zone), never an unrelated draft or a hardcoded Tuban polygon. This is an observation footprint, not an assertion that it is the original AOI. A named selected-region pill cannot be shown honestly without returned selection metadata. The editable polygon area remains in the rail only after a polygon is actually entered/drawn.
5. The concept monthly trend/deltas are not returned. A plot is permitted only for at least two non-missing OBSERVED NDVI entries of one selected zone, with actual dates/values; no cross-zone averaging, monthly interpolation, DERIVED-as-observed substitution or fabricated comparison. The populated screenshot fixture has no such series, so it shows “Not enough observations to plot a trend.” No monthly grouping control is invented.
6. The preview uses the backend's already-colored artifact, not a newly calculated NDVI raster. Legend visibility is gated on successful real preview decode/render and the user's layer toggle. Source collection, resolution and acquisition date are returned values, not the concept's Sentinel-2/10m/Oct-2024 string.
7. Search, avatar, Analytics/Reports/Areas/Data destinations and Rectangle/Point modes do not exist in this MVP. Search/avatar/shapes are disabled; unavailable navigation is visibly non-interactive, not fake links. Upload and region selection are omitted, preserving the existing unsupported-control guard. Supported polygon/GeoJSON/date/run/history/settings/locale flows remain real. The visible Map label retains the existing accessible Analysis Workspace navigation name.
8. Only supported layers are shown: returned NDVI preview, fixed satellite basemap and a working Place Labels toggle. No fake Moisture Index/True Color/Administrative Boundaries controls are added. The existing Esri basemap already contains the supported reference boundaries/labels together.
9. Decision Support links to the actual detailed analysis/actions rather than inventing Generate Report/Share services. The existing scored-result decision-card/print and scenario JSON actions remain in their original functional components.
10. The original bezel/laptop frame is deliberately excluded. Mobile stacks rail → map → results, with real 390x844 viewport and full-page evidence, rather than shrinking the desktop chart grid into unreadable columns. Arabic mirrors UI panels but not geographic orientation, analytical axes, numeric strings or color-ramp order. No new font/dependency is introduced.
11. Functional descriptions, input validation and stage states remain available. The left primary action uses the reference's Update Map visual label while retaining the existing Run Analysis accessible name and real submit behavior. The user's existing editable draft is never silently overwritten with the saved result or concept dates.

## Evidence and fixture disclosure

Current evidence is under `docs/ui-evidence/issue-27/rework/`; older top-level fixture/correction images are historical, not final visual acceptance.

- EN/AR populated desktop: `*-populated-browser-fixture-1091x690.png` and `*-populated-browser-fixture-1440x900.png`.
- EN/AR empty desktop: `*-empty-browser-fixture-1091x690.png`.
- EN/AR mobile: `*-populated-browser-fixture-390x844.png` plus `*-full.png`.
- EN/AR same-height, labelled comparisons: `*-reference-comparison-browser-fixture-1091x690.png` and `*-reference-comparison-browser-fixture-1440x900.png`.
- `capture-measurements.json` records actual viewport/panel/map bounds.
- Reproduce with `node scripts/capture-ui-evidence.mjs` after a production build, then `python3 scripts/compare-ui-evidence.py` (Pillow is an evidence-script tool, not an application dependency).

These are explicitly BROWSER-TEST FIXTURES, not genuine saved production analyses. They load the existing completed PREVIEW_READY saved-analysis route and relay/GeoTIFF fixture. The screenshot-only browser interception positions that existing synthetic artifact over a Yemen extent (UTM 38N bounds 452000,1420000–495000,1480000) for regional comparison. Its colored rectangle is a synthetic test raster, not a real Tuban NDVI map, AOI or scientific measurement; its spatial pixel scale is not scientific evidence. No statistics, dates, counts, source metadata or time series are invented by the screenshot script. This fixture distinction is in every filename and the measurement report. Public Esri background tiles remain real, network-dependent tiles. Neither these captures nor unit/browser fixtures establish hosted backend scientific acceptance.

## Existing test changes and stronger new coverage

No tests are deleted or skipped. Three assertions in the old composition test are adapted to the owner's new visual target: exact 8px map inset replaces exact panel-top alignment; exact #0d1c2b replaces the previous #08262d panel color (contrast threshold retained); the newly required trend-card heading is allowed while a real plot/monthly/health output is still forbidden when data is absent. The previous no-unsupported-action and no-concept-number assertions remain.

The correction test retains every bidi, hint visibility/localization, contrast and disclosure assertion. Measurements now center the real frame after screenshot scrolling and keep a multi-frame real CDP touch active during mobile-hint measurement: MapLibre removes the mobile hint on touchEnd, so asserting its visibility afterward was timing-dependent. Four repeated EN/AR mobile tests passed after that correction. The hint is not forced visible by DOM/style manipulation.

Eight added project executions cover the empty/populated dashboard structure, no legacy hero/placeholder, honest missing area/trend, real returned mean/provenance, functioning NDVI toggle, exact 52px/200px geometry at both desktop sizes, bottom CTA visibility and disabled unsupported controls. Existing drawing, analysis states, identity, history, scenario, print, preview/render, RTL and keyboard assertions remain.

## Verification and hold

Fresh final execution: lint PASS (zero warnings), typecheck PASS, production build PASS, messages:check PASS, contracts:check PASS (0.3.0 / e060dc1f0caa956674927241f0f14a9ada9cf7cd), token-leak PASS (338 files, 16 build-cache exclusions, zero unreadable), relay-log-leak PASS (4 relay calls + 1 preview call), preview-decode PASS, git diff --check PASS. Full real-Chromium EN/AR desktop/mobile suite: 326 passed in 4.5 minutes, zero failures/skips. Unconfigured fail-closed suite: 6 passed in 7.1 seconds. Eight captured states, two additional full-page mobile captures and four labelled side-by-side comparisons were regenerated after the final production build. Gate logs are committed alongside the captures. The pushed head is recorded in the completion handoff/GitHub comments (avoiding a self-referential commit hash). Local Chromium execution uses the labelled backend double; authenticated hosted preview/backend and production verification are NOT RUN by this worker.

The prior Arabic acquisition-date bidi isolation, opaque high-contrast MapLibre attribution and gesture hint, and explicit disclosure aria-expanded/aria-controls are preserved. No production copy/data hardcodes the concept's +18%, 0.62, 12,450 ha, 9,230/3,220 ha, 8 observations, +27%, “Healthy”, or smooth monthly trend as facts. Existing test fixtures are not production facts.

Independent cross-family visual + functional review is still required on the new head. PR #28 must stay DRAFT/OPEN, auto-merge OFF, issue #27 OPEN. Owner personal visual inspection and a subsequent explicit merge authorization remain mandatory. No merge, production deploy, protection change or shared-environment mutation is performed here.
