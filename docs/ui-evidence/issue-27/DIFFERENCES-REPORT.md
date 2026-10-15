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
- EN/AR empty desktop: `*-empty-browser-fixture-1091x690.png` and `*-empty-browser-fixture-1440x900.png`.
- EN/AR mobile: `*-{populated,empty}-browser-fixture-390x844.png` plus `*-full.png`.
- Twelve labelled, matched-size reference comparisons: `*-{populated,empty}-reference-comparison-browser-fixture-{1091x690,1440x900,390x844}.png`. The full reference is fitted without distortion/cropping into the same-size left panel; mobile is explicitly a responsive adaptation, not a mobile reference design.
- `capture-measurements.json` records actual viewport/panel/map/card/decision bounds. `before-geometry.json` is the independently reproduced original 30d0057 browser geometry; `geometry-before-after.json` summarizes both at the acceptance desktop sizes.
- Reproduce with `npm run build:e2e && node scripts/capture-ui-evidence.mjs && node scripts/summarize-dashboard-geometry.mjs`, then `python3 scripts/compare-ui-evidence.py` (Pillow is an evidence-script tool, not an application dependency). The E2E production build enables the existing map inspection seam only; no fixture enters production source.

These are explicitly BROWSER-TEST FIXTURES, not genuine saved production analyses. They load the existing completed PREVIEW_READY saved-analysis route and relay/GeoTIFF fixture. The screenshot-only browser interception positions that existing synthetic artifact over a Yemen extent (UTM 38N bounds 452000,1420000–495000,1480000) for regional comparison. Its colored rectangle is a synthetic test raster, not a real Tuban NDVI map, AOI or scientific measurement; its spatial pixel scale is not scientific evidence. No statistics, dates, counts, source metadata or time series are invented by the screenshot script. This fixture distinction is in every filename and the measurement report. Public Esri background tiles remain real, network-dependent tiles. Neither these captures nor unit/browser fixtures establish hosted backend scientific acceptance.

## Existing test changes and stronger new coverage

No tests are deleted or skipped. Three assertions in the old composition test are adapted to the owner's new visual target: exact 8px map inset replaces exact panel-top alignment; exact #0d1c2b replaces the previous #08262d panel color (contrast threshold retained); the newly required trend-card heading is allowed while a real plot/monthly/health output is still forbidden when data is absent. The previous no-unsupported-action and no-concept-number assertions remain.

The correction test retains every bidi, hint visibility/localization, contrast and disclosure assertion. Measurements now center the real frame after screenshot scrolling and keep a multi-frame real CDP touch active during mobile-hint measurement: MapLibre removes the mobile hint on touchEnd, so asserting its visibility afterward was timing-dependent. Four repeated EN/AR mobile tests passed after that correction. The hint is not forced visible by DOM/style manipulation.

Eight added project executions cover the empty/populated dashboard structure, no legacy hero/placeholder, honest missing area/trend, real returned mean/provenance, functioning NDVI toggle, exact 52px/200px geometry at both desktop sizes, bottom CTA visibility and disabled unsupported controls. Existing drawing, analysis states, identity, history, scenario, print, preview/render, RTL and keyboard assertions remain.

## Corrective round M1 / L1–L4 (2026-10-15)

M1 was reproduced against 30d0057 before editing the layout: the 1091x690 populated decision card ended at y=697.06 in both locales, outside the 690px viewport. The results column is now 39% at both desktop sizes, with a fixed 200px input rail and the map taking the remaining width after two 8px gaps. Metric minima are 120px, the unavailable trend body is 84px, and real dated plots have a 94px presentation height. No content is hidden/clipped to achieve the fold. A minimum-height compact wrapper keeps the detailed stack below the initial viewport, with ordinary scrolling and the existing anchor exposing it; mobile/print remove that minimum.

Actual populated browser measurements (all px; exact values and percentages in `rework/geometry-before-after.json`):

| Viewport | Input | Map before → after | Results before → after | Metric width before → after | Decision bottom EN / AR before → after |
| --- | --- | --- | --- | --- | --- |
| 1091x690 | 200 (18.33%) | 569.53 (52.20%) → 449.52 (41.20%) | 305.47 (28%) → 425.48 (39%) | 141.73 → 201.73 | 697.06 / 697.06 → 650.72 / 637.53 |
| 1440x900 | 200 (13.89%) | 820.81 (57%) → 662.41 (46%) | 403.19 (28%) → 561.59 (39%) | 190.59 → 269.80 | 660.72 / 660.72 → 637.53 / 637.53 |

Proportion disclosure: with the explicitly requested fixed 200px rail, the map is 41.20% at 1091 and 46% at 1440, not literally 38%. The results target is 39% at both widths; all remaining space belongs to the operational map instead of inventing a spacer or widening the input rail beyond the requested compact size. NDVI heading fits on one line in the captured EN/AR desktop cards. The full compact result set fits above the fold in populated and empty states; the real dated-series positive test also checks this at both sizes. No horizontal overflow in any of the twelve captured states.

- L1: existing tracked logs are whitespace-normalized; the reproducible gate-capture script trims progress-line whitespace/blank EOFs. Full `origin/dev...HEAD` check, not merely working-tree check, is required in the commit handoff.
- L2: an untouched or cleared AOI no longer produces a warning merely for being null. Explicit invalid coordinate submission still reports the exact localized polygon error. A present invalid polygon/date still uses validation. EN/AR desktop/mobile positive invalid-action tests pass.
- L3: plot X coordinates now use elapsed UTC calendar time between actual observation dates. This is chart positioning only, not scientific calculation or interpolation. Positive fixture observations at Aug 1 / 3 / 21 assert x=24 / 51.2 / 296 and exact returned Y values; other zones, DERIVED and MISSING values do not enter the curve. EN/AR and both browser projects pass.
- L4: returned empty `scenes_evaluated` displays “0 evaluated dates” (localized Arabic equivalent), never a bare measurement-like 0. Absent scenes still display Unavailable. Nonempty dates retain their actual count and coverage bars.

No backend/contract/package changes. This is implementation evidence, not independent review or owner visual acceptance. Author as served: gpt-6.1-sol / OpenAI / openai-codex. The task's explicit owner-authorized THE ELITE seating supersedes the older repository Composer-only routing for this corrective round; no new Council work was commissioned.

## Verification and hold

Fresh corrective execution: all 12 commands in `rework/gate-results.json` exit 0. Lint has zero warnings; typecheck, production build, messages:check (EN/AR parity, 31 reason codes, 11 groups), contracts:check (0.3.0 / e060dc1f0caa956674927241f0f14a9ada9cf7cd), token-leak (338 files, 16 cache exclusions, zero unreadable), relay-log-leak (4 relay calls + 1 preview), and preview-decode all pass. Real-Chromium desktop/small-width EN/AR: 334 passed, zero failures/skips (4.2 minutes); unconfigured fail-closed: 6 passed, zero failures/skips. Twelve viewport states, four extra full-page mobile captures and twelve matched-size comparisons were regenerated. `npm ci` installed 272 packages/audited 273; it reported 7 existing high-severity advisories and an npm-engine warning (host Node 26.8.1/npm 11.19.0 vs required npm >=10.9.7 <11). No dependency/lockfile changes or automatic audit fixes were made. Full-range whitespace verification is recorded after the additive commit in the GitHub handoff; the prior claim was wrong because it checked only the working tree. Local Chromium uses the labelled backend double. Hosted authenticated Vercel acceptance is SSO-blocked: NOT RUN, not a pass. CI/Vercel statuses are readbacks only and do not substitute for authenticated acceptance.

The prior Arabic acquisition-date bidi isolation, opaque high-contrast MapLibre attribution and gesture hint, and explicit disclosure aria-expanded/aria-controls are preserved. No production copy/data hardcodes the concept's +18%, 0.62, 12,450 ha, 9,230/3,220 ha, 8 observations, +27%, “Healthy”, or smooth monthly trend as facts. Existing test fixtures are not production facts.

Independent cross-family visual + functional review is still required on the new head. PR #28 must stay DRAFT/OPEN, auto-merge OFF, issue #27 OPEN. Owner personal visual inspection and a subsequent explicit merge authorization remain mandatory. No merge, production deploy, protection change or shared-environment mutation is performed here.
