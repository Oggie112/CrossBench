# Political Disclosure Tracker — MVP Design Document

## 1. Overview

A dashboard aggregating public financial disclosure data from government officials across the US, UK, Australia, and the EU Commission, ranked by a "notability" formula rather than a return-prediction model. The product answers *"what should I be watching"*, not *"what should I buy"*.

**Positioning relative to existing tools** (Capitol Trades, Quiver Quantitative, Unusual Whales): those are single-country (US) trade lists. The differentiator here is cross-jurisdiction confirmation — flagging when multiple governments' senior officials independently concentrate in the same sector, which none of the incumbents currently surface.

## 2. Scope

### In scope for MVP
- **Data sources**: US (Congress, trade-level), UK (Commons register, threshold-crossing), Australia (register, threshold-crossing), EU Commission (Commissioners' declarations, threshold-crossing).
- **Pages**: homepage (top-5 leaderboard + US/global teasers), `/us` (filterable feed), `/global` (UK/AU/EU Commission feed).
- **Ranking formula**: SQL-computed `signal_score`, zero external API cost.
- **Backtest**: event-study methodology across multiple basket sizes, benchmarked against S&P 500.

### Explicitly out of scope for MVP
- Germany, France, Italy, Spain, Portugal, Poland, Ireland, New Zealand, Canada — see §3 for why each was rejected or deferred.
- Options payoff simulation (strike/expiry-level backtesting).
- Public-facing API with its own auth/rate-limiting.
- Policy/regulatory "noise" tracking (UK/EU green energy, AI, defense announcements).

### Stretch goals (v2+)
1. Notable-options panel on homepage (build before a full `/options` page — cheaper, faster signal).
2. Dedicated `/options` page with its own leaderboard, once volume justifies it.
3. Official and stock profile pages (`/officials/[id]`, `/stocks/[ticker]`).
4. Policy/regulatory noise tracker — free RSS + keyword tagging (gov.uk, EU press corner), no LLM cost.
5. Germany/France/Italy tier — LLM-assisted PDF extraction. Explicitly the one component with a real per-use cost; build only after the free four-source version proves the concept.
6. Empirical formula re-weighting using free Stooq EOD data once enough backtest history has accumulated.
7. Public API exposure via Supabase's auto-generated REST layer (near-zero extra work when the time comes).

## 3. Country feasibility summary

| Country | Tier | Cadence | Format | Verdict |
|---|---|---|---|---|
| US | 1 (trade-level) | 30–45 days per transaction | Official bulk ZIP + form PDFs | **In scope** |
| UK | 2 (threshold) | 28 days on change | Structured, Open Parliament Licence API | **In scope** |
| Australia | 2 (threshold) | 28 days on change | Structured register | **In scope** |
| EU Commission | 2 (threshold) | Periodic | Machine-readable ZIP | **In scope** |
| Germany, France, Italy | 3 (snapshot) | Annual/on-mandate | Free-text PDF | Deferred — real cost (LLM extraction), no timing signal |
| Spain | Unclear | Immediate on change | Format unconfirmed | Deferred — needs a technical spike before committing |
| Portugal | — | — | Actively broken post-2024 ("data unavailable due to professional secrecy") | Rejected |
| Poland | — | — | No evidence of structured access | Rejected |
| Ireland | — | Annual | PDF/Word only, no bulk data | Rejected |
| New Zealand | — | Annual | PDF only, no dollar values disclosed | Rejected |
| Canada | — | — | Cabinet-level officials structurally barred from holding stocks (blind trust mandatory) | Rejected — no data exists to capture |

## 4. Legal and compliance — flagged, not resolved

This project may become commercial, so these need a proper legal read before monetizing, not just my summary. Flagging clearly rather than assuming they're fine:

- **UK Parliament data (Open Parliament Licence)**: explicitly permits commercial exploitation with attribution. Clean.
- **US House/Senate financial disclosures**: governed by the Ethics in Government Act (5 U.S.C. app. § 105(c)), not just a website ToS. The House's own disclosure page states the data may not be used for **any commercial purpose**, with one exception: "news and communications media for dissemination to the general public." A transparency dashboard plausibly fits that exception — it's how Capitol Trades, Quiver, and Unusual Whales justify operating commercially on the same data — but that's a gray reading, not a confirmed clearance. **Get a proper legal opinion before adding ads, subscriptions, or any paid tier.**
- **Australia and EU Commission**: not deeply verified in this round — treat as an open item, lower assumed risk since both are government transparency initiatives similar in spirit to the UK model, but don't assume without checking.
- **Hosting**: Vercel's Hobby plan restricts to "non-commercial, personal use only." If the US data question resolves favorably for commercial use, hosting needs to move to Pro ($20/month) at the same time — the two decisions are linked, not independent.

**Action item**: before any monetization step, get the US commercial-use question answered properly (a real legal consultation, not a web search), and re-confirm the Australia/EU Commission licensing at the same time.

## 5. Data architecture

### Core schema

```sql
-- who
create table officials (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  country text not null,
  chamber text not null,
  party text,
  current_office text,
  external_ids jsonb default '{}'
);

create table committees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  chamber text not null
);

create table official_committee_memberships (
  official_id uuid references officials(id),
  committee_id uuid references committees(id),
  role text,
  start_date date,
  end_date date,
  primary key (official_id, committee_id, start_date)
);

create table committee_sector_relevance (
  committee_id uuid references committees(id),
  sector text not null,
  weight numeric not null check (weight between 0 and 1),
  primary key (committee_id, sector)
);

-- what
create table securities (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  primary_ticker text,
  primary_exchange text,
  sector text,
  isin text
);

create table security_identifiers (
  security_id uuid references securities(id),
  identifier_type text not null,       -- 'ticker' | 'isin' | 'name_alias'
  identifier_value text not null,
  context text
);
-- Populated manually as securities appear. Not worth automating at MVP scale (a few
-- hundred distinct names in year one).

-- ingestion staging
create table raw_documents (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  source_name text not null,
  source_ref text not null,
  fetched_at timestamptz default now(),
  storage_path text,                   -- deliberately unused at MVP — see note below
  processed boolean default false,
  processing_error text,
  unique (source_name, source_ref)
);
-- Don't persist source PDFs to Storage: parse and discard, keep only extracted fields
-- plus source_url. Keeps the project well inside the 500MB/1GB free-tier caps indefinitely.

-- the canonical, heterogeneous table
create table disclosure_events (
  id uuid primary key default gen_random_uuid(),
  official_id uuid references officials(id),
  security_id uuid references securities(id),
  raw_security_text text,
  country text not null,
  disclosure_type text not null,        -- 'transaction' | 'holding_change' | 'holding_snapshot'
  transaction_type text,                -- 'buy' | 'sell' | 'exchange'
  instrument_type text default 'equity',-- 'equity' | 'option_call' | 'option_put' | 'bond' | 'other'
  transaction_date date,
  notification_date date,
  amount_min numeric,
  amount_max numeric,
  value_band text,
  as_of_date date,
  source_document_id uuid references raw_documents(id),
  confidence text default 'high',       -- flags any future LLM-extracted rows
  created_at timestamptz default now()
);

create table ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  started_at timestamptz,
  finished_at timestamptz,
  records_fetched int,
  records_new int,
  status text,
  error_message text
);
```

### Ingestion pipeline

```
US (House ZIP + Senate eFD)  ─┐
UK (Parliament API)          ─┼─▶ Source adapters ─▶ raw_documents ─▶ disclosure_events
Australia (register)         ─┤       (daily,            (staging)      (canonical)
EU Commission (ZIP)          ─┘   Vercel Cron, staggered)
```

- Common `SourceAdapter` interface (`fetch()` + `parse()`) so orchestration doesn't care which country it's talking to.
- One Vercel Cron job per source, staggered start times, once/day (Hobby plan limit — matches the actual disclosure cadence anyway).
- Idempotency via `unique(source_name, source_ref)` on `raw_documents`. US has a real filing ID to key on; UK/AU/EU Commission use a hash of `official + content + publish_date`.
- **Senate has no official bulk API** (only a scrapeable search portal, unlike House's clean daily ZIP) — treat as the most failure-prone adapter, design it to degrade gracefully rather than block the rest of the pipeline.
- No alerting on cron failures on free tiers — mitigate with a "data last updated" indicator computed from `ingestion_runs`, shown in the site footer. Zero cost, makes staleness visible.

## 6. Ranking formula

```sql
create materialized view mv_trade_size_score as
select
  id as disclosure_event_id,
  percent_rank() over (
    partition by country, disclosure_type
    order by coalesce(amount_max, amount_min, 0)
  ) as size_percentile
from disclosure_events;

create materialized view mv_cluster_score as
select
  security_id,
  count(distinct official_id) as distinct_officials_90d
from disclosure_events
where transaction_date >= current_date - interval '90 days'
group by security_id;

create materialized view mv_signal_scores as
select
  de.id as disclosure_event_id,
  de.official_id,
  de.security_id,
  de.country,
  de.instrument_type,
  de.transaction_date,
  ts.size_percentile,
  coalesce(csr.weight, 0) as committee_relevance,
  coalesce(cl.distinct_officials_90d, 1) as cluster_count,
  case when cx.country_count > 1 then 1 else 0 end as cross_jurisdiction_flag,
  (
    (0.30 * ts.size_percentile
       * case when de.instrument_type in ('option_call','option_put') then 2 else 1 end)
    + (0.25 * coalesce(csr.weight, 0))
    + (0.25 * least(coalesce(cl.distinct_officials_90d, 1) / 5.0, 1.0))
    + (0.20 * case when cx.country_count > 1 then 1 else 0 end)
  ) as signal_score
from disclosure_events de
join mv_trade_size_score ts on ts.disclosure_event_id = de.id
left join official_committee_memberships ocm on ocm.official_id = de.official_id
left join committee_sector_relevance csr
  on csr.committee_id = ocm.committee_id
  and csr.sector = (select sector from securities where id = de.security_id)
left join mv_cluster_score cl on cl.security_id = de.security_id
left join (
  select security_id, count(distinct country) as country_count
  from disclosure_events
  where transaction_date >= current_date - interval '90 days'
  group by security_id
) cx on cx.security_id = de.security_id;
```

**Design notes:**
- The 0.30/0.25/0.25/0.20 split is a starting heuristic, not empirically derived. Refine using backtest results (§7) once enough history accumulates — don't tune against a small early sample.
- Options get a 2× multiplier on the size-percentile component, reflecting leverage. Puts should be weighted at least as high as calls, arguably higher — betting against a stock carries more reputational risk for an official than a routine call/equity buy, so a disclosed put is more likely to reflect genuine conviction.
- This is a **notability score, not a return prediction** — frame it that way in the UI copy to stay clear of anything reading as investment advice.
- Refresh via the same daily cron that runs ingestion — no separate job needed.

## 7. Backtesting methodology

Structured as an event study: virtual entry the first time a security enters a ranked basket, hold for a fixed window, compare to benchmark.

```sql
create table backtest_positions (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid references disclosure_events(id),
  security_id uuid references securities(id),
  basket_size int not null,             -- 5, 20, or 50
  rank_at_entry int,
  entry_date date not null,
  entry_price numeric,
  hold_days int not null,               -- 60 or 90
  exit_date date,
  exit_price numeric,
  benchmark_entry_price numeric,
  benchmark_exit_price numeric,
  raw_return_pct numeric,
  excess_return_pct numeric,            -- raw_return minus benchmark_return
  created_at timestamptz default now()
);

create table signal_score_history (
  id uuid primary key default gen_random_uuid(),
  disclosure_event_id uuid references disclosure_events(id),
  computed_at date not null,
  signal_score numeric not null,
  formula_version text not null,        -- bump when weights change; never recompute history
  unique (disclosure_event_id, computed_at)
);
```

**Rules:**
1. **No lookahead bias** — enter at the next available close *after the disclosure is filed*, not the transaction date (which can be 30–45 days earlier and wasn't public knowledge yet).
2. **Never recompute history** — `signal_score_history` is append-only. If the formula weights change, that's a new `formula_version`, not a retroactive rewrite. This is what makes the backtest reproducible.
3. **Benchmark every position against the S&P 500**, not raw return. A stock up 8% while the index is up 10% is underperformance, not a win. Acceptable simplification for v1: benchmark everything against the S&P 500 even for UK/AU/EU names — the test is "is this a useful attention signal," not "which local index applies."
4. **Test three basket sizes (top 5 / top 20 / top 50), independently** — a security can enter top 50 weeks before it reaches top 5, so track entry per basket size, not as one event with three labels. This turns the test into a dose-response check: if the formula carries real signal, excess return should decay from top 5 → top 20 → top 50. If the three come back indistinguishable, that's the honest result telling you the ranking isn't adding much.
5. **Don't simulate options payoffs** — strike/expiry aren't reliably disclosed, and building options-pricing math (Black-Scholes, implied vol) isn't worth it for this. Backtest options-originated signals at the underlying stock level, tagged by `instrument_type`, and report equity vs. options-originated performance separately in the UI rather than trying to model leveraged returns.
6. **Sample size caveat** — top 5 will accumulate the fewest positions for a long time. Report win rate and average excess return honestly, but resist re-tuning formula weights against an early small sample — that's overfitting to noise, not signal.

Price data: free Stooq daily EOD CSVs, no key required.

## 8. Frontend

**Pages:**
- `/` — homepage. Top-5 leaderboard from `mv_signal_scores`, teaser panels for "US activity this week" and "Notable positions — UK/AU/EU Commission," plus a small always-visible "notable options activity" list (build before a full `/options` page).
- `/us` — filterable table (chamber, party, committee, ticker, equity/options type chip), backed directly by `disclosure_events`.
- `/global` — UK/AU/EU Commission threshold crossings, framed as "notable position changes," not "trades."

**API shape**: no separate API layer for v1. Next.js Server Components query Supabase directly via generated TypeScript types. Supabase already auto-generates a REST layer over the schema — exposing it publicly later (stretch goal) is an afternoon of auth/rate-limiting work, not a new service.

**Charting**: Recharts for the routine 80% (leaderboard bars, score-over-time lines, sector volume). Reach for visx (React-native wrapper around D3's primitives — avoids the DOM-ownership conflict of running raw D3 alongside React) only for bespoke visuals like a cluster-detection network graph, as a later differentiator. Skip Observable Plot — better suited to static exploratory charts than the filtering/interactivity these pages need.

Options are shown via a type filter and a visual badge (▲ Call / ▼ Put) wherever a disclosure appears — homepage, `/us`, backtest results — rather than a dedicated page at MVP stage.

## 9. Tech stack

Consistent with existing projects (Snacksby, C58) — same stack for a third project, no new learning-curve cost:

- Next.js (App Router) + TypeScript
- Supabase (Postgres + pg_cron + Storage + RLS)
- Vercel (Hobby tier — revisit if the commercial-use question resolves favorably)
- Tailwind CSS
- Recharts (+ visx for stretch visuals)

## 10. Cost verification (as checked)

| Component | Free tier limit | Fit |
|---|---|---|
| Vercel Cron | 100 jobs/project, once/day each, imprecise timing | Matches actual disclosure cadence — no issue |
| Vercel Hobby | 100GB transfer, 1M function invocations/month | Ample for MVP traffic |
| Supabase DB | 500MB | Trivial for this row count if PDFs aren't stored |
| Supabase pause | Auto-pauses after 7 days idle | Solved as a side effect of daily cron activity |
| pg_cron | Available on free tier | Confirmed |
| US data | Official House ZIP / Senate eFD scrape | Free, no key, avoid FMP's congress endpoints (unclear if actually included in their free tier despite general marketing) |
| Price data (backtest) | Stooq daily EOD CSV | Free, no key |

## 11. Known risks / open items

- US commercial-use legal question (§4) — needs a real answer before monetizing.
- Australia/EU Commission licensing — not deeply verified, treat as open.
- Senate eFD scraping robustness — no official bulk source, monitor closely.
- Spain — potentially promising (immediate-on-change disclosure) but needs a technical spike to confirm data format before committing engineering time.
- 500MB Supabase cap — non-issue now, revisit in ~2 years as data accumulates.
