# M3 contract re-pin (contract 0.2.0)

This note extends `docs/CONTRACT-RECONCILIATION.md` for the M3-4 slice (central issue #17):
the client re-pin to the merged M3 backend contract, its additive consumption, and what was
deliberately left for M3-5.

## What is pinned now

| artifact | backend reference | git blob (sha1) | sha256 | bytes | contract |
| --- | --- | --- | --- | --- | --- |
| pinned `contracts/openapi.json` (this PR) | `6ba3f13d6106e295c2cbf00a412624f7b8192de3` | `33facdafee12d3e235c76f801d4f19f9cfac0eae` | `76876a5d46a83817a455d5c1b61d3e23d9e1410b0d94c3aac462b59575fa6d27` | 79 688 | `0.2.0` |
| previously pinned (`198987c…`, contract `0.1.0`) | `198987c1cbe8f6472972b90d09d86ad3822143e3` | `bcd2a43be9599c6f999a9ea78887cd0cec3e9222` | `ee75088327647ef82da33b10db0ebbcc26ea1dd59f93ad0fc9a5247d84255476` | 38 010 | `0.1.0` |

The pinned backend reference is backend `dev` at `6ba3f13d…` — the PR #13 merge `7ddb7ca…`
(the ratified M3-3 landing, card `t_ba60a312`) plus the docs-only N1 wording PR #14, which
touches only `docs/evidence/m3-3-real-run-2026-10-02/verdict.md`. The artifact is byte-identical
to the ratified M3-3 acceptance state (its openapi.json sha256 is the ratified
`76876a5d46a83817a455d5c1b61d3e23d9e1410b0d94c3aac462b59575fa6d27`). All four recorded hashes
were reproduced locally against the backend repository at that commit, not copied from a table.

Types were regenerated with the pinned generator (`openapi-typescript@7.6.1`); the diff over
the old `src/lib/api/generated.ts` is purely additive. No generated file was hand-edited.

## Compatibility check

A read-only structural comparison of the two artifacts found the merged artifact **additive**
over the previously pinned one, per DR-M3-01 §4 and the 0.2.0 minor bump:

- identical `openapi` (`3.1.0`); `info.version` moves `0.1.0` → `0.2.0` (the single additive
  M3 contract change, DR-M3-01 §4);
- identical operations: the four frozen M1 routes, plus the new `GET /analyses` history route
  (schema-declared here, consumed by the UI in M3-5);
- no removed schema, no removed property, no changed `required` list on any pre-existing schema;
- `AnalysisResult` gains optional nullable `m2` (the M2 additions, merged in PR #7 but never
  pinned until now), optional nullable `scoring` / `assessment` / `result_identity` (the M3
  envelope), plus the additive M1/M2-era fields the earlier re-pin already consumed
  (`baseline`, typed `ArtifactReference`, nullable NDVI percentiles, per-date scene fields).

Every field the client consumed before this re-pin exists with an unchanged definition in the
merged artifact. The runtime validator in `src/lib/api/client.ts` now validates the new blocks
(`src/lib/api/m2.ts`, `src/lib/api/m3.ts`) when present and keeps accepting results without
them: a pre-M3 result carries no `scoring`/`assessment`, which means **"not scored under this
method" — never UNRANKED, never a zero** (DR-M3-01 §4 all-or-nothing envelope; a body with
only one of the two, or a malformed member, is rejected as contract-invalid).

## What the UI consumes (and what it does not)

Consumed in this slice, inside the existing result panel, bilingual (en/ar, catalog parity
checked):

- `scoring` (`method_version`, `priority_class_status` rendered as "not established under
  method aq-scorecard-1" — the v1 ruling), per-zone `assessment` grouped RANKED / UNRANKED,
  and `result_identity` (validated, not displayed; presentation of the hash is M3-5 card scope);
- RANKED zones show `rank`/`rank_group` and the evidence-quality class **with its
  uncalibrated disclosure** — the class is never presented as a priority class, and the
  card's guardrail line "decision support for field verification — not enforcement, not a
  confirmed diagnosis" ships on the scored render;
- UNRANKED zones render neutrally (status + typed reason codes, no rank, no class, no priority
  ramp): the two priority axes are never collapsed;
- all 31 codes of the closed M3 `M3ReasonCode` vocabulary have en+ar catalog entries, with a
  safe generic fallback (`unknownBackendReason`) for a code this build does not recognize —
  the web never parses backend prose and never invents a translation.

Deliberately NOT in this slice (M3-5, per the consolidated plan §9 sequencing and the parent
t_9917cc52 Council ruling): the `GET /analyses` history drawer, the zone priority/evidence
panel with map styling and factor rows, time-series reuse, the decision card + print export,
and `result_sha256` display. The twelve factor rows, confounders and evidence-quality details
are validated but not yet displayed.

## Guard moved with the re-pin

`scripts/check-contract.mjs` (the "guard assertion moved together with the re-pin" item from
the parent's carried ruling, plus an m2 assertion): asserts the new backend commit and
contract version, the four frozen M1 routes, the M1 top-level shape (zones/time_series/priority
still absent from `AnalysisResult`), that every M3 envelope field stays optional and nullable,
that `M2ResultAdditions` carries its required identity fields, that the closed M3
vocabularies are present (`M3ReasonCode`, `PriorityStatus`, `EvidenceQualityClass`), that
`ResultIdentity.result_sha256` exists, and that the generated types match the artifact
(`openapi-typescript --check`). A negative test was run in this workspace: reverting the
artifact to the previous pin fails the guard on the blob hash; restoring it passes.

## Verification boundary

Static gates (lint, strict typecheck, build, catalog parity, contract identity + generated
types drift, no-token-leak, relay-log-leak, preview-decode) were run locally at the re-pin head
(commit `2e2c80f` on `aqualedger/t_911976a5-m3-4-contract-repin`), together with the full
browser suite. That head carried **124** configured e2e instances (the 120 pre-existing plus the
new M3 scored / not-scored cases in both locales and both viewports). The later F1 correction
(`f1426c2`) added the 8 bilingual prerequisite-failure instances, so the counts at the merged
head (`f1426c2`, merged to `dev` as `0b48dae`) are **132 configured + 6 unconfigured** tests
passing — corrected here from the earlier "124", which was true only at the pre-correction head
(the `f1426c2` commit message already carried 132). Browser tests exercise the relay and rendering
against the labelled test double (`tests/fixtures/backend-double.ts`), which now carries an
M3-scored and an M3-not-scored result fixture; they are labelled test content, not production
claims. No hosted backend run, no hosted paired web/backend acceptance, and no live
`aq-scorecard-1` result were available to this web-only slice: those belong to M3-6 paired
verification on merged paired dev SHAs, which this PR does not attempt to establish. The
unconfigured-mode e2e gate still proves the app fails closed without server config.

## Backend re-pin re-check — persistence-cause coverage

Fact recorded at the pinned backend `6ba3f13d…`, to be re-established at the **next backend
re-pin**: the only wired persistence path is `build_m2_additions`
(`src/aqualedger/analysis/m2.py:382-391`), which publishes `AGRICULTURAL_MASK_BLOCKED` and
`NO_COMPATIBLE_BASELINE`; `EXCESSIVE_GAPS` (`m2.py:92`) is dormant there because
`assess_persistence` has no production call site. If such a call site appears, or the wired path
changes, the bilingual prerequisite-failure regression (`tests/e2e/workspace.spec.ts`) must gain
the matching case. That regression currently covers `NO_COMPATIBLE_BASELINE` + `EXCESSIVE_GAPS`;
`AGRICULTURAL_MASK_BLOCKED` — the cause the wired path actually publishes — has a catalog entry
and code path but no browser regression yet (carried as M3-5 condition 1, card `t_5225bb3c`).
