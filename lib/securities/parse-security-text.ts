export interface ParsedSecurity {
	ticker?: string;
	cusip?: string;
	canonicalName: string;
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

// Matches a trailing "(CODE)" group regardless of what precedes it - covers
// plain tickers, CUSIPs, and multi-paren strings like "...Sponsored ADR
// (Spain) (SAN)" (only the final group is a candidate) or option/structured-
// note text with unrelated parenthetical noise earlier in the string.
const TRAILING_CODE_PATTERN = /\s*\(([0-9A-Z.]{1,10})\)\s*$/;
const TICKER_PATTERN = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;
const CUSIP_PATTERN = /^[0-9A-Z]{9}$/;

// One parser shared across every source (US House/Senate, EU, UK) rather
// than per-source variants - EU/UK text has no trailing "(CODE)" at all, so
// it degrades to the name-only fallback automatically. Senate's raw text has
// heavy embedded newlines/whitespace around Rate/Coupon and Option Type
// blocks, but whitespace-collapsing first means the same trailing-group
// regex still finds the real ticker regardless of what's between it and the
// company name.
export function parseSecurityText(raw: string): ParsedSecurity {
	const cleaned = collapseWhitespace(raw);
	const match = cleaned.match(TRAILING_CODE_PATTERN);
	if (!match || match.index === undefined) return { canonicalName: cleaned };

	const code = match[1];
	const nameWithoutCode = cleaned.slice(0, match.index).trim() || cleaned;

	if (TICKER_PATTERN.test(code)) return { ticker: code, canonicalName: nameWithoutCode };
	if (CUSIP_PATTERN.test(code)) return { cusip: code, canonicalName: nameWithoutCode };

	// Trailing group didn't look like a ticker or CUSIP (e.g. a country name
	// or annotation) - keep the full original text, nothing to strip.
	return { canonicalName: cleaned };
}

// Same-security text varies by case ("Madison Conn GO BD" vs "Madison Conn
// Go Bd") without being a different security - fold case/whitespace only.
// Never touch substantive content (dates, coupon %), since those are what
// actually distinguish otherwise-identical-looking bonds at different
// maturities ("US TSY NOTE 02/15/34" vs "US TSY NOTE 02/15/35").
export function normalizeNameAlias(name: string): string {
	return collapseWhitespace(name).toLowerCase();
}
