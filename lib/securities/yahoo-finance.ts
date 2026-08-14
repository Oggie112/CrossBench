const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";

export interface SecurityMatch {
	symbol: string;
	name: string;
	sector: string | null;
	industry: string | null;
}

interface YahooSearchQuote {
	symbol: string;
	longname?: string;
	shortname?: string;
	quoteType: string;
	sector?: string;
	industry?: string;
}

interface YahooSearchResponse {
	quotes: YahooSearchQuote[];
}

// Yahoo's quoteSummary/assetProfile endpoint (what the yfinance Python
// library wraps) now requires a session crumb and rejects anonymous
// requests - confirmed directly, "Invalid Crumb" on a plain fetch. The
// search endpoint doesn't require one and returns sector/industry inline
// on equity results, so it covers both the ticker and company-name cases
// without needing crumb/cookie handling at all.
async function search(query: string): Promise<SecurityMatch[]> {
	const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
	const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
	if (!response.ok) throw new Error(`Yahoo Finance search failed: ${response.status} ${response.statusText}`);

	const data: YahooSearchResponse = await response.json();
	return (data.quotes ?? [])
		.filter((q) => q.quoteType === "EQUITY")
		.map((q) => ({
			symbol: q.symbol,
			name: q.longname ?? q.shortname ?? q.symbol,
			sector: q.sector ?? null,
			industry: q.industry ?? null,
		}));
}

export async function lookupByTicker(ticker: string): Promise<SecurityMatch | null> {
	const results = await search(ticker);
	const exact = results.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase());
	return exact ?? results[0] ?? null;
}

// Legal-entity suffixes don't always match Yahoo's stored name exactly and
// can suppress an otherwise-real match - confirmed directly: "Erste Group
// AG" (the literal text from a real EU disclosure) returns nothing, but
// "Erste Group" alone correctly resolves to Erste Group Bank AG (EBS.VI).
// Retry with the suffix stripped before concluding there's no coverage.
const LEGAL_SUFFIX_PATTERN = /\s+(AG|S\.?A\.?|PLC|Ltd\.?|Limited|Inc\.?|Corp\.?|SE|N\.?V\.?|GmbH)\.?$/i;

export async function lookupByName(companyName: string): Promise<SecurityMatch | null> {
	const direct = await search(companyName);
	if (direct.length > 0) return direct[0];

	const stripped = companyName.replace(LEGAL_SUFFIX_PATTERN, "").trim();
	if (stripped === companyName) return null;

	const retried = await search(stripped);
	return retried[0] ?? null;
}