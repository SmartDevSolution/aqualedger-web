# Issue 27 — independent-review corrections

Author: gpt-6.1-sol / OpenAI family, openai-codex carrier, task `t_21638b02`. This is implementation evidence, not independent approval. Baseline: reviewed commit `e92e1f9eaa1efeb40c8ba9efc77e850100a463ee`. PR #28 remains subject to fresh cross-family review and the owner's personal review/explicit merge authorization.

## Per-finding reproduction and correction

Measurements and actual Chromium screenshots are stored in `corrections/`. `before-*.json` and `before-*-overlays.png` were generated against the reviewed baseline before production code changes. `after-*.json`, `after-*-date.png`, `after-*-map.png`, and `after-*-overlays.png` were generated against the corrected code. All use the repository's labelled synthetic backend double, not production EO measurements. Desktop: 1365x900; mobile: 390x844, touch enabled. EN and AR both ran in each viewport.

### 1. Acquisition-date bidi order — reproduced, with a factual correction

The review's description of Arabic month names and Arabic-Indic digits does NOT reproduce with this application's fixed Latin-digit Gregorian formatter. The actual Arabic string is `30\u200f/08\u200f/2026` (the `\u200f` escapes here describe the RLM characters; the JSON contains the actual characters). `src/lib/format.ts` is unchanged.

The bidi defect itself DOES reproduce. Chromium Range bounding boxes on Arabic desktop before the fix put day `30` at x=315.625, month `08` at x=361.890625 and year `2026` at x=329.859375: the visual segments are scrambled, not a coherent date. Changing only the selected-acquisition Fact to `dir="auto"` resolves to RTL and yields day x=365.453125, month x=347.65625, year x=315.625, a consistent right-to-left day/month/year sequence. The mobile JSON independently records the same directional ordering. English remains `Aug 30, 2026`, LTR, with ascending word positions. Dedicated date crops allow inspection without downscaling the full-page screenshots.

Regression assertions require auto direction, locale-correct resolved direction, and correctly ordered bounding boxes for EVERY date segment, not just unchanged text content.

### 2. Map overlays — both defects reproduced and corrected

Chromium computed-color contrast measurements, identical in EN/AR and desktop/mobile:

| Control | Before | After | Treatment |
| --- | ---: | ---: | --- |
| MapLibre attribution | 1.1298:1 | 14.0231:1 | Explicit dark text/link color #08262d, opaque light #e6f4f2 background |
| Cooperative-gestures hint | 2.8490:1 | at least 13.7717:1 | White text over rgba(3,25,31,0.9) |

Method: WCAG relative luminance from browser-resolved RGB values. For translucent backgrounds the measurement composites the computed RGBA color over white, the brightest possible satellite pixel. This is a conservative analytical contrast bound, not an invented claim to have sampled every basemap pixel. The opaque attribution background is independent of the basemap. The hint's true contrast over darker imagery is no worse than the reported minimum. The baseline bound shows why the old treatment could fail over bright tiles; the baseline screenshot also shows the real map and hint.

The source's Esri/Vantor/Earthstar/HERE/Garmin/OpenStreetMap attribution text is unchanged. These particular MapLibre attribution strings contain plain text rather than anchors; explicit link CSS is supplied for any source anchors. Tests assert preserved Esri content and measure every rendered link when present. Normal map crops show attribution without the transient gesture scrim; overlay captures show the actual hint triggered by desktop wheel or mobile one-finger touch input. The hint temporarily shades the map, including its controls, as it did before; it does not remove attribution. Localized desktop/mobile hint strings are asserted against the unchanged catalogs. MapLibre options, locale mappings, sources and tile URLs are unchanged.

### 3. Explicit disclosure state/linkage — reproduced and corrected

Before: application-native summary triggers have neither explicit `aria-expanded` nor `aria-controls`. After: the small `NativeDisclosure` rendering helper preserves real `details` and `summary`; the browser still owns open/close, focus and keyboard handling. It mirrors native `toggle` events into `aria-expanded` and uses React `useId` to connect each summary to its own content div. There are no custom key handlers, substituted roles, controlled `open` state or disclosure framework/dependency.

Applied to coordinate input, pixel-rejection counts, baseline, scenes, limitations, provenance and repeated zone technical disclosures. The new browser gates exercise Enter to open, Space to close, explicit state and target visibility, and unique targets across repeated zone disclosures. MapLibre's hidden non-compact attribution summary is library-internal and is not an application disclosure trigger; tests explicitly exclude it rather than changing vendor behavior.

## Verification executed on corrected source

- `npm ci`: completed; package manifest/lockfile unchanged.
- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: production build passed; output in `corrections/production-build.log`.
- `npm run messages:check`: passed; EN/AR keys/parameters, 31 M3 reason-code entries and 11 panel groups.
- `npm run contracts:check`: passed; contract 0.3.0 / backend `e060dc1f0caa956674927241f0f14a9ada9cf7cd` unchanged.
- `npm run test:e2e -- --workers=2`: **318 passed**, zero failed/skipped, real Chromium, EN/AR desktop/mobile. Existing 314 tests retained; four correction cases added (2 locales x 2 viewport projects). Final output: `corrections/e2e.log`.
- `npm run test:e2e:unconfigured`: **6 passed**, zero failed/skipped; final output in `corrections/unconfigured.log`.
- `npm run check-no-token-leak`, `npm run check-relay-log-leak`, `npm run check-preview-decode`: passed; separate logs retained.
- `git diff --check`: passed.

Existing assertions were neither removed nor weakened. New `tests/e2e/review-corrections.spec.ts` extends the existing composition/contrast/accessibility acceptance surface. The `CORRECTION_BASELINE=1` diagnostic mode records the old measurements without requiring corrected behavior; normal runs enforce all correction assertions. Initial new-test iteration accidentally included MapLibre's hidden internal summary; narrowing to application disclosures fixed the test scope, not production behavior. The original eight composition cases still pass. Existing history, scenario, print/export, truthful execution/preview states, unsupported-control and science/data-honesty gates all remain in the full passing suite.

The four top-level EN/AR desktop/mobile fixture captures beside IMPLEMENTATION-REPORT.md are refreshed from the final full-suite run. Local Node 26.8.1 / npm 11.19.0 remains outside the declared npm <11 range; install reports seven high-severity dependency audit findings. No dependency/toolchain remediation is included in this bounded correction. Hosted authenticated preview/backend and production verification: NOT RUN. No shared environment/protection setting or deployment was changed.

## Deviation report / hold

Only findings 1–3 changed: date isolation, map-overlay color treatment, explicit state/linkage around native disclosures, and related tests/evidence. No new route, endpoint, dependency, backend call, contract change, date/unit semantic change, scientific computation or fabricated UI data. Existing scientific disclosures are retained. Accepted LOW deviations remain unchanged: mobile Draw-polygon placement below the map and duplicate step/heading polish.

Do not merge, enable auto-merge, close issue #27, deploy to production, rewrite the reviewed commit, or squash/cherry-pick into dev/main. The pre-created child `t_7a378734` must independently re-review the newly pushed head, and the owner must personally review the branch before separately authorizing any merge.
