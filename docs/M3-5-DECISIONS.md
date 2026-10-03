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
     sentence, and no "not persistent" claim is ever rendered. Other entries were reworded only to
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
