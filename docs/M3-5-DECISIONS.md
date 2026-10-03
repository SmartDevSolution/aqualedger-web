# M3-5 decisions (web zone priority/evidence panels, history drawer, decision card, print)

Scope: the existing `/{locale}/analysis`, `/{locale}/analysis/{id}` and `/{locale}/settings` screens.
No new route. Fixtures are labelled test-double content; nothing here is a production-accuracy claim.
This note records the six Council conditions routed from the M3-4 gate (PR #10, seat
`claude-fable-5-1`) and how M3-5 meets each.

1. UNRANKED rows never show `c` / `display` / `class`.
   `EvidenceClassBadge` renders the class and composite only when the zone is RANKED. The technical
   view's composite line is gated the same way. The test double's Z-4 is UNRANKED but its payload
   carries `class: HIGH, c: 0.90`; the e2e asserts neither appears (en and ar).

2. Arabic presentation of `HIGH` / `MEDIUM` / `LOW`: a catalog label, not a contract literal.
   The tokens render through `evidenceQuality.class.*` (ar: مرتفعة / متوسطة / منخفضة), always inside the
   badge that names its axis ("evidence quality") and says "uncalibrated". Rationale: the class is
   user-facing prose about an evidence axis, not an identifier; a bare Latin `HIGH` in an RTL sentence
   invites reading it as a priority class. Identifiers that ARE contract literals (zone ids, source ids,
   reason codes in the fallback, hashes, `aq-scorecard-1`) are isolated with `<bdi dir="ltr">`.

3. `priority_class_status` is bound to the body (reworded in round 2, card t_38e1dae0).
   The "priority class not established under method X" sentence renders only when
   `scoring.priority_class_status === 'NOT_ESTABLISHED'`. Any other value renders
   `zones.priorityClassUnrecognised`, which quotes the reported status verbatim and states that no
   priority class is shown for this result, **without** restating that status as "not established" or
   any other concluded class; an absent status renders `zones.priorityClassAbsent`, which reports the
   absence and likewise asserts no class. Neither branch converts the evidence-quality class into a
   priority. Covered by e2e cases that rewrite the status in the relay response (`ESTABLISHED_FUTURE`
   and the absent case), each asserting that the fixed "not established" claim is absent from both the
   banner and the card's priority-class limitation.
   Round-2 correction: the previous `priorityClassUnrecognised` wording *began* with "Priority class
   not established under method …", so at the rendered fallback this item's "renders only when
   `NOT_ESTABLISHED`" claim was false — exactly what the Council recorded as B2. The card carries the
   same treatment (`limitationNoClassUnrecognised` / `limitationNoClassAbsent`), and only the
   `NOT_ESTABLISHED` body may state the v1 conclusion.

4. Repository gate for the closed reason vocabulary.
   `scripts/check-messages.mjs` (part of `npm run messages:check` / `npm test`) reads
   `contracts/openapi.json` `M3ReasonCode.enum` and fails if any member lacks a non-empty
   `reasons.<CODE>` entry in `en` or `ar`. All 31 members currently pass.

5. Diagnostic on the unknown-code fallback.
   `reasons._unknown` carries the unrecognized code and the analysis id as the reference
   (`useReasonText(analysisId)`), so a code the backend adds before a re-pin is traceable to one saved
   analysis. The e2e checks the code and the analysis id are both visible on the zone surface.
   Confounder codes have their own `confounders.unknown` fallback (they are a different vocabulary, so
   `useReasonText` does not cover them); it carries the unrecognized code isolated and does **not**
   name an analysis reference — the earlier claim that it follows the analysis-reference pattern was
   inaccurate (corrected in round 2, card t_38e1dae0). The same isolated-code-only diagnostic shape is
   used by the round-2 `evidenceMissing._unknown` fallback (B4), which is additionally explained in
   the reader's language before the code is appended.

6. Reconciliation with the M3-4 catalog.
   - The 31 M3-4 reason entries moved from `errors.<CODE>` to a dedicated `reasons.<CODE>` block; the
     gate in (4) covers them. `errors.*` keeps only API error codes. The M3-4 correction f1426c2
     (card t_71586a9d) is merged in and carried over: `PERSISTENCE_INELIGIBLE` states an eligibility
     gate ("Persistence is not eligible for ranking for this zone."), and the three sourced M2
     prerequisite causes (`NO_COMPATIBLE_BASELINE`, `EXCESSIVE_GAPS`, `AGRICULTURAL_MASK_BLOCKED`) are
     rendered from `params.m2_reason_code` by `useReasonText`. An absent or unrecognised cause adds no
     sentence, and no "not persistent" claim is ever rendered (the UNRANKED group heading for that
     reason carried the pre-F1 wording until it was corrected on this branch — see the rebase note
     under "Carried conditions" below, and item 7 for the gate that now enforces it). Other entries
     were reworded only to
     take the typed `params` of DR-M3-01 §6 as placeholders; the F1 regression is ported to the new
     zone rows (both locales, both viewports).
   - Of the 12 `workspace.scoring*` keys, two remain in use (`scoringHeading`, `scoringNotScored`:
     the not-scored branch, `result-scoring-panel.tsx:32-33`). Nine belonged to the M3-4 flat panel and
     are replaced by `zones.*` / `evidenceQuality.*`; they were removed rather than left orphaned, so the
     two slices cannot drift. An earlier revision of this bullet named a third key
     (`scoringUncalibratedDisclosure`) as in use; no `src/` file referenced it, so it was removed under
     the same rule (F1b card t_ebeaaf99 — the Council condition 6 PARTIAL raised by the independent
     review of head 8c72030 §C is closed).
   - A scored result no longer renders the M3-4 flat list; `ResultScoringSection` keeps only the
     not-scored branch (`if (!view)`, i.e. the committed result carries no M3 envelope) and delegates
     the scored case to `ZonePriorityPanel`. There is no separate envelope-incomplete branch: a body
     carrying only one of `scoring`/`assessment` is refused at the wire (`client.ts`), so it never
     reaches this component as a view (corrected in round 2, card t_38e1dae0).

7. Fail-closed gate for the unsupported-outcome class, second key family (F1b, card t_ebeaaf99).
   `zones.unrankedGroup.*` is a SECOND rendered family of the same 31 `M3ReasonCode` members; the F1
   correction (f1426c2) covered only `reasons.*`, and at head 8c72030
   `zones.unrankedGroup.PERSISTENCE_INELIGIBLE` read "Stress not persistent" / "الإجهاد غير مستمر" and
   was rendered — via `unrankedGroupHeading`, `"{reason} ({count})"` — as the heading of every UNRANKED
   group for that reason. That entry was corrected on this branch to
   "Persistence not eligible for ranking" / "الاستمرارية غير مؤهلة للترتيب" (card t_23a38dc3, in-flight
   while the M3-5 branch was re-based onto `dev`; see "Carried conditions" below). That wording is the
   one kept here: it asserts no persistence outcome, it names the same eligibility gate as the
   row-level sentence in the top-level `reasons.PERSISTENCE_INELIGIBLE` entry ("Persistence is not
   eligible for ranking for this zone." — the reason family is `reasons.*`; there is no
   `zones.reasons.*` family, an earlier revision of this bullet named one), and it names the axis, so
   the heading is unambiguous about what is ineligible.
   - Gate (`scripts/check-messages.mjs`, inside `npm test`), fail-closed on four rules:
     (a) denylisted unsupported-claim tokens (`not persistent`, `غير مستمر`, case-insensitive
     substring) are rejected in every entry of BOTH rendered reason families — `reasons.*` and
     `zones.unrankedGroup.*` — so a reword that re-makes the class in either family fails the build;
     (b) every `GROUP_KEYS` member, read out of `src/components/zone-priority-panel.tsx`, must have a
     non-empty `zones.unrankedGroup.<KEY>` entry in both locales (a missing one silently falls through
     to the `_other` heading); (c) every `GROUP_KEYS` member must be a member of the pinned
     `M3ReasonCode` enum (a group key the backend cannot emit is dead copy); (d) `zones.unrankedGroup`
     must hold no non-`_other` key outside `GROUP_KEYS`, and must hold `_other` — an unreachable
     duplicate family entry is exactly how the defect survived a family-wide parity check.
     Machine-checked: the wording class above, group-key coverage in both locales, the enum binding and
     the absence of unreachable family entries. Remaining review obligation (not mechanically
     checkable): whether a string whose wording is not on the denylist still overstates what the pinned
     backend establishes — that needs the backend file:line judgement recorded in item 8.
   - Regression: the bilingual F1 regression in `tests/e2e/m3-panels.spec.ts` now asserts, for every
     prerequisite-unavailable cause it covers (en and ar, both viewport projects), the exact group
     heading text ("Persistence not eligible for ranking (1)" / "الاستمرارية غير مؤهلة للترتيب (1)"),
     that no denylisted token appears in that heading, and that exactly one `unranked-group` block
     exists on the page. The row-level F1 regression is kept unchanged.

8. Catalog sweep re-verified at the F1b head.
   Method: read every key family the slice introduced or reworked in both catalogs, check each against
   the pinned backend, and re-read the deciding backend lines at the pin itself
   (`git show 6ba3f13d:<path>`) — i.e. re-run the independent reviewer's sweep
   (`evidence/reviews/REVIEW-WEB-PR11-M3-5-8c72030-glm53.md` §B, sha256
   `c5256976390dc443797a9b99279add2af68ea1a29f9043bd7cf04563ee611023`) at the corrected head instead of
   trusting its table.
   Families checked (both locales): all 31 `reasons.<CODE>`; `reasons._unknown` and the three
   `reasons.PERSISTENCE_CAUSE_*`; `zones.unrankedGroup.*`; `zones.evidenceStatus/sufficiency/rank*/
   family*/factor*`; `evidenceQuality.*`; `confounders.*`; `workspace.*` (incl. the `scoring*` keys);
   `history.*`; `decisionCard.*`; `print.*`; `settingsM3.*`; `zones.legend*/map*`.

   | family | deciding backend evidence @ 6ba3f13d | changed by F1b | ruling |
   |---|---|---|---|
   | `zones.unrankedGroup.PERSISTENCE_INELIGIBLE` | `analysis/m2.py:73-104` (eligibility-gate docstring; `NO_COMPATIBLE_BASELINE` :85, `EXCESSIVE_GAPS` :92), `:383-391` (`AGRICULTURAL_MASK_BLOCKED`); mapped by `analysis/scorecard.py:598-613` (`_persistence_reason`) | YES (label; gate + sweep on this card) | corrected — the reviewer's single BLOCKING entry |
   | `reasons.PERSISTENCE_INELIGIBLE` + `PERSISTENCE_CAUSE_*` | same lines; the cause sentences are the M2 `explanation_en/ar` at `m2.py:85-104`, `:391-393` | no | OK (already corrected by f1426c2) |
   | remaining `zones.unrankedGroup.*` (11 entries incl. `_other`) | `scorecard.py:672-711` (UNRANKED short-circuit gates), `:820-828` (mask not accepted), `:830-840` (`covered_area_m2 is None or <= 0`), `:853`, `:891-897` | no | OK |
   | `reasons.NOT_AGRICULTURAL` / `unrankedGroup.NOT_AGRICULTURAL` | `scorecard.py:830-840`: the stage-3 test fires on `covered_area_m2 is None or <= 0`, with `params.covered_area_m2` sourced at `:832-840` | no | OK — re-checked independently; the reviewer's clearance holds (the gate fires on the measured absence/zero of accepted agricultural area, so "No accepted agricultural area" states that measured fact) |
   | `reasons.NO_PERSISTENT_ANOMALY`, `PERSISTENT_ANOMALY`, `RECURRENT_ANOMALY`, `ANOMALY_STRENGTH` | `scorecard.py:687-711` (`_ranked_reasons`: RANKED zones only, from measured windows/recurrence/strength) | no | OK |
   | `zones.evidenceStatus.*`, `zones.sufficiency.*` | `models/status.py:28-35`; `models/m3.py:185-189`; `scorecard.py:797` | no | OK |
   | `evidenceQuality.*` | `models/m3.py:148-150`, `:177-182` (the class is never a priority class) | no | OK |
   | `confounders.*` | `models/m3.py:240-249` (alternative explanation, never a diagnosis) | no | OK |
   | `workspace.scoring*` | `result-scoring-panel.tsx:29-35` not-scored branch; DR-M3-01 §4 | YES — the orphaned `scoringUncalibratedDisclosure` removed (both locales) | corrected; condition 6 PARTIAL closed |
   | `history.*`, `decisionCard.*`, `print.*`, `settingsM3.*`, `zones.legend*/map*` | `models/m3.py:607-617` (v1 is always `NOT_ESTABLISHED`), `workspace-map.tsx:21`, GET /analyses counts | no | OK |

   Result at the F1b head: the one blocking entry the reviewer found (report §B row 1) is corrected,
   and no other rendered string in either catalog asserts an outcome the pin does not establish. The
   reviewer's non-blocking observations are NOT absorbed into this diff (a separate follow-up card
   carries them).

9. Round-2 corrections at the F2 head (card `t_38e1dae0`; Council BLOCK 2–0 at `e7ee471`).
   - **B1 — rankability is a precondition of the ranked axis (recorded rule).** DR-M3-01 §3
     (*Rankable ⇔ stages 0–3 pass and persistence is ELIGIBLE and per-zone
     `evidence_status = SUFFICIENT`*; "`LIMITED` is not rankable, and that is enforced by test") and
     the pinned scorecard (`analysis/scorecard.py`: `LIMITED` ⇔ UNRANKED, `SUFFICIENT` only on the
     ranked path) mean a body that RANKS a zone whose per-zone evidence status is not `SUFFICIENT` is
     semantically invalid. The web **fails closed on the wire**: `isRankableZone` is applied inside
     `isZoneAssessment` (`src/lib/api/m3.ts`), which `client.ts` runs before any result is accepted, so
     the whole body is refused (`UNKNOWN_RESPONSE` → the contract-mismatch notice) rather than
     partially read. `buildScoredResultView` repeats the guard (`isRankedAssessment`), so no surface
     can rank such a zone even if a body bypassed the validator; an unknown/absent `priority.status`
     is never RANKED, and an absent or non-positive `rank`/`rank_group` is never invented into a ramp
     step. The web never recomputes or re-derives a ranking. Fixtures:
     `M3_LIMITED_UNRANKED_ID` (LIMITED + UNRANKED — its payload deliberately still carries
     `class: LOW` / `c: '0.3000'`, so the suppression is observable rather than a by-product of an
     empty block) and `M3_CONTRADICTORY_LIMITED_RANKED_ID` (LIMITED + RANKED — refused). Z-3 in the
     main scored fixture is now the valid ranked-LOW case (`SUFFICIENT` + RANKED + LOW), which keeps
     its LOW badge.
   - **B2 — the priority-class notice is bound to the body** (item 3): the unrecognised and absent
     branches no longer assert "not established", and the card's priority-class limitation follows the
     same three-way branch.
   - **B3 — card/print projection (DR-M3-01 §8).** At this head the card printed the committed
     pipeline, M2 pipeline and M2 config versions; the AOI identity (outer-ring vertex count,
     committed bounds, and an area hash re-derived in the browser **labelled as re-derived** and
     explicitly not the backend's value — the contract's `AnalysisResult.request` carries the polygon
     only) with a small inline-SVG inset drawn from the committed AOI/zone geometry (no tiles, no
     provider, real text/SVG, so the export keeps it); sources with localized role/status plus product
     version/revision and a single merged, unlabeled date list; observation-ROW counts by epistemic
     class and the number of recorded coverage gaps; per ranked zone the rank-key components, the
     independent families (counted / not counted / collapsed / adverse signal) and the confounder
     disclosures (the same `ConfounderChip` disclosure-only treatment as the panel); UNRANKED zones
     counted, grouped by reason and listed; and the standing limitations (uncalibrated class,
     estimate, no 0–100 priority score, provisional AOI, not validated against in-basin field
     measurements, context-only sources, masked pixels excluded). No new route, service or export
     collection: the inset is built by `src/lib/aoi-inset.ts` from geometry the committed result
     already carries.
     **This bullet overstated §8 completion at `70e0abf`**: the committed valid-observation counts,
     the coverage values and the scoped gap records were NOT projected (only row counts and the gap
     count were), and the represented/acquisition dates were merged into one unlabeled list. Both
     were corrected on card `t_b8506b9d` — see item 10 below, which is the corrected §8 statement for
     those parts.
   - **B4 — dynamic values are localized through the catalogs.** `missing_reason` renders through the
     new `evidenceMissing.*` family (`NOT_CONFIGURED`, `NO_DECODE_PROOF`, `NO_VALID_PIXELS`,
     `NO_DECODABLE_STATISTIC`, `NO_INTERSECTING_BASIN`, plus the `READ_FAILED` / `READ_FAILED:<cause>`
     composite) with `_unknown` as the fail-closed fallback; `decisionCard.sourceRole.*` and
     `decisionCard.sourceStatus.*` localize the pinned `SourceEvidence` vocabularies
     (`TEMPORAL`/`STATIC`/`MASK`; `NOT_RUN`/`READ`/`EMPTY`/`BLOCKED`/`FAILED`) with `_unknown`
     fallbacks. In every case a machine code may appear only as an **additional isolated diagnostic**
     (`<bdi dir="ltr">`) after a localized explanation, never as the sole content; provider and
     product identifiers are unchanged.
   - Regression coverage: the LIMITED case is asserted neutral in the panel, on the map and in the
     card (en + ar, both viewport projects); the ranked-LOW case keeps its LOW evidence-quality class;
     the contradictory body is refused with no M3 surface rendered; both priority-status branches
     assert the absence of the fixed claim; the card projection is asserted against independently
     computed values (hash re-derived with Node's crypto, counts and dates recomputed); and the
     evidence table asserts the localized explanation. The two e2e assertions that positively expected
     the forbidden presentation (the LOW badge on a LIMITED zone; the bare `missing_reason` code) are
     replaced, not merely weakened.

10. Round-3 corrections at the corrected head (card `t_b8506b9d`; stage-⑥ Council BLOCK 2–0 at
    `70e0abf`, both co-equal seats). This item is the corrected statement for the two §8 parts that
    item 9's B3 bullet overstated, and records the third blocking item.
    - **F-01 — committed valid counts, coverage and scoped gaps are now projected (both seats).** At
      `70e0abf` the card tallied only observation ROWS by epistemic class (`decision-card.tsx:44-54`)
      and printed those totals plus `String(m2?.coverage?.length ?? 0)` (`:178-182`); it read neither
      `statistics.valid_observation_count`, nor `effective_coverage.*`, nor any `CoverageGap` field.
      The corrected card's "Observations, coverage and gaps" section projects, from the one committed
      result: the observation-ROW totals as an explicitly labelled row count; the committed
      whole-area `statistics.valid_observation_count` and `statistics.valid_area_m2`; the committed
      `effective_coverage.valid_coverage_fraction`, `.acquisition_date` and
      `.min_valid_coverage_fraction_guard`; a scope note stating these are whole-area values, not
      per-zone ones; the per-observation `valid_count` and `valid_area_fraction` under their own
      zone/window/indicator scope; and every recorded `m2.coverage[]` gap with its source, window, a
      localized explanation of its `reason_code` (through `evidenceMissing.*`, which covers the open
      `READ_FAILED:<cause>` composite) and its `observed_count` / `expected_count` /
      `coverage_fraction`. **Optional M2 member arrays preserve absent-vs-empty semantics:** an
      omitted `m2.observations` or `m2.coverage` member is "Not returned" independently on the card
      and print surface (absence is not evidence and is never tallied as zero), while an explicitly
      empty array is the truthful committed "no rows" / "no gaps" statement and remains `0/0/0` or
      `Coverage gaps recorded: 0`. The absent whole `m2` block keeps its own no-block wording.
      Absent/null stays absent: an absent optional `m2` block now reads "Not
      returned" for the row totals and the gap line (and "not returned" for the per-observation list)
      instead of tallying 0/0/0, and a null `expected_count` / `coverage_fraction` reads "not
      returned" rather than zero. The row totals are now visibly distinct from the committed valid
      count they were previously mistaken for.
      Regressions (`tests/e2e/m3-panels.spec.ts`, en + ar, both viewport projects): "card and print
      project committed valid counts, coverage and scoped gap records" — a served double with a
      non-empty gap list and materially different valid counts/coverage, asserted in the card and
      again under `emulateMedia({media: 'print'})`; and "an absent M2 block is reported as not
      returned, never as a zero count".
    - **F-02 — the fixed priority-class reason is bound to the body (seat 2).** `useReasonText` now
      takes the body's `scoring.priority_class_status`; when a reason carries
      `PRIORITY_CLASS_NOT_ESTABLISHED` while that status is not `NOT_ESTABLISHED`, the formatter
      renders a status-bound sentence (`reasons.PRIORITY_CLASS_STATUS_UNRECOGNISED`, quoting the
      reported value, or `reasons.PRIORITY_CLASS_STATUS_ABSENT` for an absent status) instead of the
      fixed conclusion. Every surface that renders priority reasons threads the status in (panel row,
      panel technical view, card/print), so the fixed "priority class is not established" text can no
      longer be produced from a reason under any other status. The round-2 banner/limitation
      three-way branch is unchanged.
      Regressions: the status tests now assert the fixed conclusion's absence from the ROW and the
      CARD reason text (`[data-reason-code="PRIORITY_CLASS_NOT_ESTABLISHED"]`) as well as from the
      banner and the card limitation, for both the `ESTABLISHED_FUTURE` rewrite and the absent
      status.
    - **F-03 — represented and acquisition dates are projected separately (seat 2).** `sourceDateText`
      merged `represented_date` + `acquisition_date` into one deduplicated, unlabeled list, so two
      distinct dates could not be told apart and a single date could not be attributed to a role. The
      card now renders each role under its own label (`decisionCard.sourceRepresentedDate` /
      `decisionCard.sourceAcquisitionDate`), stating "Not returned" for a role the source does not
      carry, so absence is explicit rather than folded away; a source carrying no version, revision or
      dates at all keeps the single explicit `sourceDetailsUnavailable` sentence. The now-unused
      `decisionCard.sourceDates` key was removed from both catalogs.
      Regression: "card labels represented and acquisition dates separately" — the served double
      carries distinct dates; asserts both role labels and both dates, and that neither role carries
      the other's date (the shipped main fixture carries equal dates and cannot detect the loss).
    - **Nothing already projected was regressed:** versions, AOI identity + inline inset, source
      manifest with localized role/status, rank-key / families / confounders, the UNRANKED listing,
      the limitations, the B1 fail-closed rankability guard, the B2 banner wording and the B4
      localization with its fail-closed fallbacks are unchanged, and the contract pin and generated
      types are untouched.

## Other decisions

- Result identity: `result_sha256` is verified in the browser (Web Crypto) against canonical JSON of
  `{analysis_id, execution_status, scoring, assessment}` (sorted keys, no whitespace, decimals as
  strings, per DR-M3-01 §8). The e2e cross-checks it against an independent implementation in the
  backend double and against Node's own hash. `card_id = sha256("aq-card-1|" + analysis_id + "|" + result_sha256)`.
  Mismatch or unavailability is shown, never hidden.
- One in-memory result per (analysis_id, result_sha256); form edits never alter displayed values; a
  late response for another id is discarded (e2e: slow analysis navigated away from).
- Workspace state (`zone`, `panel`, `history`) lives in the query string of the same route and is
  preserved by the language switch with no POST.
- Digits: Latin digits and Gregorian calendar in both locales (A38); ranks are passed to ICU as literal
  strings.
- No new chart dependency: the time-series view reuses the M2 components and tables.
- The history e2e states (empty/error/unauthorized) are stubbed per page, not via a shared double
  mode, because the suite runs fully parallel against one double.

## Carried conditions from the M3-4 landing gate — ownership split

The M3-4 landing gate (card `t_b83e34d2`, seat `claude-fable-5-1`) recorded five further M3-5
conditions after PR #10 merged (dev `0b48dae`). They are owned as follows so the same edit is never
made twice:

- **Condition 1 — regression for the `AGRICULTURAL_MASK_BLOCKED` prerequisite cause: done on this
  branch.** At the pinned backend `6ba3f13d` the only wired persistence path (`build_m2_additions`,
  `src/aqualedger/analysis/m2.py:382-391` -> `scorecard.py::_persistence_reason`) publishes
  `AGRICULTURAL_MASK_BLOCKED`; `EXCESSIVE_GAPS` is dormant there because `assess_persistence` has no
  production call site. The bilingual F1 regression in `tests/e2e/m3-panels.spec.ts` now covers all
  three causes the client can render (`NO_COMPATIBLE_BASELINE`, `EXCESSIVE_GAPS`,
  `AGRICULTURAL_MASK_BLOCKED`) in `en` and `ar` and in both viewport projects, from new labelled
  test-double ids (`M3_PERSISTENCE_INELIGIBLE_AGRI_MASK_ID`).
- **Condition 5 — uncalibrated disclosure and "priority class not established" on every scored
  render: asserted on this branch.** The same regression asserts the ordering-only banner
  (`aq-scorecard-1`, "Priority class not established") and the decision-support guardrail on each of
  the three scored prerequisite doubles, so the UNRANKED path cannot silently lose either line.
- **Conditions 2, 3, 4 and the call-site re-check note: owned by card `t_efaf064d`** (M3-4 web
  follow-ups) and deliberately **not duplicated here**: `docs/M3-CONTRACT-REPIN.md` 124 -> 132, the
  `ranked` gate on the evidence-quality badge in `result-scoring-panel.tsx`, the unused
  `scorePresentation` export in `src/lib/api/m3.ts`, the two Arabic gender-agreement slips
  (`AGRI_MASK_BLOCKED`, `PERSISTENCE_NOT_ASSESSED`) and the recorded next-re-pin re-check of the
  persistence call site.
- **Found while preparing the rebase, fixed on this branch: the slice's own UNRANKED group heading
  still carried the pre-F1 claim.** `zones.unrankedGroup.PERSISTENCE_INELIGIBLE` read
  "Stress not persistent" (`ar` "الإجهاد غير مستمر") and is rendered — via `unrankedGroupHeading`,
  `"{reason} ({count})"` — as the heading of every UNRANKED group for that reason, so the scored
  surface asserted a non-persistence result for zones whose persistence is *unassessed*. That
  contradicts the F1 correction and item 6 above. The heading now states the eligibility gate
  ("Persistence not eligible for ranking" / "الاستمرارية غير مؤهلة للترتيب"), and the bilingual F1
  regression asserts the group heading and asserts that no non-persistence claim appears anywhere in
  the result panel, so the group surface cannot regress silently.

Base for this slice: web `dev` at merge commit `cbb74fa9ce93ee2fdbd5a6667201b395dceec795` (live base
and merge-base for PR #11). The earlier M3-4 merge commit `0b48dae` (tree equal to the reviewed
head `f1426c2`) is a historical/superseded reference only; the M3-4 branch is not a landing
dependency.
