import { euAdapter, extractDeclarationDate } from "../adapters/eu";
import { supabaseAdmin } from "../supabase";

// One-off backfill for the notificationDate extraction added to eu.ts's
// parse() - existing disclosure_events rows were inserted before that
// change, and EU dedups on a content hash (see cleanup-eu-duplicates.ts),
// so re-running ingestion never re-parses already-stored raw_documents.
async function main() {
	const documents = await euAdapter.fetch();
	const dateBySlug = new Map<string, string>();
	for (const doc of documents) {
		const { xml, commissionerSlug } = doc.content as { xml: string; commissionerSlug: string };
		const date = extractDeclarationDate(xml);
		if (date) dateBySlug.set(commissionerSlug, date);
	}
	console.log(`Extracted declaration dates for ${dateBySlug.size}/${documents.length} commissioners.`);

	const { data: rows, error } = await supabaseAdmin
		.from("disclosure_events")
		.select("id, source_document_id, raw_documents!inner(source_ref)")
		.eq("country", "EU")
		.is("notification_date", null);
	if (error) throw error;

	console.log(`Found ${rows.length} EU rows with null notification_date.`);

	let updated = 0;
	for (const row of rows) {
		const sourceRef = (row as unknown as { raw_documents: { source_ref: string } }).raw_documents.source_ref;
		const slug = sourceRef.split("_").slice(0, -1).join("_");
		const date = dateBySlug.get(slug);
		if (!date) {
			console.log(`Skipping ${row.id} - no declaration date found for slug "${slug}"`);
			continue;
		}

		const { error: updateError } = await supabaseAdmin
			.from("disclosure_events")
			.update({ notification_date: date })
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