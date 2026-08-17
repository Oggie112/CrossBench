# Work Record: 3RNK.1 Prerequisites — UK Ingestion Fix, EU Officials/Portfolios, Securities Identity & Sector Classification, Committee Sector Relevance

**Date:** 2026-08-17
**Time:** 13:53 UTC
**Focus:** Discover and resolve everything actually required for `3RNK.1` ("seed `committee_sector_relevance` weights") to be complete — a single roadmap line that scoping revealed was a much larger dependency chain.
**Outcome:** All 7 steps of the `3RNK.1` prerequisites plan resolved (4 PRs merged, 1 branch complete and ready to merge). `securities` went from 0 rows to 1,538 with real sector classification; `committee_sector_relevance` and `portfolio_sector_relevance` both exist and are populated for the first time; a real UK ingestion bug (and a separate, more serious officials-roster gap) found and fixed.

---

## Summary

Started by scoping `3RNK.1`, which the roadmap listed as a single line. That scoping surfaced that `securities` had zero rows in production, nothing populated `disclosure_events.security_id`, and EU had no committee equivalent to seed weights against — turning one task into a seven-step prerequisites plan (`docs/plan/3rnk1-prerequisites.md`), worked through in dependency order across five feature branches. Along the way, diagnosed and fixed a real UK ingestion bug (data silently wiped after a successful capture, with no backfill path once the record aged out of a too-narrow fetch window) and a separate, more serious gap where UK officials only ever existed in the database as a side effect of Select Committee membership — meaning any MP not on a committee could never be matched to a disclosure at all. Two planned data sources were dropped after testing against real data proved them worse than the alternative: GICS in favour of Yahoo Finance's own taxonomy, and Wikidata in favour of scraping the European Commission's own bio pages directly (Wikidata missed one of 27 commissioners entirely).

---

## Work Completed

### 3RNK.1 Step 0 — Fix UK Ingestion ✅

**Status:** Completed
**Context:** `disclosure_events` had 0 rows for `country = 'UK'` despite the adapter and daily cron both existing and reportedly live, while US (960 rows) and EU (40 rows) looked fine.

**What was done:**
Diagnosed against the live Parliament Interests API and the real `ingestion_runs` history rather than guessing. Found the adapter itself was not at fault — `CategoryId=8` (Shareholdings) is correct, the API is healthy, and `ingestion_runs` shows the adapter's very first run (23 Jul) correctly fetched and inserted the one real record in-window at the time. Publishing cadence is also genuinely thin (4 Shareholdings disclosures in all of 2026, 15 in all of 2025) — a 40-day trailing window has real odds of going empty even with nothing broken.

The actual fault: something wiped `raw_documents`/`disclosure_events` after 23 Jul, evidenced by `ingestion_runs` recording a successful UK insert that no longer existed in either table while `ingestion_runs`' own history was untouched. US/EU masked the same class of event by self-healing (enough volume, or an unconditional full-ZIP refetch); UK couldn't, because the adapter only ever fetches a rolling trailing window with no backfill mode.

Fixed: `FETCH_WINDOW_DAYS` widened from 40 → 90 in `lib/adapters/uk.ts`. Ran a one-off manual backfill (`PublishedFrom=2026-01-01`, through the real `runIngestion()` pipeline so it's logged like any other run) to recapture all 4 real 2026 records.

**Key learnings:**
- A rolling-window-only fetch with no backfill mode is a real architectural gap for any low-volume source — one bad day (a wipe, a cron outage) is unrecoverable without a manual intervention.
- EU's `ingestion_runs` reports `records_new: 27` on nearly every daily run even though `disclosure_events` stays stable at 40 total — the dedup itself is fine, the run-stats reporting mislabels "fetched" as "new." Flagged, not fixed (low urgency).

**Issues found and fixed:**
- Sparse UK publishing cadence + a 40-day window + a data wipe → permanent UK data loss with no way for the adapter to self-heal → widened window to 90 days.

---

### 3RNK.1 Step 0b — Fix UK Officials Roster Gap ✅

**Status:** Completed
**Context:** After the ingestion fix, the 4 recovered UK disclosures still backfilled to 0 matched officials. Root cause was structural, not a data problem.

**What was done:**
`seed-uk.ts` only ever created an `officials` row as a side effect of Select Committee membership crawling — there was no independent "seed every current MP/Lord" pass the way `seed-us.ts` has for Congress. Since committee seats are a small subset of the ~650 Commons + ~800 Lords membership, any MP or Lord not on a Select Committee could never be matched to a disclosure, no matter how many times the backfill ran.

Added `seedRoster()`, a new first pass against the UK Parliament Members API (`members-api.parliament.uk`, independent of the Committees API but using the same `mnisId` scheme), that seeds every current MP and Lord before committee crawling runs. Refactored `upsertOfficial` to a unified `OfficialRecord` shape so both the roster pass and the committee-crawl pass call it identically.

```typescript
async function seedRoster(): Promise<number> {
	const [commons, lords] = await Promise.all([fetchCurrentRoster(1), fetchCurrentRoster(2)]);
	const roster = [...commons, ...lords];
	for (const official of roster) await upsertOfficial(official);
	return roster.length;
}
```

Ran live: 1,438 current members seeded (650 Commons + 788 Lords), all 4 previously-orphaned disclosures backfilled with `official_id`. Verified against real names, not just row counts — Tom Tugendhat, Alan Mak, John Glen, Gareth Davies, none of whom sit on a Select Committee.

**Key learnings:**
- "Officials only exist as a side effect of committee crawling" is a silent, structural cap on match rate that never surfaces as an error — it just quietly matches fewer disclosures than it should, forever.

---

### 3RNK.1 Step 1 — Sector Taxonomy Decision ✅

**Status:** Decision made
**Context:** `securities.sector`, `committee_sector_relevance.sector`, and (later) `portfolio_sector_relevance.sector` all needed one agreed vocabulary before anything downstream could be built.

**What was done:**
Chose Yahoo Finance's own sector scheme over GICS (`Technology, Financial Services, Healthcare, Consumer Cyclical, Consumer Defensive, Energy, Utilities, Real Estate, Basic Materials, Industrials, Communication Services`) — since sector data was always going to be sourced from Yahoo Finance directly, adopting GICS instead would mean maintaining a permanent translation layer for no benefit.

---

### 3RNK.1 Step 2 — Yahoo Finance Lookup Wrapper ✅

**Status:** Completed
**Context:** Needed a free ticker/company-name → sector source to classify securities. Investigated a related academic project (`Peez49/Informed-Trading`) for methodology first.

**What was done:**
The originally planned `quoteSummary`/`assetProfile` endpoint (what the `yfinance` Python library wraps) turned out to reject anonymous requests — confirmed directly, `"Invalid Crumb"` on a plain fetch. Pivoted to the `v1/finance/search` endpoint instead, which needs no crumb and returns `sector`/`industry` inline on `EQUITY`-type results, covering both ticker and company-name lookup with one endpoint (`lookupByTicker`, `lookupByName`).

Verified against five real cases, not just the happy path: a clean ticker match (`NFLX`), an ETF correctly returning `null` (no single sector applies), a legal-suffix retry recovering a real match (`"Erste Group AG"` → `"Erste Group Bank AG"`), and two distinct genuine-no-coverage cases (a private UK company, a smaller Italian bank with no Yahoo listing).

First live bulk run (against 1,538 securities, see Step 4) hit a raw `ECONNRESET` partway through — confirmed the wrapper's flagged reliability risk directly rather than hypothetically. Fixed with retry-with-backoff in the wrapper itself and request pacing in the bulk caller, rather than retrying blind.

**Key learnings:**
- `Peez49/Informed-Trading` has no LICENSE file — used as methodology validation only (confirmed the sector-per-ticker and committee-jurisdiction-mapping approaches are solved problems, and its `Is_General_Jurisdiction`/`Exclude_From_Analysis` flags and pure-boolean weighting were worth adopting directly), never as a data source to copy. Captured in `docs/learnings.md`.
- An unofficial API behaving reliably in isolated testing doesn't mean it survives real bulk load — build in resilience before trusting a clean test run.

---

### 3RNK.1 Step 3 — Securities Identity Resolution ✅

**Status:** Completed
**Context:** `securities` had 0 rows and nothing populated `disclosure_events.security_id` — this domain didn't exist at all before this session.

**What was done:**
Built one shared parser (`lib/securities/parse-security-text.ts`) covering all four sources, not per-source variants as originally assumed — House, Senate, EU, and UK all reduce to "extract a trailing `(CODE)` group if one exists, else fall back to the full cleaned text as a name." Ticker vs. CUSIP distinguished by shape (1-6 letters vs. 9-char alphanumeric-with-digits). Matching goes through the existing `security_identifiers` table (`ticker`/`cusip`/`name_alias`, globally unique per type+value) rather than `securities.isin`/`primary_ticker` directly — already schema-shaped for exactly this.

Case-only text variants dedup correctly (`"Madison Conn GO BD"` / `"Madison Conn Go Bd"` → one security via normalized `name_alias`) while substantively different bonds stay distinct (`"US TSY NOTE 02/15/34"` vs `"...02/15/35"` — normalization never touches dates or coupon %). Multi-leg exchange transactions deliberately capture only one leg rather than building a two-security splitter for a pattern seen once in 120 sampled rows.

Ran live: all 3,996 `disclosure_events` resolved, 1,538 distinct securities created. Verified real dedup on live data, not just counts — 48 separate House/Senate AAPL disclosures all resolve to one security via `ticker`.

**Issues found and fixed:**
- None — clean run on first execution after upfront verification against real sample data.

---

### 3RNK.1 Step 4 — Securities Sector Classification ✅

**Status:** Completed
**Context:** Populate `securities.sector`/`.industry` using the step 2 wrapper over the 1,538 real securities from step 3.

**What was done:**
Added `securities.industry` alongside `sector` (migration `20260815120516_securities_industry.sql`) since the wrapper already returns it for free on every lookup. First live run hit the `ECONNRESET` described in Step 2; fixed and re-ran cleanly.

Final: 1,101/1,538 classified (72% of securities rows) — but the more meaningful figure, checked at the `disclosure_events` level rather than the securities-row level, is **82.7% overall and 94.7% for equities specifically**, since a handful of popular stocks dominate real disclosure volume while bonds (which structurally don't have a single sector) are mostly one-off. Verified the unclassified remainder is genuinely bonds/ETFs (no sector applies) plus a small real gap (private companies, ~6% of the total), not a systematic failure.

**Key learnings:**
- Row-count coverage and disclosure-weighted coverage can tell very different stories — always check which one actually matters for the downstream use case before judging "is this good enough."

---

### 3RNK.1 Step 5 — `committee_sector_relevance` Weight Seeding ✅

**Status:** Completed
**Context:** UK (98) + US (230) = 328 committees, too many to hand-write individually.

**What was done:**
Built `lib/committees/classify-committee.ts` — an explicit, auditable rules table rather than a black-box heuristic, using real domain knowledge (e.g. "Ways and Means" has zero keyword tie to tax/trade/Social Security policy) rather than blind pattern matching, with general-jurisdiction parents (Appropriations, Energy and Commerce, Oversight) correctly handled as often having genuinely specific subcommittees despite the parent being broad.

Weight is a primary/secondary tier, not fully graded: a committee's first-listed sector gets weight `1`, additional sectors get `0.5`. GENERAL/EXCLUDE committees get no row at all rather than an explicit `0` — the ranking formula's `coalesce(csr.weight, 0)` already treats an absent row as zero, so an explicit-zero row would be pure table bloat (up to 328×11 rows) for no behavioural difference.

`seed-committee-sector-relevance.ts` writes a full audit file listing **all 328 committees** with their classification and reasoning, not just the ones that failed to match, since this is editorial judgment throughout. That audit caught two real regex bugs before the output was trusted: `\bBill\b` doesn't match plural "Bills" (word boundary sits between "Bill" and "s"), and an `Education`/`Services Committee (Lords)` pattern wrongly assumed chamber text lives inside the committee name string rather than being a separate column. Also caught a reason-text bug: a `Digital Assets` rule's explanation claimed "a Financial Services subcommittee" but correctly also matched an Agriculture subcommittee with real CFTC/commodity-derivatives jurisdiction.

Final, verified against the DB directly: 217 relevance rows (151 at weight `1`, 66 at weight `0.5`) across 151 committees classified into sectors, 102 general jurisdiction, 75 excluded, 0 unclassified.

**Key learnings:**
- An audit file that shows *every* decision, not just the failures, catches bugs a "flag only what didn't match" approach never would — the two regex bugs and the reason-text bug were all found by reading through *successful* classifications, not the unmatched bucket.

---

### 3RNK.1 Step 6 — EU Portfolio Path ✅

**Status:** Completed (branch `feat/eu-portfolio-path`, not yet merged)
**Context:** EU has no committee structure — Commissioners hold individual portfolios instead, which the DOI declaration documents don't state anywhere.

**What was done:**
Added `portfolios`, `official_portfolios`, `portfolio_sector_relevance` tables mirroring committees' shape rather than reusing it directly — real mismatches beyond naming (portfolio is 1:1 with no role gradient vs. committee membership's many-to-many churn; `chamber NOT NULL` encodes a concept the Commission doesn't have; committee-relevance weights assume diluted influence vs. a portfolio's near-exclusive authority; committee identity is stable by name for years, portfolio titles reshuffle every 5-year Commission term). Dropped `officials.current_office` — confirmed unused, never populated by any seeder or read anywhere.

The original plan was Wikidata-primary with a Commission-site cross-check for staleness. Testing against real data flipped that entirely: Wikidata missed one of 27 commissioners outright (zero current `P39` claims for Teresa Ribera), needed a hand-broadened label pattern to catch the President's and High Representative's non-"Commissioner" titles, and its labels are just a derived, crowd-sourced rendering of the same fact the Commission's own bio pages state directly and completely. Dropped Wikidata entirely rather than keeping it as a "safety net" — maintaining two integration paths where one already fully covers the need is bloat, not redundancy, same reasoning as dropping GICS in step 1.

```typescript
// The President isn't listed under /college-commissioners/<slug>_en like
// everyone else - she has her own /about/organisation/president_en page.
// That link is discovered from the listing page itself (a structural
// pattern, true for whoever holds the role) rather than matched by name, so
// nothing here breaks when the presidency changes hands.
async function discoverProfileUrls(): Promise<string[]> { ... }
```

`lib/identity/eu-portfolio-source.ts` scrapes the College of Commissioners page directly: discovers each bio-page URL, extracts the role from a consistent `"<Name> is the <title>."` sentence, and matches commissioners to pages by name-token overlap against each page's own stated name — the Commission's own slugs drop middle names/second surnames inconsistently (`"Teresa Ribera Rodríguez"` → `teresa-ribera`) in a way that can't be reliably reconstructed from the DOI's full name. **27/27 resolved, zero manual review needed** — better coverage than Wikidata ever achieved.

`lib/identity/classify-portfolio.ts` classifies each real title into sectors using the same primary/secondary weight convention as step 5. Final, verified against the DB directly: 27 portfolios, 27 `official_portfolios` memberships (correctly 1:1), 22 `portfolio_sector_relevance` rows across 14 sector-classified and 13 general-jurisdiction portfolios.

**Key learnings:**
- A secondary/derived data source (Wikidata) is not automatically a useful safety net alongside the primary source it derives from — test both against real data before assuming redundancy adds value rather than just cost.
- Structural discovery (following a link found on the page itself) beats name-based special-casing for anything tied to a role rather than a person — avoids code that silently breaks the next time that role changes hands.

---

## Roadmap & Progress Updates

### Tasks Moved to Completed
- **3RNK.1 (all 7 prerequisite steps):** `docs/plan/3rnk1-prerequisites.md` now shows all steps resolved. `docs/roadmaps/mvp.md` updated to match — `3RNK.1` moved from To Do to Completed in Milestone 3, and its node removed from the progress-map mermaid diagram (matching the diagram's existing convention of only showing unresolved work), along with the now-satisfied `3RNK.1 --> 3RNK.5` edge.

### Task Status Changes
- **UK ingestion window:** `FETCH_WINDOW_DAYS` 40 → 90 in `lib/adapters/uk.ts`, plus a one-off historical backfill to recapture data lost to the wipe described in Step 0.
- **`officials.current_office`:** dropped (migration `20260817113221_drop_officials_current_office.sql`) — confirmed dead code, superseded by the new `portfolios` table for the one credible use case that had been proposed for it.

### Milestone 3 (Ranking Engine) Unblocked
- **3RNK.1** complete, marked as such in `docs/roadmaps/mvp.md`.
- **3RNK.5** (`mv_signal_scores`) remains blocked on 3RNK.2/3/4 (trade size, cluster, cross-jurisdiction — none started), not on 3RNK.1 any longer.

---

## Remaining Milestone 3 Work

| Task | Status | Blocker |
| --- | --- | --- |
| 3RNK.1 | Complete | None |
| 3RNK.2 `mv_trade_size_score` | Not started | None (unblocked) |
| 3RNK.3 `mv_cluster_score` | Not started | None (unblocked) |
| 3RNK.4 cross-jurisdiction subquery | Not started | None (unblocked) |
| 3RNK.5 `mv_signal_scores` | Blocked | Depends on 3RNK.2–3RNK.4 |
| 3RNK.6 wire refresh into daily cron | Blocked | Depends on 3RNK.5 |

---

## Next Steps (Recommended)

1. **Merge `feat/eu-portfolio-path`** — the only branch from this session not yet on `main`.
2. **3RNK.2 (`mv_trade_size_score`)** — natural next Milestone 3 task now that 3RNK.1's real dependency chain is clear; no longer blocked by anything discovered in this session.
3. **EU `ingestion_runs` "fetched" vs. "new" mislabeling** — flagged in Step 0 as a separate, low-urgency bug, still unfixed.

---

## Session Duration

Spanned three working sessions across 2026-08-14 to 2026-08-17 (UK ingestion diagnosis and fix, EU officials seeding, Peez49 methodology research, Yahoo Finance wrapper and two rounds of reliability hardening, securities identity resolution, committee sector-relevance seeding across 328 committees, EU portfolio scraping and sector classification).
