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

3. `priority_class_status` is bound to the body.
   The "priority class not established under method X" sentence renders only when
   `scoring.priority_class_status === 'NOT_ESTABLISHED'`. Any other or absent value renders a distinct
   notice (`zones.priorityClassUnrecognised`) that shows the reported status verbatim, states that no
   class is shown, and still never converts the evidence-quality class into a priority. Covered by an
   e2e that rewrites the status in the relay response.

4. Repository gate for the closed reason vocabulary.
   `scripts/check-messages.mjs` (part of `npm run messages:check` / `npm test`) reads
   `contracts/openapi.json` `M3ReasonCode.enum` and fails if any member lacks a non-empty
   `reasons.<CODE>` entry in `en` or `ar`. All 31 members currently pass.

5. Diagnostic on the unknown-code fallback.
   `reasons._unknown` carries the unrecognized code and the analysis id as the reference
   (`useReasonText(analysisId)`), so a code the backend adds before a re-pin is traceable to one saved
   analysis. The e2e checks the code and the analysis id are both visible on the zone surface.
   Confounder codes use the same pattern with their own `confounders.unknown` string.

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
   - A scored result no longer renders the M3-4 flat list; `ResultScoringPanel` keeps only the
     not-scored and envelope-incomplete branches and delegates the scored case to `ZonePriorityPanel`.

7. Fail-closed gate for the unsupported-outcome class, second key family (F1b, card t_ebeaaf99).
   `zones.unrankedGroup.*` is a SECOND rendered family of the same 31 `M3ReasonCode` members; the F1
   correction (f1426c2) covered only `reasons.*`, and at head 8c72030
   `zones.unrankedGroup.PERSISTENCE_INELIGIBLE` read "Stress not persistent" / "الإجهاد غير مستمر" and
   was rendered — via `unrankedGroupHeading`, `"{reason} ({count})"` — as the heading of every UNRANKED
   group for that reason. That entry was corrected on this branch to
   "Persistence not eligible for ranking" / "الاستمرارية غير مؤهلة للترتيب" (card t_23a38dc3, in-flight
   while the M3-5 branch was re-based onto `dev`; see "Carried conditions" below). That wording is the
   one kept here: it asserts no persistence outcome, it is a prefix of `zones.reasons.PERSISTENCE_INELIGIBLE`
   ("Persistence is not eligible for ranking for this zone."), and it names the axis, so the heading is
   unambiguous about what is ineligible.
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
   | remaining `zones.unrankedGroup.*` (10 entries incl. `_other`) | `scorecard.py:672-711` (UNRANKED short-circuit gates), `:820-828` (mask not accepted), `:830-840` (`covered_area_m2 is None or <= 0`), `:853`, `:891-897` | no | OK |
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

Base for this slice: web `dev` at the M3-4 merge commit `0b48dae` (tree equal to the reviewed head
`f1426c2`); the M3-4 branch is not a landing dependency.
