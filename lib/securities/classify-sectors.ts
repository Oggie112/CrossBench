import { supabaseAdmin } from "../supabase";
import { lookupByTicker, lookupByName } from "./yahoo-finance";

interface SecurityRow {
	id: string;
	canonical_name: string;
	primary_ticker: string | null;
}

async function fetchUnclassified(): Promise<SecurityRow[]> {
	const rows: SecurityRow[] = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabaseAdmin
			.from("securities")
			.select("id, canonical_name, primary_ticker")
			.is("sector", null)
			.range(from, from + pageSize - 1);
		if (error) throw error;
		rows.push(...data);
		if (data.length < pageSize) break;
		from += pageSize;
	}
	return rows;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Confirmed directly: hammering Yahoo's search endpoint with ~1500 back-to-
// back requests got a raw ECONNRESET partway through, not a clean rate-limit
// response. A fixed pace between requests is the bulk-caller's
// responsibility, not the wrapper's - retry-with-backoff in yahoo-finance.ts
// handles transient failures, this just reduces how often they happen.
const REQUEST_DELAY_MS = 200;

async function main() {
	console.log("Fetching securities without a sector...");
	const rows = await fetchUnclassified();
	console.log(`${rows.length} securities to classify`);

	let classified = 0;
	let noCoverage = 0;

	for (const [index, row] of rows.entries()) {
		const match = row.primary_ticker
			? await lookupByTicker(row.primary_ticker)
			: await lookupByName(row.canonical_name);

		if (!match || !match.sector) {
			noCoverage++;
		} else {
			const { error } = await supabaseAdmin
				.from("securities")
				.update({ sector: match.sector, industry: match.industry })
				.eq("id", row.id);
			if (error) throw new Error(`Failed to classify security ${row.id}: ${error.message}`);
			classified++;
		}

		if ((index + 1) % 100 === 0) console.log(`  ${index + 1}/${rows.length} processed...`);
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(`${classified} securities classified, ${noCoverage} with no Yahoo Finance coverage (left null)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
