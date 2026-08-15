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

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Yahoo's quoteSummary/assetProfile endpoint (what the yfinance Python
// library wraps) now requires a session crumb and rejects anonymous
// requests - confirmed directly, "Invalid Crumb" on a plain fetch. The
// search endpoint doesn't require one and returns sector/industry inline
// on equity results, so it covers both the ticker and company-name cases
// without needing crumb/cookie handling at all.
//
// Confirmed directly under real bulk load: a plain ECONNRESET partway
// through ~1500 sequential requests, not a clean HTTP error - this is an
// unofficial endpoint and needs to be treated as flaky, not just rate-
// limited. Retries transient network failures with backoff; a real HTTP
// error status still throws immediately, since that's not a "try again"
// situation.
async function search(query: string): Promise<SecurityMatch[]> {
	const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;

	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
		} catch (err) {
			lastError = err;
			if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt);
			continue;
		}

		if (!response.ok) throw new Error(`Yahoo Finance search failed: ${response.status} ${response.statusText}`);
		return parseQuotes(await response.json());
	}

	throw new Error(`Yahoo Finance search failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
}

function parseQuotes(data: YahooSearchResponse): SecurityMatch[] {
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