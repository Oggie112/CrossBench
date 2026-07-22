# Work Record: Database Schema, Tooling & First Source Adapter

**Date:** 2026-07-15
**Time:** 18:11 UTC
**Focus:** Stand up CrossBench's Supabase schema and Next.js tooling, then build and verify the first working source adapter (UK Parliament) against a live government API.
**Outcome:** 6 tasks completed (5 schema, `SourceAdapter` interface + UK adapter), Next.js scaffold done, Milestone 1 schema layer fully built.

---

## Summary

First day of work on CrossBench: built the full Supabase schema with data-integrity constraints, scaffolded the Next.js frontend, and implemented the `SourceAdapter` pattern with its first working, network-verified adapter (UK Parliament's interests API). One real bug found and fixed by testing against live data rather than trusting the initial design.

---

## Work Completed

### 1SCH.1–1SCH.5 — Core Database Schema ✅

**Status:** Completed
**Context:** Foundation for all downstream ingestion, ranking, and frontend work.

**What was done:**
Created `officials`, `committees`, `official_committee_memberships`, `committee_sector_relevance`, `securities`, `security_identifiers`, `raw_documents`, `disclosure_events`, and `ingestion_runs` — one migration per table, all pushed to the linked Supabase project. Followed up with a full pass of data-integrity hardening: check constraints on every enum-like column (`disclosure_type`, `instrument_type`, `transaction_type`, `identifier_type`, `ingestion_runs.status`), a `countries` reference table (FK'd rather than check-constrained, so adding a source country later is an insert, not a migration), uniqueness constraints on `security_identifiers` and `securities.isin` to prevent silent duplicate-security bugs, and range checks on amounts and date pairs.

**Key learnings:**
- Enum-like columns documented only as SQL comments in the design doc (`-- 'buy' | 'sell' | 'exchange'`) need explicit `check` constraints, not just convention.
- A `countries` lookup table beats a check constraint for values expected to grow (new source countries) — same reasoning applies broadly to "closed set that isn't actually closed."

---

### 4FE.1 — Next.js Scaffold ✅

**Status:** Completed
**Context:** Unblocks all frontend work and gives `lib/adapters/` real TypeScript tooling to type-check against.

**What was done:**
Scaffolded Next.js 16 (App Router, Turbopack) + strict TypeScript + Tailwind via `create-next-app`, merged into the existing repo (not overwritten) since `package.json`/`.gitignore` already existed. Verified by starting the dev server and confirming the placeholder page rendered.

---

### 1ADP.1 — `SourceAdapter` Interface ✅

**Status:** Completed
**Context:** Common contract every country adapter implements — the piece that lets orchestration not care which country it's talking to.

**What was done:**
`fetch(): Promise<RawDocument[]>` / `parse(document): Promise<ParsedDisclosure[]>`. Deliberately excludes resolved `official_id`/`security_id` — adapters emit raw external IDs and raw text; resolution to canonical rows is a downstream orchestration concern, matching the `raw_security_text` → `security_identifiers` pattern already in the schema.

---

### 1ADP.2 — UK Adapter ✅

**Status:** Completed
**Context:** First real adapter; proved the `fetch()`/`parse()` pattern against a live government API.

**What was done:**
Targets `interests-api.parliament.uk`, scoped to Category 7 (Shareholdings) only — the Register's other 11 categories (gifts, donations, land, family employment) aren't securities. Uses the API's own stable interest `id` as `source_ref` (better than the design doc's assumed content-hash approach). 40-day `PublishedFrom` fetch window to cover the real ~28-day disclosure cadence with cron-downtime margin.

**Issues found and fixed:**
- Initial filter used `UpdatedFrom`, which only matches records with a correction history (`updatedDates` populated) — silently excluded every newly-registered, never-corrected shareholding, which is the majority case. Switched to `PublishedFrom`.

---

## Roadmap & Progress Updates

### Tasks Moved to Completed
- **1SCH.1–1SCH.5:** Core schema (officials, committees, securities, disclosure_events, ingestion_runs) + all data-integrity constraints
- **4FE.1:** Next.js scaffold
- **1ADP.1:** `SourceAdapter` interface
- **1ADP.2:** UK adapter

### Milestone 1 Progress
- Schema layer fully complete. Adapter layer started (1 of 3 in-scope structured sources done).

---

## Remaining Milestone 1 Work (as of this session)

| Task | Status | Blocker |
| --- | --- | --- |
| 1ADP.3 (AU) | To Do | None yet — not yet investigated |
| 1ADP.4 (EU Commission) | To Do | None |
| 1ING.1 | Blocked | Needs 1ADP.3/1ADP.4 |
| 1ING.2 | Blocked | Needs 1ADP.3/1ADP.4 |
| 1ING.3 | To Do | None |

---

## Next Steps (Recommended)

1. **1ADP.3 or 1ADP.4** — remaining structured-source adapters (Australia, EU Commission), following the same research-then-verify pattern that caught the UK `UpdatedFrom` bug before it shipped.

---

## Session Duration

Approximately a full working session (schema design and migration, constraint hardening, Next.js scaffold decision and build, `SourceAdapter` design, UK adapter build and live-API verification).
