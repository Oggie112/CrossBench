# Work Record: Australia Investigation, EU Commission & US House Adapters

**Date:** 2026-07-15
**Time:** 18:13 UTC
**Focus:** Resolve Australia's data-source question, then build and verify two more source adapters — EU Commission (Word-doc-as-XML) and US House (PDF form parsing) — against real government data.
**Outcome:** 1 task reclassified (Australia deferred to Tier 3), 2 adapters completed and verified (EU Commission, US House). Milestone 1's structured-source tier essentially done bar Australia; Milestone 2 has its first working adapter.

---

## Summary

Investigated Australia's disclosure register and found the design doc's "Tier 2, structured, in scope" classification was wrong — reclassified it alongside the deferred Tier 3 PDF sources. Built the EU Commission adapter against a genuinely awkward source (Word documents wearing an XML costume, with deeply nested form-field structure), then the US House adapter — the most structurally complex of the three adapters built so far, parsing real PDF forms via coordinate reconstruction rather than clean structured data. Both adapters surfaced multiple real bugs only discoverable by testing against live data, all found and fixed before being considered done.

---

## Work Completed

### 1ADP.3 — Australia: Investigated, Reclassified

**Status:** Decision made (not built)
**Context:** Design doc classified AU as "Tier 2, structured register, in scope" — investigation found this was wrong.

**What was done:**
Confirmed via search and direct fetch attempts that Australia's federal Register of Members' Interests (`aph.gov.au`) is per-MP PDF documents (e.g. `Joyce_48P.pdf`), the same shape as the design doc's own deferred Tier 3 sources (Germany/France/Italy), not a structured API or bulk dataset. A third-party aggregator, `openpolitics.au`, had already done the extraction work but turned out to require a paid subscription — ruled out (contradicts the free-four-source MVP philosophy, and would add a licensing question on top of the access cost). Reclassified AU into the same "deferred, needs LLM-assisted PDF extraction" bucket as Germany/France/Italy, updating both the roadmap task and the "Beyond MVP" stretch-goal note.

---

### 1ADP.4 — EU Commission Adapter ✅

**Status:** Completed
**Context:** Second structured source; revealed the design doc's "machine-readable ZIP" description meant something much messier than UK's clean JSON API.

**What was done:**
Downloads the Commission's Declarations of Interests ZIP, parses each Commissioner's Word-document-as-XML file, extracts Section III.A.1 (Shares) via a text-anchor-and-offset-map technique to jump from readable flattened text back to precise raw-XML positions. Filters to English-only declarations (verified every Commissioner has one) and excludes the archive's "Test Form" placeholder. Added a `currency` column to `disclosure_events` — EU figures are exact values in varying currencies (EUR, CZK confirmed in real data), unlike UK's GBP-implicit bands.

**Issues found and fixed:**
- Anchor search for `"III.A.1  Shares"` (two spaces) came from a whitespace-*normalized* exploration pipeline, not the literal raw XML — failed to match. Fixed by searching for `"III.A.1"` alone plus a nearby-text confirmation check.
- Table rows/cells were nested inside several layers of Word "repeating section" content controls (`w:sdt > w:sdtContent`), not direct children of `w:tbl`/`w:tr` as assumed. Fixed with a generic recursive tag search (`findAllDeep`) instead of hardcoding the nesting depth.
- `fast-xml-parser` silently auto-converts numeric-looking text (`"131.04"`) into JS numbers by default — broke cell-text extraction, which only handled strings and `{#text}`-wrapped objects. Fixed with `parseTagValue: false`.

**Also:** tightened the file's `any` usage per project TypeScript standards — `findAllDeep` returns `unknown[]` instead of `any[]`, replaced an `as any` cast with a proper type-guard function, and explicitly annotated the `fast-xml-parser` library boundary as `unknown` rather than letting its untyped return propagate.

Also investigated and ruled out `house-stock-watcher` and `senate-stock-watcher` (open-source projects that already parse US congressional PTRs, both abandoned — last commits from mid-2025 and 2021 respectively) and noted `kadoa-org/congress-trading-monitor` (genuinely live, but outsources its own PDF parsing to a commercial service) while researching prior art ahead of the US House adapter.

---

### 2ADP.5 — US House Adapter ✅

**Status:** Completed
**Context:** First Tier-1 (trade-level) source; the most structurally complex adapter built so far.

**What was done:**
Downloads the House Clerk's annual XML index, filters to `FilingType = "P"` (Periodic Transaction Report), then downloads each filing's individual PDF (`ptr-pdfs/{year}/{docId}.pdf`) with a real `User-Agent` and rate-limiting (evidenced necessary — `ethics.house.gov` had 403'd an unheadered fetch during EU-adapter research). Parses each PDF via `pdf2json`'s coordinate output rather than flattened text — column x-positions verified consistent across every filer tested. Maps `P`/`S`/`E` to `buy`/`sell`/`exchange`, asset-type bracket codes (`[ST]`, `[GS]`, `[OP]`, etc.) to `equity`/`bond`/`option_call`/`option_put`/`other`, and parses standard STOCK Act amount bands into real `amountMin`/`amountMax` numbers.

Verified against 295 real 2026 `P`-type filings, plus targeted samples pulled from 2024/2025 specifically to find options (both calls and a put) and bond examples not present in the smaller current-year dataset.

Also extended the `SourceAdapter` interface with an optional `knownSourceRefs?: ReadonlySet<string>` parameter on `fetch()` — non-breaking for UK/EU (TypeScript structural typing allows implementations that ignore an optional param), lets orchestration tell a per-document-fetch source (one HTTP request per PDF here, unlike UK/EU's single-request fetches) which `source_ref`s it already has, cutting redundant downloads and rate-limit exposure.

**Issues found and fixed:**
- PDF glyph-positioning artifacts (from the decorative "PTR" letterhead) came through as literal null-byte characters, not empty strings. `.trim()` doesn't strip control characters, so a plain emptiness check silently let them through — corrupted every regex expecting adjacent, uninterrupted characters (e.g. `"FS: New"` became unmatchable). Fixed by filtering null bytes explicitly before the emptiness check.
- The repeating "Owner Asset" page-header text overlapped the asset column's x-range; when a transaction's amount didn't need line-wrapping, the continuation-fold logic mistook the *next page's header row* for a legitimate continuation, appending garbage (`"e r A sse t"`) to the asset name. Fixed with explicit header-row detection.
- Two genuine edge cases — a malformed page-break artifact splitting one transaction's continuation, and exchange-type (`E`) transactions reporting a per-share fair-market value (`"$15.00"`) instead of a two-figure band — both produced amount text that didn't match the expected shape. Rather than silently accept a truncated/wrong number, `parseAmountBand` now requires exactly two figures and throws otherwise; the per-transaction loop catches and logs (loudly, via `console.error`) rather than letting one bad row in a 200+-transaction filing cost the rest.

---

## Roadmap & Progress Updates

### Tasks Moved to Completed
- **1ADP.4:** EU Commission adapter
- **2ADP.5:** US House adapter

### Task Status Changes
- **1ADP.3:** To Do → reclassified as Tier 3 deferred. Not a task dependency block; a sourcing-strategy decision.
- **1ING.2:** Description corrected — originally assumed UK/AU/EU all needed a content-hash `source_ref`; UK and EU both turned out to have real stable IDs available, no hash needed for either.

### Milestone 1 Unblocked
- **1ING.1, 1ING.2, 1ING.3** moved from Blocked → **To Do** (UK + EU alone satisfy their dependencies; AU no longer required)

### Milestone 2 Unblocked
- **2ING.4** moved from Blocked → **To Do** (US House's idempotency is solved — `DocID` as `source_ref`)

---

## Remaining Milestone 1 & 2 Work

| Task | Status | Blocker |
| --- | --- | --- |
| 1ING.1 | To Do | None |
| 1ING.2 | To Do | None |
| 1ING.3 | To Do | None |
| 1ADP.3 (AU) | Blocked | Deferred to Tier 3 (LLM extraction), not scheduled |
| 2ADP.6 (US Senate) | To Do | None |
| 2ING.4 | To Do | None |
| 2ING.5 | Blocked | 2ADP.6 |
| 2ING.6 | Blocked | 2ADP.6 |

---

## Next Steps (Recommended)

1. **2ADP.6 — US Senate adapter** — the design doc's own "most failure-prone adapter" flag (no official bulk API, only a scrapeable search portal); natural next step to complete the US source tier. User has indicated a preference to build this before officials seeding.
2. **Officials seeding** — no task currently exists for populating the `officials` table with real UK MPs/EU Commissioners/US Representatives; needed before orchestration can resolve any adapter's `officialExternalId`. User wants this batched alongside/after the Senate adapter rather than done per-adapter.
3. **Orchestration layer** — none of the three working adapters have ever written a real row to `raw_documents`/`disclosure_events` yet; everything verified so far ran through throwaway scripts. This is the actual next blocker to having real data in the database, and depends on officials seeding being done first.

---

## Session Duration

Approximately a full working session (Australia research and reclassification, EU Commission ZIP/XML exploration and adapter build with three debugging cycles, US House PDF research and adapter build with three further debugging cycles, TypeScript strictness pass on the EU adapter).
