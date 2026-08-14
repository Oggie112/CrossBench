# Session Learnings

> Auto-generated log of insights captured from Claude sessions.

---

## Peez49/Informed-Trading — Reference for Committee/Sector Mapping — 2026-08-14

While scoping the prerequisite work for `3RNK.1` (see [docs/plan/3rnk1-prerequisites.md](plan/3rnk1-prerequisites.md)), investigated [Peez49/Informed-Trading](https://github.com/Peez49/Informed-Trading) — an academic project evaluating informed trading by US Congress members via committee-jurisdiction mapping. No LICENSE file (`gh api repos/Peez49/Informed-Trading --jq '.license'` → `null`), so treated throughout as a methodology reference, never as a data source to copy from directly.

### Key Learnings

**Worth stealing directly:**

- **Two-tier taxonomy (Sector + Industry), not Sector alone.** Confirmed via their `code/data_scraping.ipynb` that `stock_industry_classifications.csv` comes from `yfinance`'s `Ticker(t).info.get("sector")` / `.get("industry")` — Yahoo Finance's own unofficial `quoteSummary`/`assetProfile` endpoint, not GICS. Broad **Sector** (11 buckets: Technology, Financial Services, Healthcare, Consumer Cyclical, Consumer Defensive, Energy, Utilities, Real Estate, Basic Materials, Industrials, Communication Services) plus a finer **Industry** field (e.g. "Farm Products", "Agricultural Inputs") from the same API call at no extra cost. Sector alone is coarse — worth capturing industry too when CrossBench builds its own securities-classification step, even if the ranking formula only uses sector at first.
- **`Is_General_Jurisdiction` flag.** In `Jurisdictional_Matrix_Final.csv` (316 rows, US House + Senate), committees with broad cross-cutting jurisdiction — House Appropriations, House Ethics, House Foreign Affairs — are flagged rather than force-mapped to one sector. Directly applicable to UK/US committee weight seeding (e.g. UK's Liaison Committee, Procedure and Privileges Committee).
- **`Exclude_From_Analysis` flag — kept distinct from general-jurisdiction, not collapsed into it.** Committees like House Intelligence, Joint Committee on Printing, Joint Committee on the Library, and the Joint Economic Committee have *no* meaningful sector-trading relationship at all (procedural/administrative bodies, or too sensitive to map) — excluded entirely rather than down-weighted. "Broad, weight it low" and "excluded, don't map it at all" are different judgments; worth keeping both as separate flags in CrossBench's own committee review process.
- **`N_per_Committee_Industry.csv` — a sample-size sanity check to replicate.** Counts range from 3,290 (Armed Services) down to low hundreds. Before trusting any committee/sector weight pairing in `3RNK.5`, run the equivalent query against real `disclosure_events` and flag low-N pairings — echoes the MVP design doc's own caution against re-tuning formula weights on an early small sample (§7 rule 6).

**Worth adapting, not copying wholesale:**

- **Their weights are boolean membership, not a graded 0-1 scale.** `Mapped_Sectors`/`Mapped_Industries` is a plain "is this sector in scope for this committee: yes/no" list — no numeric weight at all. Real evidence against over-engineering CrossBench's own `committee_sector_relevance.weight` column with fabricated precision (e.g. an arbitrary 1/0.5/0 tier system) when simple boolean membership may be sufficient for MVP.
- **Curation effort is real, not a one-script task.** 316 hand/LLM-mapped rows for US House+Senate alone — comparable in scale to CrossBench's own 328 UK+US committees. Confirms the "keyword-heuristic first pass + manual review" plan (step 5) is the right shape, but it's genuine curatorial work to budget for honestly, not something to expect a script to fully automate.

**Doesn't transfer:**

- Their ticker→sector approach assumes a US-listed-only universe (Congress trades). No equivalent for company-name-only matching, which is exactly EU's problem — EU disclosure text has no tickers at all, unlike Congress trades. Still entirely CrossBench's own problem to solve.
- Their multi-Congress historical committee panel (112th–119th) is a deliberate scope difference, not something to chase — CrossBench seeds current-roster-only by design (matches the existing convention already established in `seed-uk.ts`/`seed-us.ts`).

### Decisions Made

- Use Yahoo Finance's own sector taxonomy (not GICS) for `securities.sector` — avoids a permanent translation layer, and it's the free source CrossBench will actually query directly.
- Build CrossBench's own Yahoo Finance lookup wrapper rather than reuse Peez49's CSVs, given the licensing gap.

### Next Steps

- When seeding `committee_sector_relevance` (step 5 of the prerequisites plan), adopt the `Is_General_Jurisdiction` / `Exclude_From_Analysis` distinction and consider capturing `industry` alongside `sector`.
- Not covered by this repo, still CrossBench's own problem: company-name-only security matching for EU, and any UK/EU equivalent jurisdiction mapping.

---