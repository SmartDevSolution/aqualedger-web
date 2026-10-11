# AquaLedger Yemen — Interactive Earth Observation Proof of Concept

**Track:** Precision Agriculture & Crop Intelligence · **Team:** AquaLedger Yemen · **Country:** Yemen

**[Open the live, interactive web demonstration](https://aqualedger-web.vercel.app/en/analysis)** · [Arabic interface](https://aqualedger-web.vercel.app/ar/analysis) · **[Inspect a completed real analysis](https://aqualedger-web.vercel.app/en/analysis/d38fb448-20d1-481d-91be-dd90ee8575f2)**

AquaLedger is an Earth-observation decision-support prototype. A user draws an area of interest (AOI), chooses dates, starts a real analysis, and inspects satellite-derived evidence, vegetation indicators, georeferenced map previews, and saved results in English or Arabic. The PoC is a **working application**, not a static concept mockup or a simulated result page.

> **Scientific boundary:** Satellite-derived indicators are estimates and decision-support evidence, not ground-truth crop diagnoses, validated yield predictions, or guarantees of field conditions. Evidence eligibility, missing data, and unsupported interpretations must remain visible. A stored `SUCCEEDED` execution status is not a claim of field validation.

## For hackathon evaluators

| Item | Location |
| --- | --- |
| **Live PoC / start a new analysis** | [aqualedger-web.vercel.app/en/analysis](https://aqualedger-web.vercel.app/en/analysis) |
| **Arabic PoC** | [aqualedger-web.vercel.app/ar/analysis](https://aqualedger-web.vercel.app/ar/analysis) |
| **A real, previously completed example** | [Tuban analysis (English)](https://aqualedger-web.vercel.app/en/analysis/d38fb448-20d1-481d-91be-dd90ee8575f2) · [Arabic](https://aqualedger-web.vercel.app/ar/analysis/d38fb448-20d1-481d-91be-dd90ee8575f2) |
| **Example input and recorded output** | [submission/example-input-output.json](submission/example-input-output.json) |
| **Web dependency manifest** | [package.json](package.json) + [package-lock.json](package-lock.json) |
| **Pinned Python dependency reference** | [requirements.txt](requirements.txt) (corresponds to the separate backend repository) |
| **Backend/scientific source** | [SmartDevSolution/aqualedger-backend](https://github.com/SmartDevSolution/aqualedger-backend) — **separate repository; evaluator access must be granted if private** |
| **Project documentation** | [SmartDevSolution/aqualedger](https://github.com/SmartDevSolution/aqualedger) — separate repository; evaluator access required if private |

The presentation PDF is uploaded separately in the hackathon submission form. Any design/mockup imagery in presentation slides is illustrative; **the actual application and the recorded example above are the operational evidence**.

### Quick evaluation walkthrough

1. Open the live application and switch between **English** and **العربية**.
2. In **Analysis Workspace**, use the geographic map to draw a single polygon. Choose a valid start and end date, then submit the analysis.
3. Follow its job status. The API persists the request, a separate background worker processes the job, and the completed result can be reopened without re-submitting it.
4. Inspect the NDVI preview, result statistics, evidence/limitations, and analysis identity. Switch locales and confirm that the analysis ID, geometry, dates, numeric values and result hash remain unchanged.
5. For an immediately inspectable result without waiting for processing, open the **completed Tuban example** linked above.

**Geographic map:** The interactive workspace now uses a real satellite-imagery basemap (Esri World Imagery, with World Boundaries and Places labels). Users can draw polygons over recognizable farmland and geographic features. Basemap imagery is geographic context supplied by a third party; it is **not** the processed Sentinel-2/NDVI analysis result. Map tiles and server-side analysis each depend on their own external-service availability.

## Recorded real example (not synthetic)

The example was executed and stored on **2026-10-11** through the running Next.js → FastAPI → worker → Supabase path.

| Field | Recorded value |
| --- | --- |
| Area | Tuban area of interest, Yemen (user-drawn polygon) |
| Time interval | 2026-04-01 through 2026-04-30 |
| Analysis ID | `d38fb448-20d1-481d-91be-dd90ee8575f2` |
| Execution status | `SUCCEEDED` |
| Scientific evidence status | `NOT_ASSESSED` (not field validated) |
| Valid observations | **27,944** |
| Valid analyzed area | **2,794,400 m²** (2.7944 km²) |
| Mean NDVI | **0.2158459573984146** |
| Analysis result SHA-256 | `689c6f3abbf75fe08550227a69b5ca2af0ff2049219450ad9187cc5f7263bca1` |
| Geospatial baseline | Sentinel-2 L2A, 10 m, EPSG:32638 |

The exact GeoJSON input and recorded result summary are in [submission/example-input-output.json](submission/example-input-output.json). The identifier/hash refer to one stored run; a new run can have a different result hash even when derived statistics agree.

## Architecture and source ownership

```text
Browser (EN / AR)
       |
       v
Next.js on Vercel (same-origin HTTP relay, server-only settings)
       |
       v
Netcup (FastAPI API + separately supervised Python worker)
       |
       v
Supabase (PostgreSQL/PostGIS, PGMQ, private Storage)
       |
       v
Documented Earth-observation sources (e.g. Sentinel-2 L2A)
```

This repository contains the **Next.js frontend**, browser map/drawing logic, localization, typed API consumer, relay routes, and frontend tests. The core scientific algorithms, FastAPI endpoints, independent queue worker and Supabase migrations are owned by **a separate backend repository**. The web code alone **cannot reproduce the scientific computation offline**. Evaluation of those algorithms requires authorized access to that separate repository and suitable data/infrastructure.

The existing live prototype uses an HTTPS connection to the Netcup runtime. The current Quick Tunnel ingress is temporary and may change following server/tunnel restart. Do not interpret its current availability as a permanent uptime guarantee.

## Reproduce the web portion locally

**Requirements:** Node.js `22.22.2` and npm `10.9.7` (see `.nvmrc`, `package.json`, and lockfile).

```bash
npm ci
npm run lint
npm run typecheck
npm run messages:check
npm run contracts:check
npm run build
npm run start
```

Without an authorized FastAPI backend, the web UI loads but cannot execute real scientific analyses. Configure only these **server-side** environment variables when authorized:

```text
AQUALEDGER_API_BASE_URL=<approved HTTPS FastAPI relay endpoint>
AQUALEDGER_OPERATOR_JWT=<approved server-side operator token>
```

Do **not** put credentials or backend service-role keys in `NEXT_PUBLIC_*` variables or commit real `.env` values. The browser calls same-origin `/api/*` endpoints; it does not receive the operator credential. The authenticated relay and private data access are handled by the server side.

To run the existing frontend tests:

```bash
npm run test
```

The frontend Playwright suite uses an explicitly labeled local backend test double; its passing status does **not** substitute for the real cross-host acceptance shown by the saved example. The backend repository separately pins Python versions and dependencies through `pyproject.toml` / its lockfile; `requirements.txt` in this web repository is only a reviewer-facing copy of those **backend** runtime package versions.

## Reproducibility, provenance and limitations

- Inputs are AOI geometry and a date interval; processing uses documented EO-source products, versions and quality/masking rules.
- Source/network availability, cloud cover, coverage, time-series sufficiency and analysis-method eligibility affect what the system may truthfully conclude.
- Analysis history, method/source provenance, result identity and limitations are part of the saved results.
- Results are **decision support for field verification**; they must not be presented as confirmed ground observations or calibrated probabilities.
- Reproducibility means retaining method, acquisition, area, input, output and dependency identity; no unqualified guarantee of identical future external-provider reads is made.

## Basemap source and attribution

The current `public/basemap/style.json` includes **Esri World Imagery** raster tiles and the **Esri World Boundaries and Places** reference overlay from public ArcGIS REST services. MapLibre renders each source's declared attribution; the map-adjacent attribution note is localized in English and Arabic. These external tiles replace the earlier self-hosted placeholder (plain background and coordinate grid), improving AOI drawing over farmland, wadis and irrigated land. Tile service access is keyless but remains governed by the provider's availability and usage terms; no service-level availability guarantee is asserted. If external tiles cannot load, the application can fall back to the map background while keeping polygon-drawing interaction available. The geospatial basemap is **not** the project's own analysis output or a dataset included in the source repository.

## Public-sharing and licensing

This repository should be made public **only after** checking its Git history, tracked files, fixture content, third-party map/imagery attribution and all legal and secret-exposure constraints. Keep runtime tokens, signed Storage URLs, database connection strings and private imagery out of public commits. Public access to this frontend repository is **not the same as access to the separate backend source**; share its authorized evaluator access separately.

**Hackathon PoC status:** functional interactive application with recorded real execution evidence; external verification, independent scientific field validation and official judging are separate from software test success.
