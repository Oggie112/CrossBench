# CrossBench — Design Direction

## Concept

Every competitor in this space (Capitol Trades, Unusual Whales, Quiver) uses the same
visual language: black/near-black background, single acid accent, monospace tickers.
It reads as "generic fintech" regardless of what the product actually tracks.

CrossBench tracks something specific: politicians' trades, across chambers, across
countries. The subject *is* the chamber. So the design leans into the literal
architecture of a legislature — benches, ledgers, division records, the physical act
of a seating arrangement — and uses jurisdiction as a first-class visual signal rather
than a filter buried in a dropdown.

The name already does the work: a crossbencher sits unaligned, between government and
opposition. The UI's job is to feel like that seat — informed, independent, slightly
removed from the parties it's watching.

**What this is not:** a museum piece. No parchment-and-quill pastiche, no wallpaper
texture on every panel. The material references (wood, brass, bench-green) show up as
disciplined accents on an interface that otherwise stays as clean and fast to scan as
any trading dashboard needs to be.

---

## Color

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#221B14` | Primary text, dark wood base — never pure black |
| `--paper` | `#F3EEE2` | Light-mode background — aged order-paper, not white |
| `--bench` | `#2F4A3C` | Primary brand color — Commons bench green, muted not neon |
| `--bench-dark` | `#1A2E24` | Dark-mode surface / header bands |
| `--brass` | `#B08D4F` | Dividers, rules, active-state underlines, focus rings |
| `--division-red` | `#8C3B2E` | Alerts, "no" votes, high-conflict scores — used sparingly |

Jurisdiction tags (functional color, not decorative — same green/brown system stays
dominant, these only appear on tags and small flags):

| Jurisdiction | Hex | Reference |
|---|---|---|
| UK | `#2F4A3C` | Commons green (doubles as brand primary) |
| US | `#1F3A5F` | Senate carpet blue |
| EU | `#2451A3` | EU cobalt |
| Australia | `#6B2C2C` | Australian Senate red |

Dark mode inverts `--ink`/`--paper` but keeps `--bench` and `--brass` fixed — the
brand color should not shift with theme, the way a physical bench doesn't change color
under different lighting.

**Explicitly avoid:** pure black (`#000`) backgrounds, pure white cards, neon green,
and the warm-cream-plus-terracotta combination that's become its own AI-generated
default — this palette is close to cream+earth-tone territory, so the greens and
brass have to stay load-bearing, not just decorative, to read as intentional.

---

## Typography

- **Display — Fraunces** (variable, optical size high, weight 500–600, slight
  negative tracking). Old-style figures, real texture at large sizes. Used for page
  titles and official names. Used with restraint — one or two instances per screen,
  not every heading.
- **Body — Source Serif 4.** Reads like a Hansard transcript at paragraph size, but
  is a working UI serif with good hinting at small sizes for descriptions, bios,
  methodology text.
- **UI / Data — IBM Plex Mono.** All figures live here: trade sizes, dates, scores,
  tickers, timestamps. Tabular numerals on. This is what gives the ledger feeling —
  numbers that line up like an actual disclosure filing, not a dashboard widget.
- **Interface chrome (nav, buttons, labels) — Inter.** Deliberately the "quiet" face:
  nothing about navigation should compete with the serif headlines or the mono data.

Scale: display sizes get generous line-height and slightly loose tracking at large
sizes only; mono data stays dense and tight, no letter-spacing tricks on numbers.

---

## Layout

Base structure: horizontal bands, like rows of benches, rather than a sidebar-heavy
SaaS shell. Content sits in a single-column "order paper" rhythm on mobile, widening
to a two-zone layout on desktop (main record + a slim "today's sitting" rail for
alerts/recent divisions).

```
┌─────────────────────────────────────────────────────┐
│  CROSSBENCH        [UK][US][EU][AU]        Search    │  brass hairline rule below
├─────────────────────────────────────┬───────────────┤
│                                       │  TODAY'S      │
│  TOP 5 — US CONGRESS (ledger table)  │  SITTING      │
│  Member │ Security │ Instrument      │  — alerts     │
│  │ Size │ Score                     │  — high-score │
│  ─────────────────────────────────  │    trades     │
│  rows use hairline brass rules,      │  — new filings│
│  not drop shadows                    │               │
└───────────────────────────────────────┴──────────────┘
```

Cards throughout use a **single hairline brass or ink rule**, not shadows or
border-radius-heavy "floating panel" treatment — the reference is bound paper, not
glassmorphism. Radius stays small and consistent (4–6px) everywhere it's used at all.

*Note: an earlier version of this doc explored a seating-chart-style hero
visualization (dots representing members on a U-shaped arc). Parked for now — not
workable against current data/infrastructure. The ledger table is the primary surface
until a signature visual is revisited.*

*Note (2026-08-27): the ledger table above was originally sketched as a single
cross-jurisdiction ranking — one `Score` column, a per-row `Jurisdiction` tag, UK/US/EU
mixed together. That's no longer the model. `mv_signal_scores` only exists for US
transactions (see the MVP roadmap, `3RNK.9`) — UK and EU disclosures have no comparable
score to sit in that column without either fabricating a number or making an official
who simply isn't measured on this axis look artificially low-signal. The heading now
states scope explicitly (`TOP 5 — US CONGRESS`) instead of implying broader coverage,
and the per-row `Jurisdiction` tag is dropped — every row is US today, so repeating
that per row is dead weight once the header already says so. UK/EU get their own
unranked surfaces (`/global`) rather than a shared score column. Revisit this table's
shape only once a genuinely comparable UK/EU signal exists (`3RNK.10`) — a
cross-jurisdiction indicator on individual rows (not a second score column) is still
planned, since "this US trade's security also appears in another country's
disclosures" is meaningful without needing a second scoring system to exist first.*

---

## Component notes

- **Jurisdiction tags:** small filled pills using the jurisdiction colors above, text
  in `--paper`, always paired with a two-letter code (UK/US/EU/AU) — never color
  alone, for accessibility.
- **Alerts / high-score trades ("Division called"):** use `--division-red` sparingly,
  reserved for genuinely high-conflict-score items, not routine notifications —
  otherwise it dilutes fast.
- **QR codes on printed materials:** render in `--ink` on `--paper`, brass-rule
  border matching the card system, so print pieces feel like the same object family
  as the product rather than a bolted-on marketing insert.
- **Empty states:** written in the interface's own voice, direct and procedural
  ("No filings recorded for this member yet"), not cute.

## Motion

Minimal. Motion is limited to hover/focus state changes under 150ms. No ambient
animation, no parallax. Respect `prefers-reduced-motion` throughout.

## Accessibility floor

- All jurisdiction color coding paired with text/letter codes, never color-only.
- Body text meets WCAG AA against both `--paper` and `--bench-dark` backgrounds —
  verify `--ink` and any white-on-green combinations at implementation time, bench
  green is dark enough for white text but confirm the exact shade used.
- Visible focus rings in `--brass`, not the browser default, on every interactive
  element.