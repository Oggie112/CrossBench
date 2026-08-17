import { supabaseAdmin } from "../supabase";

// One-off backfill for the UK amount_min parsing added to uk.ts's parse() -
// existing disclosure_events rows were inserted before that change, and UK
// dedups on the Parliament API's own interest.id (a real, stable filing ID),
// so re-running ingestion never re-parses already-stored raw_documents.
// Duplicates the adapter's parseAmountMin logic rather than importing it,
// since this reads from disclosure_events.value_band (already-parsed text),
// not the raw API response the adapter works from.
const PERCENTAGE_BAND_ANCHOR = 70000;

function parseAmountMin(band: string | null): number | undefined {
	if (!band) return undefined;
	const poundMatch = band.match(/£([\d,]+)/);
	if (poundMatch) return Number(poundMatch[1].replace(/,/g, ""));
	if (/%/.test(band)) return PERCENTAGE_BAND_ANCHOR;
	return undefined;
}

async function main() {
	const { data: rows, error } = await supabaseAdmin
		.from("disclosure_events")
		.select("id, value_band, amount_min")
		.eq("country", "UK")
		.is("amount_min", null);
	if (error) throw error;

	console.log(`Found ${rows.length} UK rows with null amount_min.`);

	let updated = 0;
	for (const row of rows) {
		const amountMin = parseAmountMin(row.value_band);
		if (amountMin === undefined) {
			console.log(`Skipping ${row.id} - unrecognized value_band: ${JSON.stringify(row.value_band)}`);
			continue;
		}

		const { error: updateError } = await supabaseAdmin
			.from("disclosure_events")
			.update({ amount_min: amountMin })
			.eq("id", row.id);
		if (updateError) throw updateError;
		updated++;
	}

	console.log(`Updated ${updated} rows.`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});