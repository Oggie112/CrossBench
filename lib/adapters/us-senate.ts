import type { InstrumentType, ParsedDisclosure, RawDocument, SourceAdapter, TransactionType } from "./source-adapter";
import { nameSlug } from "./name-slug";

// Senate trades aren't fetched from efdsearch.senate.gov directly - that site
// runs adaptive/behavioral bot protection that a plain adapter can't reliably
// clear (confirmed via direct testing, see docs/roadmaps/mvp.md 2ADP.6).
// kadoa-org/congress-trading-monitor already does this scraping at a scale
// this project isn't taking on, and publishes the result as free, unauthenticated,
// daily-refreshed static JSON under an MIT license.
const TRADES_URL = "https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data/trades.json";

interface KadoaTrade {
	id: string;
	transaction_date: string;
	filing_date: string;
	owner: string | null;
	ticker: string | null;
	asset_name: string;
	asset_type: string;
	transaction_type: string;
	amount_range_low: number;
	amount_range_high: number;
	filer_id: string;
	filer_name: string;
	chamber: string;
}

// kadoa's own filer_id slug is undocumented and internally inconsistent
// (e.g. "senate_a_mitchell" vs "senate_shelleym_capito" - not a stable
// first/last split) - reversing it reliably isn't possible. filer_name is a
// clean display name instead; splitting on first/last word (dropping any
// middle name/initial) mirrors what the House adapter's PDF-parsed
// first/last fields already do, so both adapters produce the same slug format.
function splitFullName(fullName: string): { first: string; last: string } {
	const parts = fullName.trim().split(/\s+/);
	return { first: parts[0], last: parts[parts.length - 1] };
}

function mapTransactionType(text: string): TransactionType {
	if (text.startsWith("Purchase")) return "buy";
	if (text.startsWith("Sale")) return "sell";
	if (text.startsWith("Exchange")) return "exchange";
	throw new Error(`Unrecognized transaction type: "${text}"`);
}

// "Stock Option" confirmed against a real filing (Williams Companies, Inc.,
// filed 2026-07-21) - asset_name embeds "Option Type: Call|Put" text rather
// than exposing it as its own field, same pattern as the House adapter's
// descriptionText. Only a Call example has been seen so far; the Put branch
// is untested against real data.
function mapInstrumentType(assetType: string, assetName: string): InstrumentType {
	switch (assetType) {
		case "Stock":
			return "equity";
		case "Corporate Bond":
		case "Municipal Security":
			return "bond";
		case "Stock Option":
			return /Option Type:\s*Put/i.test(assetName) ? "option_put" : "option_call";
		default:
			return "other";
	}
}

function rawSecurityText(trade: KadoaTrade): string {
	if (!trade.ticker) return trade.asset_name;

	// asset_name already ends with "(TICKER)" for ~40% of real trades (e.g.
	// ADRs) - verified against the live feed. Appending unconditionally
	// duplicated it, e.g. "Sodexo ADR (SDXAY) (SDXAY)".
	const suffix = `(${trade.ticker})`;
	const alreadyPresent = trade.asset_name.trim().toUpperCase().endsWith(suffix.toUpperCase());
	return alreadyPresent ? trade.asset_name : `${trade.asset_name} ${suffix}`;
}

export const usSenateAdapter: SourceAdapter = {
	sourceName: "us_senate_kadoa",
	country: "US",

	async fetch(knownSourceRefs?: ReadonlySet<string>): Promise<RawDocument[]> {
		const response = await fetch(TRADES_URL);
		if (!response.ok) {
			throw new Error(`Kadoa trades fetch failed: ${response.status} ${response.statusText}`);
		}

		const trades = (await response.json()) as KadoaTrade[];

		const documents: RawDocument[] = [];
		for (const trade of trades) {
			if (trade.chamber !== "senate") continue;
			if (knownSourceRefs?.has(trade.id)) continue;

			documents.push({
				sourceName: "us_senate_kadoa",
				sourceRef: trade.id,
				country: "US",
				content: trade,
			});
		}

		return documents;
	},

	async parse(document: RawDocument): Promise<ParsedDisclosure[]> {
		const trade = document.content as KadoaTrade;

		return [
			{
				officialExternalId: nameSlug(splitFullName(trade.filer_name)),
				rawSecurityText: rawSecurityText(trade),
				country: "US",
				disclosureType: "transaction",
				transactionType: mapTransactionType(trade.transaction_type),
				instrumentType: mapInstrumentType(trade.asset_type, trade.asset_name),
				transactionDate: trade.transaction_date,
				notificationDate: trade.filing_date,
				amountMin: trade.amount_range_low,
				amountMax: trade.amount_range_high,
				confidence: "high",
			},
		];
	},
};
