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
     under "Carried conditions" below). Other entries were reworded only to
     take the typed `params` of DR-M3-01 §6 as placeholders; the F1 regression is ported to the new
     zone rows (both locales, both viewports).
   - Of the 12 `workspace.scoring*` keys, three remain in use (`scoringHeading`, `scoringNotScored`,
     `scoringUncalibratedDisclosure`: the not-scored branch). Nine belonged to the M3-4 flat panel and
     are replaced by `zones.*` / `evidenceQuality.*`; they were removed rather than left orphaned, so the
     two slices cannot drift.
   - A scored result no longer renders the M3-4 flat list; `ResultScoringPanel` keeps only the
     not-scored and envelope-incomplete branches and delegates the scored case to `ZonePriorityPanel`.

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
