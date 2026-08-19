import { supabaseAdmin } from "../supabase";
import { insertIdentifier, lookupTickerOwner, YAHOO_LOOKUP_CONTEXT } from "./security-identifiers";

// One-off enrichment for securities created before the Yahoo-lookup branch
// landed in resolve-securities.ts - those rows were resolved via name_alias
// only, with primary_ticker left null even where a real ticker exists.
// Scoped to UK/EU specifically (not "any security with primary_ticker IS
// NULL" globally) - that broader query would also catch US CUSIP-identified
// bonds/Treasuries, which have no ticker by design, and running Yahoo's
// equity search against bond text would be pointless.
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST_DELAY_MS = 200;

interface SecurityRow {
	id: string;
	canonical_name: string;
}

async function fetchCandidates(): Promise<SecurityRow[]> {
	const { data: ukEuDisclosures, error: discError } = await supabaseAdmin
		.from("disclosure_events")
		.select("security_id")
		.in("country", ["UK", "EU"])
		.not("security_id", "is", null);
	if (discError) throw discError;

	const securityIds = [...new Set(ukEuDisclosures.map((d) => d.security_id as string))];
	if (securityIds.length === 0) return [];

	const { data: securities, error: secError } = await supabaseAdmin
		.from("securities")
		.select("id, canonical_name")
		.in("id", securityIds)
		.is("primary_ticker", null);
	if (secError) throw secError;

	return securities;
}

async function main() {
	console.log("Fetching UK/EU securities missing a primary_ticker...");
	const rows = await fetchCandidates();
	console.log(`${rows.length} candidates`);

	let enriched = 0;
	let noCoverage = 0;
	let conflicts = 0;

	for (const row of rows) {
		const lookup = await lookupTickerOwner(row.canonical_name);
		await sleep(REQUEST_DELAY_MS);

		if (!lookup) {
			noCoverage++;
			continue;
		}

		if (lookup.existingSecurityId && lookup.existingSecurityId !== row.id) {
			console.warn(
				`Conflict: "${row.canonical_name}" (${row.id}) resolves to ticker ${lookup.symbol}, ` +
					`already owned by security ${lookup.existingSecurityId} - skipping, no automatic merge.`,
			);
			conflicts++;
			continue;
		}

		const { error: updateError } = await supabaseAdmin
			.from("securities")
			.update({ primary_ticker: lookup.symbol })
			.eq("id", row.id);
		if (updateError) throw updateError;

		if (!lookup.existingSecurityId) {
			await insertIdentifier(row.id, "ticker", lookup.symbol, YAHOO_LOOKUP_CONTEXT);
		}

		enriched++;
	}

	console.log(`${enriched} enriched with a real ticker, ${noCoverage} with no Yahoo coverage, ${conflicts} conflicts skipped`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});