# AquaLedger Web

Private Next.js/TypeScript application repository for `AmeenBinBisher`. Product name: **AquaLedger**, without a geographic suffix.

## Authority and state

Central product decisions/status: [aqualedger](https://github.com/AmeenBinBisher/aqualedger). Backend API/analysis/worker/migrations: [aqualedger-backend](https://github.com/AmeenBinBisher/aqualedger-backend).

This branch contains implementation instructions, not application code. The corrected central baseline is under [central PR #1](https://github.com/AmeenBinBisher/aqualedger/pull/1); review and merge it before dependent feature implementation. Do not read the older central dev documents as authority to create a monorepo or defer Arabic. After review/merge, record the actual central baseline SHA in the first implementation report.

Read [AGENTS.md](AGENTS.md) and [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md), then central documents 00–10. Central [STATUS.md](https://github.com/AmeenBinBisher/aqualedger/blob/dev/STATUS.md) is the only product-level milestone status. Use local issues/PRs for web tasks, not a competing product log.

## Fixed scope

Exactly two primary screens, each in English/LTR and Arabic/RTL from first delivery:

- Analysis Workspace: map/AOI/dates/run/status, saved result and provenance; later evidence/charts/history drawer/decision-card export/isolated hypothetical scenario panels.
- Settings / Data Sources: truthful sanitized backend-configured source status, not arbitrary-source or credential management.

`/{locale}/analysis/{id}` is the same workspace as `/{locale}/analysis`, not a new result page. Settings uses `/{locale}/settings`. Auth callbacks, not-found and errors are technical routes, not extra business pages. No native mobile or marketing/admin/report/profile expansion.

## First implementation outcome

Consume a pinned backend-generated OpenAPI contract. Submit AOI/dates to FastAPI; display the real persistent job stages, saved NDVI map/measurement/provenance and source status. Two suitable AOI/date runs must succeed without changing code. Reopen/switch language without another job or changed scientific inputs. No fabricated priorities or demo results in the live workflow.

## Workflow and setup

Issue -> feature branch from dev -> PR to dev -> independent latest-fix review -> final Council scope review -> merge commit -> web and paired backend verification -> central status update. main is release-only after owner approval. This README seed is the one-time initialization exception, not permission for direct feature pushes.

No package versions, setup commands, environment values or passing tests are invented here. The first implementation adds tested install/dev/build/test commands, runtime/package pins, lockfiles, secret-free environment example and actual CI. Documentation presence does not mean the web app is running.
