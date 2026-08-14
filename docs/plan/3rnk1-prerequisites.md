---
description: Work required before 3RNK.1 (committee/portfolio sector-relevance) can be considered complete, discovered while scoping it out
---

# Plan: 3RNK.1 Prerequisites

The roadmap lists `3RNK.1` as a single line — "seed `committee_sector_relevance` weights." Scoping it out surfaced a larger dependency chain: `securities` has zero rows in production, nothing populates `disclosure_events.security_id`, and EU has no committee equivalent to seed weights against at all. This doc breaks that out. Agreed to sequence this ahead of the rest of Milestone 3.

## 0. Fix UK ingestion — resolved

`disclosure_events` had 0 rows for `country = 'UK'` despite the adapter and daily cron both existing and reportedly live, while US (960 rows) and EU (40 rows) looked fine. Diagnosed against the live Parliament Interests API and the real `ingestion_runs` history, not a guess:

- **Not an adapter bug.** `CategoryId=8` (Shareholdings) is correct, the API is healthy (1,278 results across all categories for 2026), and `ingestion_runs` shows the adapter's very first run (23 Jul) correctly fetched and inserted the one real record that was in-window at the time.
- **Publishing cadence is genuinely thin**, not a symptom of anything broken: 4 Shareholdings disclosures in all of 2026 to date, 15 in all of 2025. A 40-day trailing window has real odds of going empty even with nothing wrong.
- **The actual fault: something wiped `raw_documents`/`disclosure_events` after 23 Jul**, evidenced by `ingestion_runs` recording a successful UK insert (`records_new: 1`) that no longer exists in either table, while `ingestion_runs`' own history was untouched. US/EU masked the same class of event by self-healing (US has enough volume to refill fast; EU unconditionally refetches its whole ZIP every run). UK couldn't, because the adapter only ever fetches a rolling trailing window with no backfill mode — once its one real record aged out (17 Jun + 40 days = 27 Jul), it was gone for good with no way for the adapter to ask for it again on its own.

**Fixed:**
- `FETCH_WINDOW_DAYS` widened from 40 → 90 in `lib/adapters/uk.ts` — real publishing cadence doesn't reliably fit inside 40 days, and the cost of a wider window is negligible (pagination scales with result count, not window size).
- Ran a one-off manual backfill (`PublishedFrom=2026-01-01`, through the real `runIngestion()` pipeline so it's logged in `ingestion_runs` like any other run) to recapture all 4 real 2026 records. Re-ran `seed-uk.ts` afterward to resolve `official_id` on them.

Separate, unfixed observation from the same investigation: EU's `ingestion_runs` reports `records_new: 27` on nearly every daily run, but `disclosure_events` for EU stays stable at 40 total — the `raw_documents` unique constraint is deduping correctly, but the run stats are mislabeling "fetched" as "new." Low urgency, not blocking anything here.

## 1. Sector taxonomy — decided

Use **Yahoo Finance's own sector scheme**, not GICS: `Technology, Financial Services, Healthcare, Consumer Cyclical, Consumer Defensive, Energy, Utilities, Real Estate, Basic Materials, Industrials, Communication Services`. Chosen because step 2 sources sector data from Yahoo Finance directly — adopting GICS instead would mean maintaining a permanent translation layer between Yahoo's categories and GICS's for no benefit, since nothing else in the schema assumes GICS today. This is the vocabulary `securities.sector`, `committee_sector_relevance.sector`, and `portfolio_sector_relevance.sector` must all agree on.

## 2. Yahoo Finance lookup wrapper — resolved

Built `lib/securities/yahoo-finance.ts`. The originally planned endpoint didn't survive contact with reality:

- **`quoteSummary`/`assetProfile` (what `yfinance` wraps) now rejects anonymous requests** — confirmed directly, a plain `fetch` returns `{"error":{"code":"Unauthorized","description":"Invalid Crumb"}}`. This is the exact reliability risk flagged as hypothetical when this step was first scoped, now confirmed real and current, not just a theoretical worry about the wider `yfinance` community's experience.
- **Pivoted to the `v1/finance/search` endpoint instead** — no crumb required, and it returns `sector`/`industry` inline on `EQUITY`-type results, covering both the ticker-lookup and company-name-lookup cases with one endpoint instead of two. Two exported functions: `lookupByTicker(ticker)` and `lookupByName(companyName)`.
- **Verified against five real cases**, not just the happy path: `NFLX` (clean ticker match), `AMZA` (an ETF — correctly returns `null`, since ETFs have no `sector`/`industry` fields at all, matching Peez49's own manual "Broad Market / ETF" override category), `"Erste Group AG"` (a real EU disclosure string — initial search returns nothing, because Yahoo's stored name is `"Erste Group Bank AG"`; `lookupByName` retries with the legal suffix stripped and correctly resolves to `EBS.VI`), `"Lockhouse Systems Limited"` (one of the real UK disclosures — genuinely private, correctly `null`), `"Banca Popolare di Bari"` (a real, non-private Italian bank with no Yahoo coverage — correctly `null`, distinct from the private-company case but same result, confirming a "no coverage" bucket is unavoidable and not a bug to chase).

The licensing/ToS caveat from before still stands (Yahoo's terms restrict automated access and redistribution) — treated the same as the design doc's existing unresolved **US commercial-use** and **AU/EU licensing** questions, flagged not blocking, revisit before monetization. Not reusing `Peez49/Informed-Trading`'s CSVs directly (no LICENSE file) — methodology validation only, per `docs/learnings.md`.

## 3. Securities identity resolution (new)

Nothing currently exists here — `securities` has 0 rows, and no adapter has ever written to it or to `disclosure_events.security_id`. Format varies significantly per source, checked against real rows:

- **US House**: mostly clean, ticker present in parens (`"Netflix, Inc. - Common Stock (NFLX)"`) — but non-equity instruments (Treasury notes, bonds) have a CUSIP-like code instead of a ticker.
- **US Senate**: inconsistent — ticker sometimes present, sometimes only a company name plus bond rate/maturity details, and exchange transactions pack two securities into one string (`"BERY - Berry Global Group, Inc. (Exchanged) ... Amcor plc Ordinary Shares (Received) (AMCR)"`).
- **EU**: pure free-text company/entity names, sometimes non-English, sometimes with editorial asides — no ticker ever.
- **UK**: now known from step 0's backfill — pure free-text company names, same shape as EU (`"Lockhouse Systems Limited"`, `"AccuRx Ltd"`), no ticker ever. Worse hit-rate expected than EU: these read like small/private UK companies rather than listed ones, and Yahoo Finance only covers publicly traded securities — confirmed directly, `lookupByName("Lockhouse Systems Limited")` correctly returns no match because there is genuinely nothing to match, not because of a parsing gap.

Build a per-source parser extracting `{tickerOrIsin, canonicalName}`, upsert into `securities`, backfill `disclosure_events.security_id` — same identity-seeding shape as `seed-uk.ts`/`seed-us.ts`/`seed-eu.ts`, new domain (securities instead of officials).

## 4. Securities sector classification

Using the step 2 wrapper: `lookupByTicker` for US-sourced rows (ticker/CUSIP), `lookupByName` for EU and UK rows (no ticker in either, confirmed same shape for both in step 3). `lookupByName`'s legal-suffix-stripping retry recovers some real matches that a naive exact-string search would miss (e.g. `"Erste Group AG"` → `"Erste Group Bank AG"`), but a genuine no-coverage floor is expected and confirmed, not a bug — mostly private UK companies and some smaller/delisted EU ones. Populate `securities.sector`; leave unmatched rows null rather than force a manual override table for every miss, since "no public sector data exists" is often the honest answer, not a gap to fill.

## 5. `committee_sector_relevance` weight seeding

UK: 98 committees. US: 230 committees. 328 total — too many to hand-write cleanly. Do a keyword-heuristic first pass (committee name → sector) plus a manual review file, following the same "don't assume, flag it" convention as the existing unmatched-notes pattern in `seed-uk.ts`/`seed-us.ts`. Flag general-jurisdiction committees (e.g. House Appropriations) rather than letting them dilute every sector, per the Peez49 methodology.

## 6. EU portfolio path

EU has no committee structure — Commissioners hold individual portfolios instead, which the DOI declaration documents don't state anywhere (confirmed by direct inspection of all 27 documents). Needs its own structure, mirroring committees rather than reusing them (real mismatches beyond naming: portfolio is 1:1 with no role gradient vs. committee membership's many-to-many churn; `chamber NOT NULL` encodes a real legislative-chamber concept the Commission doesn't have; committee-relevance weights assume diluted/shared influence vs. a portfolio's near-exclusive authority; committee identity is stable by name for years, portfolio titles reshuffle every 5-year Commission term).

- Migrations: `portfolios` (id, title, country, external_ids), `official_portfolios` (official_id, portfolio_id, start_date, end_date — same shape as `official_committee_memberships`), `portfolio_sector_relevance` (portfolio_id, sector, weight — same shape as `committee_sector_relevance`).
- Drop `officials.current_office` — confirmed unused (never populated by any seeder, never read anywhere), and the portfolio tables now cover the one credible use case that had been proposed for it.
- Extend `seed-eu.ts`: exact full-name search against Wikidata (verified this resolves cleanly — tested von der Leyen, Kubilius) → filter `P39` ("position held") claims by label pattern (`"European Commissioner for..."`), not by missing end-date, since Wikidata's end-date qualifiers are confirmed stale/incomplete on at least one real commissioner (Kubilius still shows an open-ended "Member of the European Parliament" claim despite becoming Commissioner in Dec 2024) → upsert `portfolios` + `official_portfolios`. Cross-check against the Commission's own College of Commissioners page to catch exactly this kind of staleness.
- Seed `portfolio_sector_relevance` for 27 portfolios — much smaller effort than step 5, a good pilot before it.

## Dependencies

```mermaid
graph TD
  s0["0. Fix UK ingestion (resolved)"]:::done
  s1["1. Sector taxonomy (decided)"]:::done
  s2["2. Yahoo Finance wrapper (resolved)"]:::done
  s3["3. Securities identity resolution"]:::open
  s4["4. Securities sector classification"]:::open
  s5["5. committee_sector_relevance seeding"]:::open
  s6["6. EU portfolio path"]:::open
  done3rnk["3RNK.1 complete"]:::mile

  s1 --> s2
  s2 --> s4
  s3 --> s4
  s1 --> s5
  s1 --> s6
  s4 --> done3rnk
  s5 --> done3rnk
  s6 --> done3rnk

  classDef indep fill:#ff9;
  classDef done fill:#9f9;
  classDef open fill:#ff9;
  classDef mile fill:#9ff;
```

`0` is independent — no dependency on the rest, do it first as agreed. `3` and `5`/`6` don't depend on each other and can run in parallel once the taxonomy is fixed. `3RNK.5` (wiring `committee_sector_relevance`/`portfolio_sector_relevance` into the actual `mv_signal_scores` formula) is downstream of this doc entirely and already tracked separately on the roadmap — not repeated here.
