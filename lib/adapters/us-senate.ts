import type { InstrumentType, ParsedDisclosure, RawDocument, SourceAdapter, TransactionType } from "./source-adapter";

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

function mapTransactionType(text: string): TransactionType {
	if (text.startsWith("Purchase")) return "buy";
	if (text.startsWith("Sale")) return "sell";
	if (text.startsWith("Exchange")) return "exchange";
	throw new Error(`Unrecognized transaction type: "${text}"`);
}

// Verified against all 191 real Senate records in one snapshot of the data:
// "Stock" | "Corporate Bond" | "Municipal Security" - no options example
// observed, so there's no evidence-backed string to map to option_call/
// option_put. Unrecognized values fall through to "other" rather than
// guessing at a specific label.
function mapInstrumentType(assetType: string): InstrumentType {
	switch (assetType) {
		case "Stock":
			return "equity";
		case "Corporate Bond":
		case "Municipal Security":
			return "bond";
		default:
			return "other";
	}
}

function rawSecurityText(trade: KadoaTrade): string {
	return trade.ticker ? `${trade.asset_name} (${trade.ticker})` : trade.asset_name;
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
				officialExternalId: trade.filer_id,
				rawSecurityText: rawSecurityText(trade),
				country: "US",
				disclosureType: "transaction",
				transactionType: mapTransactionType(trade.transaction_type),
				instrumentType: mapInstrumentType(trade.asset_type),
				transactionDate: trade.transaction_date,
				notificationDate: trade.filing_date,
				amountMin: trade.amount_range_low,
				amountMax: trade.amount_range_high,
				confidence: "high",
			},
		];
	},
};
